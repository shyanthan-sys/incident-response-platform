import json
import logging
import traceback
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.knowledge.postmortems import seed_postmortems
from app.models.incident import Incident, IncidentStatus
from app.tools.remediation_tools import (
    REMEDIATION_ACTIONS,
    restart_service,
    rollback_deployment,
    scale_up,
)

logger = logging.getLogger(__name__)
settings = get_settings()

REMEDIATION_DEAD_LETTER_KEY = "remediation:dead_letter"

ACTION_TOOL_MAP = {
    "restart_service": restart_service,
    "rollback_deployment": rollback_deployment,
    "scale_up": scale_up,
}


class RemediationFailedError(Exception):
    def __init__(self, message: str, result: dict[str, Any] | None = None):
        super().__init__(message)
        self.result = result or {}


class IncidentStatusConflictError(ValueError):
    """Raised when an action is attempted on an incident that is no longer in the
    required status (e.g. approving an already auto_recovered incident)."""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
async def execute_remediation(action: str, service_name: str) -> dict[str, Any]:
    tool = ACTION_TOOL_MAP[action]
    result = await tool(service_name)
    if not result.get("success"):
        raise RemediationFailedError(result.get("message", "Remediation failed"), result)
    return result


def _incident_to_postmortem(incident: Incident, remediation_result: dict[str, Any]) -> dict:
    action = remediation_result["action"]
    diagnosis_text = incident.diagnosis or "Undiagnosed incident"
    return {
        "title": (
            f"{incident.service_name} incident {incident.id} \u2014 {diagnosis_text}"
        ),
        "service_name": incident.service_name,
        "alert_type": incident.alert_type.value,
        "root_cause": diagnosis_text,
        "resolution_steps": [
            f"Human approved suggested action: {action}",
            remediation_result["message"],
            f"Diagnosis confidence was {incident.diagnosis_confidence:.2f}"
            if incident.diagnosis_confidence is not None
            else "Diagnosis confidence was unknown",
        ],
    }


async def _push_dead_letter(incident: Incident, error_message: str) -> None:
    client = aioredis.from_url(settings.redis_url)
    try:
        payload = {
            "incident_id": str(incident.id),
            "service_name": incident.service_name,
            "suggested_action": incident.suggested_action,
            "error": error_message,
            "failed_at": datetime.now(UTC).isoformat(),
        }
        await client.lpush(REMEDIATION_DEAD_LETTER_KEY, json.dumps(payload))
    finally:
        await client.aclose()


async def approve_incident_remediation(
    incident: Incident,
    db: AsyncSession,
) -> dict[str, Any]:
    # ------------------------------------------------------------------ #
    # Bug 2 fix: reject approval when the incident is no longer "open".   #
    # Celery may have already auto-recovered or resolved it before a       #
    # human got around to clicking Approve.                                #
    # ------------------------------------------------------------------ #
    if incident.status != IncidentStatus.OPEN:
        raise IncidentStatusConflictError(
            f"Incident is already '{incident.status.value}', cannot approve remediation"
        )

    if not incident.suggested_action:
        raise ValueError("Incident has no suggested_action — run /analyze first")

    if incident.suggested_action not in REMEDIATION_ACTIONS:
        raise ValueError(
            f"Suggested action '{incident.suggested_action}' requires manual handling, "
            "not automated remediation"
        )

    try:
        result = await execute_remediation(incident.suggested_action, incident.service_name)
    except RemediationFailedError as exc:
        # ------------------------------------------------------------------ #
        # Failure-handling path — two independent guarded operations:         #
        #                                                                     #
        # 1. Dead-letter write to Redis (may fail if Redis is down).          #
        # 2. Status update + DB commit (may fail if the column is too narrow, #
        #    DB is unreachable, or any other transient DB error occurs).       #
        #                                                                     #
        # Both are wrapped individually so a failure in one does NOT prevent  #
        # the other from running, and neither can escape as an unhandled 500. #
        # Migration 006 is the root-cause fix for the VARCHAR(14) truncation; #
        # these guards are defence-in-depth for any future DB errors.         #
        # ------------------------------------------------------------------ #
        dead_lettered = False
        try:
            await _push_dead_letter(incident, str(exc))
            dead_lettered = True
        except Exception:  # noqa: BLE001
            logger.error(
                "Dead-letter write failed for incident %s — full traceback:\n%s",
                incident.id,
                traceback.format_exc(),
            )

        status_updated = False
        try:
            # Status update runs regardless of whether the dead-letter write succeeded.
            incident.status = IncidentStatus.NEEDS_MANUAL_INTERVENTION
            await db.commit()
            status_updated = True
        except Exception:  # noqa: BLE001
            logger.error(
                "DB status update failed for incident %s — full traceback:\n%s",
                incident.id,
                traceback.format_exc(),
            )
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass  # rollback best-effort; do not mask the original error

        logger.error(
            "Remediation failed for incident %s after retries: %s "
            "(dead_lettered=%s, status_updated=%s)",
            incident.id,
            exc,
            dead_lettered,
            status_updated,
        )
        return {
            "status": IncidentStatus.NEEDS_MANUAL_INTERVENTION.value,
            "remediation_success": False,
            "message": str(exc),
            "dead_lettered": dead_lettered,
            "status_updated": status_updated,
        }

    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = datetime.now(UTC)
    await db.commit()

    seed_postmortems([_incident_to_postmortem(incident, result)])
    logger.info("Incident %s resolved via %s", incident.id, result["action"])

    return {
        "status": incident.status.value,
        "remediation_success": True,
        "message": result["message"],
        "action": result["action"],
        "postmortem_seeded": True,
    }


async def reject_incident_remediation(
    incident: Incident,
    db: AsyncSession,
) -> dict[str, Any]:
    incident.status = IncidentStatus.REJECTED
    await db.commit()
    logger.info(
        "Human rejected suggested action '%s' for incident %s",
        incident.suggested_action,
        incident.id,
    )
    return {
        "status": incident.status.value,
        "message": "Suggested remediation rejected by operator",
    }
