"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import StatusBadge from "@/components/StatusBadge";
import DiagnosisPanel from "@/components/DiagnosisPanel";
import type { Incident, IncidentListResponse } from "@/lib/types";
import { alertTypeLabel, timeAgo } from "@/lib/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const { apiFetch } = useApiClient();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Analyze streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Approve / reject state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch incident by id (list endpoint, find by id)
  // -----------------------------------------------------------------------
  const fetchIncident = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await apiFetch(`/incidents?limit=100&offset=0`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: IncidentListResponse = await res.json();
      const found = data.items.find((i) => i.id === id) ?? null;
      if (!found) throw new Error("Incident not found");
      setIncident(found);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);

  useEffect(() => {
    fetchIncident();
  }, [fetchIncident]);

  // -----------------------------------------------------------------------
  // Analyze — SSE stream via Fetch + ReadableStream
  // -----------------------------------------------------------------------
  async function handleAnalyze() {
    if (!token || !id) return;
    setIsStreaming(true);
    setStreamingText("");
    setAnalyzeError(null);

    try {
      const res = await fetch(`${API_URL}/incidents/${id}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { detail?: string }).detail ?? `HTTP ${res.status}`,
        );
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? ""; // keep incomplete tail

        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;

          const raw = dataLine.slice("data:".length).trim();
          try {
            const parsed = JSON.parse(raw) as {
              type: string;
              content?: string;
            };
            if (parsed.type === "token" && parsed.content) {
              setStreamingText((t) => t + parsed.content);
            } else if (parsed.type === "done") {
              // Streaming finished — refetch to get the saved diagnosis
              setIsStreaming(false);
              await fetchIncident();
              return;
            }
          } catch {
            // ignore unparseable chunk
          }
        }
      }
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Analysis failed",
      );
    } finally {
      setIsStreaming(false);
      readerRef.current = null;
    }
  }

  // -----------------------------------------------------------------------
  // Approve / Reject
  // -----------------------------------------------------------------------
  async function handleAction(action: "approve" | "reject") {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/incidents/${id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          (body as { detail?: string }).detail ?? `HTTP ${res.status}`;
        if (res.status === 409) {
          throw new Error(`Already handled: ${msg}`);
        }
        throw new Error(msg);
      }
      // Refresh the incident state
      await fetchIncident();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Loading / error states
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Loading incident…</p>
        </div>
      </div>
    );
  }

  if (fetchError || !incident) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4">
        <p className="text-red-400 text-sm">
          {fetchError ?? "Incident not found"}
        </p>
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-400 hover:text-white transition"
        >
          ← Go back
        </button>
      </div>
    );
  }

  const canAnalyze =
    !incident.diagnosis && !isStreaming;
  const alreadyDiagnosed = !!incident.diagnosis;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            ← Board
          </Link>
          <span className="text-gray-700">/</span>
          <span className="text-sm text-gray-300 truncate">
            {incident.service_name}
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Header card */}
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">
                {incident.service_name}
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                {alertTypeLabel(incident.alert_type)}
              </p>
            </div>
            <StatusBadge status={incident.status} />
          </div>

          {/* Meta grid */}
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetaItem label="Severity">
              <span
                className={`font-semibold capitalize ${
                  incident.severity === "critical"
                    ? "text-red-400"
                    : incident.severity === "high"
                      ? "text-orange-400"
                      : incident.severity === "medium"
                        ? "text-yellow-400"
                        : "text-blue-400"
                }`}
              >
                {incident.severity}
              </span>
            </MetaItem>

            <MetaItem label="Detected">
              <span className="text-gray-300 text-xs">
                {formatDatetime(incident.detected_at)}
              </span>
            </MetaItem>

            <MetaItem label="Age">
              <span className="text-gray-300">{timeAgo(incident.detected_at)}</span>
            </MetaItem>

            {incident.resolved_at && (
              <MetaItem label="Resolved">
                <span className="text-gray-300 text-xs">
                  {formatDatetime(incident.resolved_at)}
                </span>
              </MetaItem>
            )}

            <MetaItem label="Incident ID">
              <span className="font-mono text-gray-500 text-xs break-all">
                {incident.id}
              </span>
            </MetaItem>
          </dl>
        </div>

        {/* Analyze button */}
        {canAnalyze && (
          <button
            id="analyze-btn"
            onClick={handleAnalyze}
            className="w-full rounded-xl border border-indigo-500/40 bg-indigo-600/10 px-6 py-4 text-sm font-semibold text-indigo-300 hover:bg-indigo-600/20 transition-colors flex items-center justify-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M12 2a1 1 0 0 1 .894.553l3.382 6.86 7.565 1.1a1 1 0 0 1 .555 1.706l-5.473 5.333 1.292 7.53a1 1 0 0 1-1.451 1.054L12 22.577l-6.764 3.559a1 1 0 0 1-1.451-1.054l1.292-7.53L.604 12.22a1 1 0 0 1 .555-1.706l7.565-1.1L12.106 2.553A1 1 0 0 1 12 2z" />
            </svg>
            Analyze with AI
          </button>
        )}

        {/* Analyze error */}
        {analyzeError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {analyzeError}
          </div>
        )}

        {/* Re-analyze button when already diagnosed */}
        {alreadyDiagnosed && !isStreaming && (
          <div className="flex justify-end">
            <button
              onClick={handleAnalyze}
              className="text-xs text-gray-500 hover:text-gray-300 transition"
            >
              Re-analyze
            </button>
          </div>
        )}

        {/* Diagnosis panel (streaming or complete) */}
        <DiagnosisPanel
          incident={incident}
          streamingText={streamingText}
          isStreaming={isStreaming}
          actionLoading={actionLoading}
          actionError={actionError}
          onApprove={() => handleAction("approve")}
          onReject={() => handleAction("reject")}
        />
      </main>
    </div>
  );
}

// Small helper component for metadata rows
function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
