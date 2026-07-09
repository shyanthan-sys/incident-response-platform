# Chaos Service

Standalone FastAPI service for injecting controlled failure modes during incident response drills.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check; behavior changes when chaos is active |
| POST | `/chaos/trigger` | Activate a chaos mode for a duration |
| POST | `/chaos/reset` | Clear chaos immediately |
| GET | `/chaos/status` | Current chaos state |

## Chaos types

- `high_latency` — sleeps 5–10s before responding
- `high_errors` — returns 500 ~40% of the time
- `service_down` — always returns 503
- `high_cpu` — responds with fake `cpu_percent` between 90–99

## Local development

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Example

```bash
curl -X POST http://localhost:8001/chaos/trigger \
  -H "Content-Type: application/json" \
  -d '{"type": "high_latency", "duration_seconds": 60}'

curl http://localhost:8001/health
curl http://localhost:8001/chaos/status
curl -X POST http://localhost:8001/chaos/reset
```
