import asyncio
import logging

import redis.asyncio as aioredis

from app.ws.manager import IncidentConnectionManager

logger = logging.getLogger(__name__)

INCIDENTS_CHANNEL = "incidents"


async def run_incident_subscriber(
    manager: IncidentConnectionManager,
    redis_url: str,
) -> None:
    """Dedicated async Redis client for FastAPI — not shared with Celery/monitor."""
    client = aioredis.from_url(redis_url)
    pubsub = client.pubsub()
    await pubsub.subscribe(INCIDENTS_CHANNEL)
    logger.info("Subscribed to Redis channel %r", INCIDENTS_CHANNEL)

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            data = message["data"]
            payload = data.decode() if isinstance(data, bytes) else data
            await manager.broadcast(payload)
    except asyncio.CancelledError:
        logger.info("Incident Redis subscriber shutting down")
        raise
    finally:
        await pubsub.unsubscribe(INCIDENTS_CHANNEL)
        await pubsub.aclose()
        await client.aclose()
