import asyncio
import json
import logging
import time
from datetime import UTC, datetime

import httpx
import redis.asyncio as aioredis
from sqlalchemy import select

from app.celery_app import celery_app
from app.config import get_settings
from app.database import task_db_session
from app.models.incident import (
    AlertType,
    Incident,
    IncidentStatus,
    Severity,
)

logger = logging.getLogger(__name__)
settings = get_settings()

SERVICE_NAME = "chaos-service"
HEALTH_URL = f"{settings.chaos_service_url.rstrip('/')}/health"
REQUEST_TIMEOUT_SECONDS = 10.0
LATENCY_THRESHOLD_SECONDS = 2.0
CPU_PERCENT_THRESHOLD = 85.0
INCIDENTS_CHANNEL = "incidents"


async def _fetch_health() -> tuple[int | None, float, str | None, dict | None]:
    """GET /health and return (status_code, elapsed, error, body).

    body is the parsed JSON dict when the response is readable, otherwise None.
    error is one of: None | "timeout" | "connection_error".
    """
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(HEALTH_URL)
            elapsed = time.perf_counter() - start
            try:
                body = response.json()
            except Exception:
                body = None
            return response.status_code, elapsed, None, body
    except httpx.TimeoutException:
        return None, time.perf_counter() - start, "timeout", None
    except httpx.RequestError:
        return None, time.perf_counter() - start, "connection_error", None


def _is_abnormal(
    status_code: int | None,
    elapsed: float,
    error: str | None,
    cpu_percent: float | None = None,
) -> bool:
    if error is not None:
        return True
    if status_code != 200:
        return True
    if cpu_percent is not None and cpu_percent > CPU_PERCENT_THRESHOLD:
        return True
    return elapsed > LATENCY_THRESHOLD_SECONDS


def _classify_abnormality(
    status_code: int | None,
    elapsed: float,
    error: str | None,
    cpu_percent: float | None = None,
) -> tuple[AlertType, Severity]:
    if error == "timeout":
        return AlertType.TIMEOUT, Severity.HIGH
    if error == "connection_error":
        return AlertType.CONNECTION_ERROR, Severity.CRITICAL
    if status_code == 503:
        return AlertType.SERVICE_DOWN, Severity.CRITICAL
    if status_code == 500:
        return AlertType.HIGH_ERRORS, Severity.HIGH
    if status_code is not None and status_code != 200:
        return AlertType.ERROR_RESPONSE, Severity.MEDIUM
    if cpu_percent is not None and cpu_percent > CPU_PERCENT_THRESHOLD:
        return AlertType.HIGH_CPU, Severity.HIGH
    return AlertType.HIGH_LATENCY, Severity.MEDIUM


def _incident_payload(incident: Incident) -> dict:
    status = incident.status.value if isinstance(incident.status, IncidentStatus) else incident.status
    alert_type = (
        incident.alert_type.value
        if isinstance(incident.alert_type, AlertType)
        else incident.alert_type
    )
    severity = (
        incident.severity.value if isinstance(incident.severity, Severity) else incident.severity
    )
    return {
        "id": str(incident.id),
        "service_name": incident.service_name,
        "alert_type": alert_type,
        "severity": severity,
        "status": status,
        "detected_at": incident.detected_at.isoformat(),
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
    }


async def _publish_incident_event(payload: dict) -> None:
    client = aioredis.from_url(settings.redis_url)
    try:
        await client.publish(INCIDENTS_CHANNEL, json.dumps(payload))
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Redis-backed consecutive-healthy-polls counter
#
# WHY REDIS, NOT A PYTHON GLOBAL:
#   check_chaos_service_health() calls asyncio.run(_monitor_async()) on every
#   Celery beat tick.  asyncio.run() creates a brand-new event loop and tears
#   it down on return — which means task_db_session() creates and disposes a
#   fresh AsyncEngine each time.  No coroutine object, no module-level variable
#   set inside an async function, and no connection-pool state survives across
#   separate asyncio.run() calls.  Even if Celery reuses the same OS process
#   (--pool=solo), a plain `global int` incremented inside _monitor_async()
#   would work — but only until the worker is restarted, scaled, or the task
#   moves to a different worker.  Redis is the broker we already depend on; a
#   single INCR or SET is atomic and visible to every worker replica instantly.
#
# KEY:   monitor:{SERVICE_NAME}:consecutive_healthy
# VALUE: integer — number of back-to-back clean polls since the last bad one
# TTL:  none needed; the key is explicitly reset on every abnormal poll
# ---------------------------------------------------------------------------

_HEALTHY_COUNTER_KEY = f"monitor:{SERVICE_NAME}:consecutive_healthy"

# Number of consecutive clean polls required before an open incident is
# auto-recovered.  At the 5-second beat this is 3 × 5 s = ~15 s of sustained
# health — long enough to survive high_errors mode's random ~40% failure rate
# without triggering a false recovery.
RECOVERY_THRESHOLD = 3


async def _increment_healthy_count() -> int:
    """Atomically increment the consecutive-healthy counter and return the new value."""
    client = aioredis.from_url(settings.redis_url)
    try:
        return await client.incr(_HEALTHY_COUNTER_KEY)
    finally:
        await client.aclose()


