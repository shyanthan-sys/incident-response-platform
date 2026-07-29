"use client";

import { type Incident, isAutomatableAction } from "@/lib/types";

interface DiagnosisPanelProps {
  incident: Incident;
  /** Raw streaming text accumulated so far (may be partial) */
  streamingText?: string;
  /** Whether we are currently streaming */
  isStreaming?: boolean;
  /** Whether an approve/reject action is in flight */
  actionLoading?: boolean;
  /** Error message from an approve/reject action */
  actionError?: string | null;
  onApprove: () => void;
  onReject: () => void;
}

export default function DiagnosisPanel({
  incident,
  streamingText,
  isStreaming,
  actionLoading,
  actionError,
  onApprove,
  onReject,
}: DiagnosisPanelProps) {
  const confidence = incident.diagnosis_confidence;
  const pct = confidence !== null ? Math.round(confidence * 100) : null;
  const canAutomate = isAutomatableAction(incident.suggested_action);
  const isActionable =
    incident.status === "needs_manual_intervention" ||
    incident.status === "open";

  // If streaming is in progress, show the raw stream text
  if (isStreaming && streamingText !== undefined) {
    return (
      <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-indigo-300">
            Analyzing with AI…
          </h3>
        </div>
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
          {streamingText || (
            <span className="text-gray-500 italic">Waiting for tokens…</span>
          )}
        </pre>
      </div>
    );
  }

  // No diagnosis yet
  if (!incident.diagnosis) return null;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        AI Diagnosis
      </h3>

      {/* Diagnosis text */}
      <p className="text-sm text-gray-300 leading-relaxed">{incident.diagnosis}</p>

      {/* Confidence bar */}
      {pct !== null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Confidence</span>
            <span
              className={`text-xs font-semibold ${
                pct >= 80
                  ? "text-emerald-400"
                  : pct >= 50
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {pct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                pct >= 80
                  ? "bg-emerald-500"
                  : pct >= 50
                    ? "bg-yellow-400"
                    : "bg-red-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Suggested action */}
      {incident.suggested_action && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Suggested Action</p>
          <p className="text-sm font-medium text-white capitalize">
            {incident.suggested_action.replace(/_/g, " ")}
          </p>
        </div>
      )}

      {/* Reasoning */}
      {incident.diagnosis_reasoning && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300 transition list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            View reasoning
          </summary>
          <p className="mt-2 text-xs text-gray-400 leading-relaxed border-l-2 border-gray-700 pl-3">
            {incident.diagnosis_reasoning}
          </p>
        </details>
      )}

      {/* Referenced postmortems */}
      {incident.referenced_postmortem_titles &&
        incident.referenced_postmortem_titles.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Referenced Postmortems</p>
            <ul className="space-y-1">
              {incident.referenced_postmortem_titles.map((title) => (
                <li
                  key={title}
                  className="flex items-center gap-2 text-xs text-gray-300"
                >
                  <span className="h-1 w-1 rounded-full bg-indigo-400 shrink-0" />
                  {title}
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* Approve / Reject */}
      {canAutomate && isActionable && (
        <div className="pt-2 border-t border-gray-700">
          {actionError && (
            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {actionError}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onApprove}
              disabled={actionLoading}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? "Processing…" : "✓ Approve"}
            </button>
            <button
              onClick={onReject}
              disabled={actionLoading}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? "Processing…" : "✕ Reject"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
