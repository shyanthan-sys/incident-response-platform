"""Standalone script to test postmortem vector retrieval."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.knowledge.retriever import search_similar_incidents

TEST_QUERIES = [
    "service returning 503 errors under load",
    "response times climbing to several seconds",
    "CPU pegged at high usage for extended period",
    "API calls failing with error responses intermittently",
]


def main() -> None:
    for query in TEST_QUERIES:
        print(f"\nQuery: {query}")
        print("-" * 60)

        results = search_similar_incidents(query, top_k=3)

        if not results:
            print("  (no results)")
            continue

        for rank, result in enumerate(results, start=1):
            metadata = result["metadata"]
            print(f"  {rank}. {metadata['title']}")
            print(f"     alert_type: {metadata['alert_type']}")
            print(f"     similarity: {result['similarity_score']:.4f}")


if __name__ == "__main__":
    main()
