import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, TypedDict

import chromadb
from chromadb.api.models.Collection import Collection
from google import genai
from google.genai import types as genai_types

from app.config import get_settings

GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
COLLECTION_NAME = "postmortems"
CHROMA_PATH = Path(__file__).resolve().parents[2] / "data" / "chroma"


class Postmortem(TypedDict):
    title: str
    service_name: str
    alert_type: str
    root_cause: str
    resolution_steps: list[str] | str


@lru_cache
def get_chroma_client() -> chromadb.PersistentClient:
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_PATH))


def get_gemini_embeddings(texts: list[str]) -> list[list[float]]:
    """Call Gemini Embedding API and return a list of embedding vectors."""
    settings = get_settings()
    client = genai.Client(api_key=settings.google_ai_api_key)
    response = client.models.embed_content(
        model=GEMINI_EMBEDDING_MODEL,
        contents=texts,
        config=genai_types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
    )
    return [e.values for e in response.embeddings]


def get_postmortem_collection() -> Collection:
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def stable_postmortem_id(title: str) -> str:
    return hashlib.sha256(title.encode("utf-8")).hexdigest()


def build_embedding_text(postmortem: Postmortem) -> str:
    steps = postmortem["resolution_steps"]
    if isinstance(steps, list):
        steps_text = "\n".join(steps)
    else:
        steps_text = str(steps)

    return (
        f"{postmortem['title']}\n\n"
        f"{postmortem['root_cause']}\n\n"
        f"{steps_text}"
    )


def postmortem_metadata(postmortem: Postmortem) -> dict[str, str]:
    steps = postmortem["resolution_steps"]
    if isinstance(steps, list):
        steps_value = json.dumps(steps)
    else:
        steps_value = str(steps)

    return {
        "title": postmortem["title"],
        "service_name": postmortem["service_name"],
        "alert_type": postmortem["alert_type"],
        "root_cause": postmortem["root_cause"],
        "resolution_steps": steps_value,
    }


def seed_postmortems(postmortems: list[Postmortem]) -> int:
    """Embed postmortems via Gemini and upsert into ChromaDB. Idempotent by title hash."""
    if not postmortems:
        return 0

    collection = get_postmortem_collection()

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, str]] = []

    for postmortem in postmortems:
        ids.append(stable_postmortem_id(postmortem["title"]))
        documents.append(build_embedding_text(postmortem))
        metadatas.append(postmortem_metadata(postmortem))

    embeddings = get_gemini_embeddings(documents)

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )

    return len(ids)
