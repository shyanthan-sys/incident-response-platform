from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Create the long-lived async engine for the FastAPI process."""
    global _engine, _async_session_factory

    settings = get_settings()
    _engine = create_async_engine(settings.async_database_url, echo=False)
    _async_session_factory = async_sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )


def reinit_db_after_fork() -> None:
    """Dispose any inherited pool state and create a fresh engine in a forked worker."""
    global _engine, _async_session_factory

    if _engine is not None:
        _engine.sync_engine.dispose(close=False)

    _engine = None
    _async_session_factory = None
    init_db()


def dispose_db_sync() -> None:
    """Synchronously tear down the long-lived engine."""
    global _engine, _async_session_factory

    if _engine is not None:
        _engine.sync_engine.dispose()

    _engine = None
    _async_session_factory = None


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    if _async_session_factory is None:
        init_db()
    return _async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        yield session


@asynccontextmanager
async def task_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Ephemeral engine/session scoped to one asyncio event loop.

    Use in Celery tasks that call asyncio.run() per invocation. The engine is
    created and fully disposed within the same loop lifetime so pooled asyncpg
    connections are never reused across destroyed loops.
    """
    settings = get_settings()
    engine = create_async_engine(settings.async_database_url, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        async with session_factory() as session:
            yield session
    finally:
        await engine.dispose()
