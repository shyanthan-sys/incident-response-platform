import asyncio
import websockets
import json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0OWVmNGMwZS0zNjZhLTQ3OTItYmZhNS0wODM2Njk1ZjI5MGMiLCJleHAiOjE3ODQ5ODg3MjUsImlhdCI6MTc4NDM4MzkyNX0.7cVtUe1nhDOLe4UOQHVQ_q5soB41LR9WKRE5X_Cm6FQ"

async def main():
    uri = f"ws://localhost:8000/ws/incidents?token={TOKEN}"

    async with websockets.connect(uri) as ws:
        print("Connected.")
        print("Waiting for incident events...")

        while True:
            msg = await ws.recv()
            print(json.dumps(json.loads(msg), indent=2))

asyncio.run(main())