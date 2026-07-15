import json
from typing import Any

from app.knowledge.postmortems import (
    get_embedding_model,
    get_postmortem_collection,
)


def _parse_resolution_steps(raw: str) -> list[str] | str:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    return raw


def search_similar_incidents(query_text: str, top_k: int = 3) -> list[dict[str, Any]]:
    """Embed query_text and return the most similar postmortems from ChromaDB."""
    collection = get_postmortem_collection()
    model = get_embedding_model()

    query_embedding = model.encode(query_text, show_progress_bar=False).tolist()
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["metadatas", "documents", "distances"],
    )

    matches: list[dict[str, Any]] = []
    if not results["ids"] or not results["ids"][0]:
        return matches

    for doc_id, metadata, document, distance in zip(
        results["ids"][0],
        results["metadatas"][0],
        results["documents"][0],
        results["distances"][0],
        strict=True,
    ):
        metadata = metadata or {}
        similarity_score = 1.0 - distance
        matches.append(
            {
                "id": doc_id,
                "similarity_score": similarity_score,
                "distance": distance,
                "document": document,
                "metadata": {
                    "title": metadata.get("title", ""),
                    "service_name": metadata.get("service_name", ""),
                    "alert_type": metadata.get("alert_type", ""),
                    "root_cause": metadata.get("root_cause", ""),
                    "resolution_steps": _parse_resolution_steps(
                        metadata.get("resolution_steps", "")
                    ),
                },
            }
        )

    return matches
