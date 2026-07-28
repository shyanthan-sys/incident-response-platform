import asyncio
import random
from typing import Any

import httpx

from app.config import get_settings

settings = get_settings()

REMEDIATION_ACTIONS = ("restart_service", "rollback_deployment", "scale_up")


async def _call_chaos_reset() -> tuple[bool, str]:
    reset_url = f"{settings.chaos_service_url.rstrip('/')}/chaos/reset"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(reset_url)
        if response.status_code == 200:
            return True, "chaos-service reset to healthy state"
        return False, f"chaos reset returned HTTP {response.status_code}"
    except httpx.RequestError as exc:
        return False, f"chaos reset request failed: {exc}"


async def _simulate_remediation(action: str, service_name: str) -> dict[str, Any]:
    await asyncio.sleep(random.uniform(1.0, 2.0))

    reset_ok, reset_message = await _call_chaos_reset()
    if not reset_ok:
        return {
            "success": False,
            "action": action,
            "service_name": service_name,
            "message": f"{action} simulated for {service_name}, but {reset_message}",
        }

    action_messages = {
        "restart_service": f"Simulated rolling restart of {service_name}",
        "rollback_deployment": f"Simulated rollback of latest deployment for {service_name}",
        "scale_up": f"Simulated scale-up of {service_name} replicas",
    }
    return {
        "success": True,
        "action": action,
        "service_name": service_name,
        "message": f"{action_messages[action]}. {reset_message}.",
    }


async def restart_service(service_name: str) -> dict[str, Any]:
    return await _simulate_remediation("restart_service", service_name)


async def rollback_deployment(service_name: str) -> dict[str, Any]:
    return await _simulate_remediation("rollback_deployment", service_name)


async def scale_up(service_name: str) -> dict[str, Any]:
    return await _simulate_remediation("scale_up", service_name)
