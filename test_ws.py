import asyncio
import websockets
import json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0OWVmNGMwZS0zNjZhLTQ3OTItYmZhNS0wODM2Njk1ZjI5MGMiLCJleHAiOjE3ODQ2NDIzNjcsImlhdCI6MTc4NDAzNzU2N30.32KUl4RdDsndJmv9aXp9JUKTuI-q6ckNrnHDMNV9aXU"

async def main():
    uri = f"ws://localhost:8000/ws/incidents?token={TOKEN}"

    async with websockets.connect(uri) as ws:
        print("Connected.")
        print("Waiting for incident events...")

        while True:
            msg = await ws.recv()
            print(json.dumps(json.loads(msg), indent=2))

asyncio.run(main())