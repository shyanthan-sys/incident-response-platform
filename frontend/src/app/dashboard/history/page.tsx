"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApiClient } from "@/lib/api-client";
import StatusBadge from "@/components/StatusBadge";
import type { Incident, IncidentListResponse } from "@/lib/types";
import { alertTypeLabel, timeAgo } from "@/lib/types";

const PAGE_SIZE = 20;

const RESOLVED_STATUSES = ["resolved", "auto_recovered", "rejected"] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function HistoryPage() {
  const { apiFetch } = useApiClient();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        // Fetch all three resolved statuses in parallel then merge + sort
        const offset = pageNum * PAGE_SIZE;
        const responses = await Promise.all(
          RESOLVED_STATUSES.map((s) =>
            apiFetch(
              `/incidents?status=${s}&limit=${PAGE_SIZE}&offset=${offset}`,
            ).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json() as Promise<IncidentListResponse>;
            }),
          ),
        );

        const merged = responses
          .flatMap((r) => r.items)
          .sort(
            (a, b) =>
              new Date(b.detected_at).getTime() -
              new Date(a.detected_at).getTime(),
          );
        const totalMerged = responses.reduce((sum, r) => sum + r.total, 0);

        setIncidents(merged);
        setTotal(totalMerged);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    fetchHistory(page);
  }, [fetchHistory, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Live Board
          </Link>
          <span className="text-gray-700">/</span>
          <span className="text-sm text-gray-300">History</span>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Incident History</h1>
          <p className="mt-1 text-sm text-gray-400">
            Resolved, auto-recovered, and rejected incidents
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-gray-400">Loading history…</p>
            </div>
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-gray-500">No resolved incidents yet.</p>
            <Link
              href="/dashboard"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition"
            >
              Back to live board
            </Link>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Service
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Alert Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Detected
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Age at Detection
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Confidence
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-950">
                  {incidents.map((incident) => {
                    const pct =
                      incident.diagnosis_confidence !== null
                        ? Math.round(incident.diagnosis_confidence * 100)
                        : null;
                    return (
                      <tr
                        key={incident.id}
                        className="hover:bg-gray-900 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          {incident.service_name}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {alertTypeLabel(incident.alert_type)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`capitalize text-xs font-semibold ${
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
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={incident.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {formatDate(incident.detected_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {timeAgo(incident.detected_at)}
                        </td>
                        <td className="px-4 py-3">
                          {pct !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    pct >= 80
                                      ? "bg-emerald-500"
                                      : pct >= 50
                                        ? "bg-yellow-400"
                                        : "bg-red-500"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span
                                className={`text-xs ${
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
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/incidents/${incident.id}`}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition whitespace-nowrap"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Page {page + 1} of {totalPages} &middot; {total} total
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
