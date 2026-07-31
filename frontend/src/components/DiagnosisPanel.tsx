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
  const isActionable = incident.status === "open";

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
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onApprove}
              disabled={actionLoading}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? "Processing…" : "✓ Approve"}
            </button>
            <button
              onClick={onReject}
              disabled={actionLoading}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 sm:py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading ? "Processing…" : "✕ Reject"}
            </button>
          </div>
        </div>
      )}

      {/* Needs Manual Intervention Notice */}
      {incident.status === "needs_manual_intervention" && (
        <div className="pt-2 border-t border-gray-700">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-500/20 p-1 text-amber-400 shrink-0 mt-0.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-amber-300">
                  Manual Investigation Required
                </h4>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Automated remediation was attempted but failed after retries. This incident requires manual investigation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
