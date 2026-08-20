import re
from datetime import datetime
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.config import get_settings
from app.knowledge.retriever import search_similar_incidents

GROQ_MODEL = "openai/gpt-oss-120b"

SuggestedAction = Literal[
    "restart_service",
    "rollback_deployment",
    "scale_up",
    "manual_investigation_needed",
]


class DiagnosisOutput(BaseModel):
    diagnosis: str
    confidence: float = Field(ge=0.0, le=1.0)
    suggested_action: SuggestedAction
    reasoning: str
    referenced_postmortem_titles: list[str]


class DiagnosisState(TypedDict, total=False):
    service_name: str
    alert_type: str
    detected_at: str
    severity: str
    query_text: str
    retrieved_postmortems: list[dict[str, Any]]
    diagnosis_result: DiagnosisOutput


DIAGNOSE_SYSTEM_PROMPT = """You are an incident response engineer diagnosing production alerts.

You will receive:
1. Details about the current incident
2. Up to 3 retrieved past postmortems from a vector search (each with a similarity score)

IMPORTANT — how to use retrieved postmortems:
- Similarity scores are hints, not ground truth. The top-ranked postmortem may be only loosely related.
- Read ALL retrieved postmortems and judge which (if any) are actually relevant to this incident.
- Ignore postmortems whose root cause or resolution does not match the current symptoms.
- You may reference zero, one, or several postmortems in referenced_postmortem_titles — only list titles you genuinely used.
- If none are relevant, say so in reasoning and recommend manual_investigation_needed with lower confidence.
- Do NOT assume the #1 result is correct just because it ranked highest.

Return structured output with:
- diagnosis: concise summary of likely cause
- confidence: 0.0–1.0 reflecting how sure you are
- suggested_action: one of restart_service, rollback_deployment, scale_up, manual_investigation_needed
- reasoning: step-by-step explanation citing relevant postmortems where applicable
- referenced_postmortem_titles: titles of postmortems you actually found useful (may be empty)"""


def build_retrieval_query(service_name: str, alert_type: str, detected_at: str) -> str:
    return (
        f"Production incident on service '{service_name}' "
        f"with alert type '{alert_type}' detected at {detected_at}. "
        f"Symptoms, root causes, and resolution steps for similar outages."
    )


def _format_postmortems(postmortems: list[dict[str, Any]]) -> str:
    if not postmortems:
        return "No postmortems retrieved."

    sections: list[str] = []
    for index, item in enumerate(postmortems, start=1):
        metadata = item.get("metadata", {})
        sections.append(
            f"--- Retrieved #{index} (similarity={item.get('similarity_score', 0):.3f}) ---\n"
            f"Title: {metadata.get('title', '')}\n"
            f"Service: {metadata.get('service_name', '')}\n"
            f"Alert type: {metadata.get('alert_type', '')}\n"
            f"Root cause: {metadata.get('root_cause', '')}\n"
            f"Resolution steps: {metadata.get('resolution_steps', '')}"
        )
    return "\n\n".join(sections)


def retrieve_node(state: DiagnosisState) -> dict[str, Any]:
    query_text = build_retrieval_query(
        state["service_name"],
        state["alert_type"],
        state["detected_at"],
    )
    retrieved = search_similar_incidents(query_text, top_k=3)
    return {"query_text": query_text, "retrieved_postmortems": retrieved}


def _build_diagnose_messages(state: DiagnosisState) -> list[SystemMessage | HumanMessage]:
    postmortems_text = _format_postmortems(state.get("retrieved_postmortems", []))
    human_content = (
        f"Current incident:\n"
        f"- service_name: {state['service_name']}\n"
        f"- alert_type: {state['alert_type']}\n"
        f"- severity: {state.get('severity', 'unknown')}\n"
        f"- detected_at: {state['detected_at']}\n\n"
        f"Retrieved postmortems (ranked by vector similarity — verify relevance yourself):\n"
        f"{postmortems_text}"
    )
    return [
        SystemMessage(content=DIAGNOSE_SYSTEM_PROMPT),
        HumanMessage(content=human_content),
    ]


async def diagnose_node(state: DiagnosisState) -> dict[str, Any]:
    settings = get_settings()
    llm = ChatGroq(
        model=GROQ_MODEL,
        groq_api_key=settings.groq_api_key,
        temperature=0,
    )
    structured_llm = llm.with_structured_output(DiagnosisOutput)
    result: DiagnosisOutput = await structured_llm.ainvoke(_build_diagnose_messages(state))
    return {"diagnosis_result": result}


async def stream_result_node(state: DiagnosisState) -> dict[str, Any]:
    writer = get_stream_writer()
    result = state.get("diagnosis_result")
    if result is None:
        writer({"type": "error", "content": "Diagnosis failed — no result produced."})
        return {}

    stream_text = (
        f"Diagnosis: {result.diagnosis}\n\n"
        f"Suggested action: {result.suggested_action}\n"
        f"Confidence: {result.confidence:.2f}\n\n"
        f"Reasoning: {result.reasoning}\n"
    )

    for token in re.findall(r"\S+\s*|\n", stream_text):
        writer({"type": "token", "content": token})

    writer({"type": "complete", "diagnosis": result.model_dump()})
    return {}


def build_diagnosis_graph():
    graph = StateGraph(DiagnosisState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("diagnose", diagnose_node)
    graph.add_node("stream_result", stream_result_node)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "diagnose")
    graph.add_edge("diagnose", "stream_result")
    graph.add_edge("stream_result", END)
    return graph.compile()


def incident_to_diagnosis_state(incident) -> DiagnosisState:
    detected_at = incident.detected_at
    if isinstance(detected_at, datetime):
        detected_at_str = detected_at.isoformat()
    else:
        detected_at_str = str(detected_at)

    return DiagnosisState(
        service_name=incident.service_name,
        alert_type=incident.alert_type.value,
        detected_at=detected_at_str,
        severity=incident.severity.value,
    )


async def stream_diagnosis(state: DiagnosisState):
    """Run the diagnosis graph and yield custom stream chunks."""
    graph = build_diagnosis_graph()
    async for chunk in graph.astream(state, stream_mode="custom"):
        yield chunk
