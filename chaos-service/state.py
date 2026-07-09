import asyncio
from datetime import UTC, datetime, timedelta
from enum import Enum

from pydantic import BaseModel, Field


class ChaosType(str, Enum):
    HIGH_LATENCY = "high_latency"
    HIGH_ERRORS = "high_errors"
    SERVICE_DOWN = "service_down"
    HIGH_CPU = "high_cpu"


class TriggerRequest(BaseModel):
    type: ChaosType
    duration_seconds: int = Field(gt=0, le=3600)


class ChaosStatusResponse(BaseModel):
    active: bool
    type: ChaosType | None = None
    duration_seconds: int | None = None
    triggered_at: datetime | None = None
    expires_at: datetime | None = None
    seconds_remaining: float | None = None


class ChaosState:
    def __init__(self) -> None:
        self.chaos_type: ChaosType | None = None
        self.duration_seconds: int | None = None
        self.triggered_at: datetime | None = None
        self.expires_at: datetime | None = None
        self._expiry_task: asyncio.Task | None = None

    def _expire_if_needed(self) -> None:
        if self.expires_at is not None and datetime.now(UTC) >= self.expires_at:
            self.reset()

    def get_active_type(self) -> ChaosType | None:
        self._expire_if_needed()
        return self.chaos_type

    def trigger(self, chaos_type: ChaosType, duration_seconds: int) -> None:
        self.reset()
        now = datetime.now(UTC)
        self.chaos_type = chaos_type
        self.duration_seconds = duration_seconds
        self.triggered_at = now
        self.expires_at = now + timedelta(seconds=duration_seconds)
        self._expiry_task = asyncio.create_task(self._auto_expire(duration_seconds))

    async def _auto_expire(self, duration_seconds: int) -> None:
        try:
            await asyncio.sleep(duration_seconds)
            if self.expires_at is not None and datetime.now(UTC) >= self.expires_at:
                self.reset()
        except asyncio.CancelledError:
            pass

    def reset(self) -> None:
        if self._expiry_task is not None and not self._expiry_task.done():
            self._expiry_task.cancel()
        self._expiry_task = None
        self.chaos_type = None
        self.duration_seconds = None
        self.triggered_at = None
        self.expires_at = None

    def status(self) -> ChaosStatusResponse:
        self._expire_if_needed()
        if self.chaos_type is None:
            return ChaosStatusResponse(active=False)

        now = datetime.now(UTC)
        seconds_remaining = None
        if self.expires_at is not None:
            seconds_remaining = max(0.0, (self.expires_at - now).total_seconds())

        return ChaosStatusResponse(
            active=True,
            type=self.chaos_type,
            duration_seconds=self.duration_seconds,
            triggered_at=self.triggered_at,
            expires_at=self.expires_at,
            seconds_remaining=seconds_remaining,
        )


chaos_state = ChaosState()