async def _reset_healthy_count() -> None:
    """Reset the consecutive-healthy counter to 0 on any abnormal poll."""
    client = aioredis.from_url(settings.redis_url)
    try:
        await client.set(_HEALTHY_COUNTER_KEY, 0)
    finally:
        await client.aclose()


async def _get_open_incident(session) -> Incident | None:
    result = await session.execute(
        select(Incident).where(
            Incident.service_name == SERVICE_NAME,
            Incident.status == IncidentStatus.OPEN,
        )
    )
    incident = result.scalar_one_or_none()
    if incident is not None:
        logger.debug(
            "Found open incident id=%s status=%s",
            incident.id,
            incident.status.value,
        )
    return incident


async def _auto_recover_incident(session, open_incident: Incident) -> None:
    incident_id = open_incident.id
    logger.info(
        "Found open incident %s (status=%r), marking auto_recovered",
        incident_id,
        open_incident.status,
    )
    open_incident.status = IncidentStatus.AUTO_RECOVERED
    open_incident.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(open_incident)
    logger.info("Successfully updated incident %s to auto_recovered", incident_id)
    await _publish_incident_event(_incident_payload(open_incident))


async def _monitor_async() -> None:
    status_code, elapsed, error, body = await _fetch_health()

    # Extract cpu_percent from the response body when present.
    # Missing field → None (not applicable); we never treat absence as an error.
    cpu_percent: float | None = None
    if isinstance(body, dict) and "cpu_percent" in body:
        try:
            cpu_percent = float(body["cpu_percent"])
        except (TypeError, ValueError):
            logger.warning("cpu_percent field present but not numeric: %r", body["cpu_percent"])

    if cpu_percent is not None:
        logger.info(
            "Health check body contains cpu_percent=%.1f (threshold=%.1f) — %s",
            cpu_percent,
            CPU_PERCENT_THRESHOLD,
            "ABNORMAL" if cpu_percent > CPU_PERCENT_THRESHOLD else "ok",
        )
    else:
        logger.debug("Health check body has no cpu_percent field")

    abnormal = _is_abnormal(status_code, elapsed, error, cpu_percent)
    logger.debug(
        "Health check: status_code=%s elapsed=%.3fs error=%s cpu_percent=%s abnormal=%s",
        status_code,
        elapsed,
        error,
        cpu_percent,
        abnormal,
    )

    if abnormal:
        # Any bad poll immediately resets the recovery counter so we never
        # accidentally reach the threshold while the service is still sick.
        await _reset_healthy_count()
    else:
        consecutive_healthy = await _increment_healthy_count()
        logger.debug(
            "Service healthy — consecutive_healthy=%d (threshold=%d)",
            consecutive_healthy,
            RECOVERY_THRESHOLD,
        )

    async with task_db_session() as session:
        open_incident = await _get_open_incident(session)

        if abnormal and open_incident is None:
            # Fast detection: a single bad poll opens a new incident immediately.
            alert_type, severity = _classify_abnormality(status_code, elapsed, error, cpu_percent)
            incident = Incident(
                service_name=SERVICE_NAME,
                alert_type=alert_type,
                severity=severity,
                status=IncidentStatus.OPEN,
            )
            session.add(incident)
            await session.commit()
            await session.refresh(incident)
            logger.info(
                "Created open incident %s alert_type=%s severity=%s",
                incident.id,
                alert_type.value,
                severity.value,
            )
            await _publish_incident_event(_incident_payload(incident))

        elif not abnormal and open_incident is not None:
            # Slow recovery: only resolve once RECOVERY_THRESHOLD consecutive
            # clean polls have been observed.  Re-read the counter here (after
            # the increment above) rather than passing it as a parameter so
            # that the value is always consistent even if the increment and the
            # DB read happen to straddle a Redis restart (in which case the
            # counter starts at 1, safely below the threshold).
            client = aioredis.from_url(settings.redis_url)
            try:
                raw = await client.get(_HEALTHY_COUNTER_KEY)
            finally:
                await client.aclose()

            consecutive_healthy = int(raw or 0)

            if consecutive_healthy >= RECOVERY_THRESHOLD:
                logger.info(
                    "consecutive_healthy=%d >= threshold=%d — recovering incident %s",
                    consecutive_healthy,
                    RECOVERY_THRESHOLD,
                    open_incident.id,
                )
                await _auto_recover_incident(session, open_incident)
                # Reset the counter now that recovery is complete so a future
                # incident doesn't inherit stale accumulated healthy counts.
                await _reset_healthy_count()
            else:
                logger.debug(
                    "Service healthy but consecutive_healthy=%d < threshold=%d; "
                    "holding incident %s open",
                    consecutive_healthy,
                    RECOVERY_THRESHOLD,
                    open_incident.id,
                )

        elif abnormal and open_incident is not None:
            logger.debug(
                "Service still abnormal; keeping open incident %s unchanged",
                open_incident.id,
            )


@celery_app.task(name="app.tasks.monitor.check_chaos_service_health")
def check_chaos_service_health() -> None:
    try:
        asyncio.run(_monitor_async())
    except Exception:
        logger.exception("check_chaos_service_health failed")
        raise
