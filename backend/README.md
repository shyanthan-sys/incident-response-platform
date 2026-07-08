# Backend

FastAPI backend for the Incident Response Platform with Google OAuth and JWT auth.

## Local development

```bash
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in secrets

# Run migrations (requires Postgres running)
alembic upgrade head

uvicorn app.main:app --reload --port 8000
```

## Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/google/login` | Start Google OAuth flow |
| GET | `/auth/google/callback` | OAuth callback; redirects to frontend with JWT |
| GET | `/auth/me` | Current user (requires `Authorization: Bearer <token>`) |
