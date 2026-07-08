from fastapi import FastAPI

app = FastAPI(title="Chaos Service")


@app.get("/health")
def health():
    return {"status": "ok"}
