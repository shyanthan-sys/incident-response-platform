import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.routers import auth, incidents
from app.ws.manager import IncidentConnectionManager
from app.ws.redis_listener import run_incident_subscriber

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = IncidentConnectionManager()
    app.state.incident_ws_manager = manager

    subscriber_task = asyncio.create_task(
        run_incident_subscriber(manager, settings.redis_url)
    )
    try:
        yield
    finally:
        subscriber_task.cancel()
        try:
            await subscriber_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Incident Response Backend",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret_key,
    https_only=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(incidents.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
