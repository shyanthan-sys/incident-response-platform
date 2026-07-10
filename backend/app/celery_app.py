from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "incident_response",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.monitor"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "monitor-chaos-service-health": {
            "task": "app.tasks.monitor.check_chaos_service_health",
            "schedule": 5.0,
        },
    },
)
