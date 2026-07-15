"""One-off script to seed the ChromaDB postmortem knowledge base."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.knowledge.postmortems import COLLECTION_NAME, seed_postmortems

SAMPLE_POSTMORTEMS = [
    {
        "title": "Checkout service returning 503s during flash sale",
        "service_name": "chaos-service",
        "alert_type": "service_down",
        "root_cause": (
            "A dependent payment-gateway client was configured with an infinite "
            "retry loop and no circuit breaker. When the gateway slowed down under "
            "load, retries piled up, exhausted the service's connection pool, and "
            "the service began rejecting all new requests with 503s."
        ),
        "resolution_steps": [
            "Restart the service to clear the exhausted connection pool.",
            "Add a circuit breaker around the payment-gateway client.",
            "Cap retries at 3 attempts with exponential backoff.",
        ],
    },
    {
        "title": "Full outage after bad deployment removed health check endpoint",
        "service_name": "chaos-service",
        "alert_type": "service_down",
        "root_cause": (
            "A deployment accidentally removed the /health route while refactoring "
            "the router file. The load balancer's health checks began failing "
            "immediately, and it stopped routing any traffic to the service."
        ),
        "resolution_steps": [
            "Roll back to the previous deployment.",
            "Add a CI check that verifies /health responds 200 before allowing a deploy.",
        ],
    },
    {
        "title": "Elevated response times from unindexed database query",
        "service_name": "chaos-service",
        "alert_type": "high_latency",
        "root_cause": (
            "A recently added filter on the incidents listing endpoint queried a "
            "column with no index. As data volume grew, the query planner fell back "
            "to a full table scan, causing response times to climb from ~50ms to "
            "6-9 seconds under moderate load."
        ),
        "resolution_steps": [
            "Add a B-tree index on the filtered column.",
            "Verify response times return to baseline after deploy.",
            "Add a query performance test to the test suite.",
        ],
    },
    {
        "title": "Latency spike from N+1 query pattern after feature launch",
        "service_name": "chaos-service",
        "alert_type": "high_latency",
        "root_cause": (
            "A new feature fetched related records in a loop instead of a single "
            "batched query, resulting in hundreds of sequential database round-trips "
            "per request under normal traffic."
        ),
        "resolution_steps": [
            "Refactor the loop into a single query using SQLAlchemy's joinedload.",
            "Confirm latency drops from ~4s to ~120ms.",
            "Add an N+1 pattern check to the code review checklist.",
        ],
    },
    {
        "title": "Repeated 500 errors from unhandled null in response serialization",
        "service_name": "chaos-service",
        "alert_type": "high_errors",
        "root_cause": (
            "A schema migration made a previously required field nullable, but the "
            "response serializer assumed the field was always present, causing a "
            "null-reference exception on roughly 15% of requests where the field "
            "was empty."
        ),
        "resolution_steps": [
            "Patch the serializer to handle null values with a sensible default.",
            "Add a regression test covering the null case.",
            "Deploy as a hotfix.",
        ],
    },
    {
        "title": "Elevated error rate from expired third-party API credentials",
        "service_name": "chaos-service",
        "alert_type": "high_errors",
        "root_cause": (
            "An API key for a third-party enrichment service expired without an "
            "advance-warning alert configured. Requests depending on that "
            "integration began failing with 401s, surfacing to users as generic "
            "500 errors."
        ),
        "resolution_steps": [
            "Rotate the API key immediately to restore service.",
            "Add a monitor that alerts 14 days before any stored credential expires.",
        ],
    },
    {
        "title": "Sustained high CPU from inefficient regex in request validation",
        "service_name": "chaos-service",
        "alert_type": "high_cpu",
        "root_cause": (
            "A validation regex had catastrophic backtracking behavior on certain "
            "malformed inputs, causing CPU usage to spike to 95%+ whenever a request "
            "matched the pathological pattern, starving other requests of "
            "processing time."
        ),
        "resolution_steps": [
            "Replace the regex with a simpler, linear-time validation approach.",
            "Add a timeout guard around all regex validation as a safety net.",
        ],
    },
    {
        "title": "High CPU from missing cache causing repeated expensive computation",
        "service_name": "chaos-service",
        "alert_type": "high_cpu",
        "root_cause": (
            "A cache invalidation bug caused a computationally expensive aggregation "
            "to be recalculated on every request instead of being served from cache, "
            "driving sustained CPU usage above 90% during peak hours."
        ),
        "resolution_steps": [
            "Fix the cache key generation logic causing every request to miss cache.",
            "Add a CPU-usage alert threshold to catch similar regressions earlier.",
        ],
    },
]


def main() -> None:
    count = seed_postmortems(SAMPLE_POSTMORTEMS)
    print(f"Seeded {count} postmortems into ChromaDB collection '{COLLECTION_NAME}'.")


if __name__ == "__main__":
    main()