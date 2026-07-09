import asyncio
import random

from fastapi import FastAPI, HTTPException

from state import ChaosStatusResponse, ChaosType, TriggerRequest, chaos_state

app = FastAPI(title="Chaos Service")


@app.get("/health")
async def health():
    chaos_type = chaos_state.get_active_type()

    if chaos_type is None:
        return {"status": "ok"}

    if chaos_type == ChaosType.SERVICE_DOWN:
        raise HTTPException(status_code=503, detail="Service unavailable")

    if chaos_type == ChaosType.HIGH_ERRORS:
        if random.random() < 0.4:
            raise HTTPException(status_code=500, detail="Internal server error")
        return {"status": "ok"}

    if chaos_type == ChaosType.HIGH_LATENCY:
        await asyncio.sleep(random.uniform(5, 10))
        return {"status": "ok"}

    if chaos_type == ChaosType.HIGH_CPU:
        return {"status": "ok", "cpu_percent": random.randint(90, 99)}

    return {"status": "ok"}


@app.post("/chaos/trigger")
async def trigger_chaos(body: TriggerRequest):
    chaos_state.trigger(body.type, body.duration_seconds)
    return {"message": "Chaos triggered", **chaos_state.status().model_dump(mode="json")}


@app.post("/chaos/reset")
async def reset_chaos():
    chaos_state.reset()
    return {"message": "Chaos cleared", "status": "healthy"}


@app.get("/chaos/status", response_model=ChaosStatusResponse)
async def chaos_status():
    return chaos_state.status()
