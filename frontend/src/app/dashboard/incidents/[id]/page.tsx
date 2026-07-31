"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import StatusBadge from "@/components/StatusBadge";
import DiagnosisPanel from "@/components/DiagnosisPanel";
import type { Incident, IncidentListResponse } from "@/lib/types";
import { alertTypeLabel, isTerminalStatus, timeAgo } from "@/lib/types";

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
  // Fetch incident by id
  //
  // The list endpoint caps at 100 items.  To avoid missing the incident when
  // the total count grows large we scan pages until we find it or exhaust
  // the result set.  We clear `incident` before each refetch so stale state
  // can never mask a real error.
  // -----------------------------------------------------------------------
  const fetchIncident = useCallback(async () => {
    try {
      setFetchError(null);
      const PAGE = 100;
      let offset = 0;
      let found: Incident | undefined;

      while (!found) {
        const res = await apiFetch(`/incidents?limit=${PAGE}&offset=${offset}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: IncidentListResponse = await res.json();

        found = data.items.find((i) => i.id === id);

        // Stop when the page is exhausted or no more items exist
        if (found || data.items.length < PAGE || offset + PAGE >= data.total) break;
        offset += PAGE;
      }

      if (!found) throw new Error("Incident not found");
      setIncident(found);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load");
      setIncident(null); // clear stale data so the error state renders
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

      // Immediately reflect the new status in local state so the
      // Approve/Reject buttons disappear without waiting for the refetch.
      const body = await res.json() as { status?: string };
      if (body.status && incident) {
        setIncident((prev) =>
          prev ? { ...prev, status: body.status as Incident["status"] } : prev
        );
      }

      // Then refetch the full incident from the server for accuracy.
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
      <div className="min-h-screen bg-gray-950 text-white">
        <nav className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Link
              href="/dashboard"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Board
            </Link>
            <span className="text-gray-700">/</span>
            <div className="h-4 w-24 rounded bg-gray-800 animate-pulse" />
          </div>
        </nav>

        <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-6 animate-pulse">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="h-6 w-48 rounded bg-gray-800" />
                <div className="h-4 w-32 rounded bg-gray-800/60" />
              </div>
              <div className="h-6 w-20 rounded-full bg-gray-800" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-gray-800 pt-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-16 rounded bg-gray-800/40" />
                  <div className="h-4 w-24 rounded bg-gray-800" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (fetchError || !incident) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <nav className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Link
              href="/dashboard"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Board
            </Link>
          </div>
        </nav>

        <div className="flex flex-col items-center justify-center py-20 px-4 space-y-4">
          <div className="rounded-full bg-red-500/10 p-3 text-red-400 border border-red-500/20">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-lg font-semibold text-white">
              {fetchError ?? "Incident not found"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Could not load incident details. The incident might not exist or the backend server is unreachable.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={fetchIncident}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Retry
            </button>
            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors"
            >
              ← Back to board
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Terminal statuses: no further action is meaningful.
  const isTerminal = isTerminalStatus(incident.status);

  // Show Analyze only when:
  //  - incident is not in a terminal state (already acted on)
  //  - no diagnosis exists yet
  //  - not currently streaming
  const canAnalyze = !isTerminal && !incident.diagnosis && !isStreaming;

  // Show Re-analyze only when the incident is not terminal and
  // already has a prior diagnosis (to allow refreshing the AI result).
  const canReAnalyze = !isTerminal && !!incident.diagnosis && !isStreaming;

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

        {/* Re-analyze button when already diagnosed and not terminal */}
        {canReAnalyze && (
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
