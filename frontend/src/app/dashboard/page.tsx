"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useApiClient } from "@/lib/api-client";
import IncidentCard from "@/components/IncidentCard";
import type { Incident, IncidentListResponse, WsMessage } from "@/lib/types";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

// IDs of incidents that arrived via WS and should animate in
type AnimatedSet = Set<string>;

// Upsert a single incident into the list (add or replace by id)
function upsertIncident(list: Incident[], incoming: Incident): Incident[] {
  const idx = list.findIndex((i) => i.id === incoming.id);
  if (idx === -1) return [incoming, ...list]; // new → prepend
  const updated = [...list];
  updated[idx] = incoming;
  return updated;
}

// Column groupings
const COLUMNS: {
  id: string;
  label: string;
  statuses: Incident["status"][];
  accent: string;
  headerDot: string;
}[] = [
  {
    id: "open",
    label: "Open",
    statuses: ["open"],
    accent: "border-red-500/40",
    headerDot: "bg-red-500",
  },
  {
    id: "needs_attention",
    label: "Needs Attention",
    statuses: ["needs_manual_intervention"],
    accent: "border-yellow-400/40",
    headerDot: "bg-yellow-400",
  },
  {
    id: "resolved",
    label: "Resolved",
    statuses: ["resolved", "auto_recovered", "rejected"],
    accent: "border-emerald-500/40",
    headerDot: "bg-emerald-500",
  },
];

export default function DashboardPage() {
  const { token, logout } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [animatedIds, setAnimatedIds] = useState<AnimatedSet>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Initial fetch
  // Depends only on `apiFetch`, which is now memoised in useApiClient and
  // only changes when the token value itself changes.  This effect therefore
  // runs exactly once on mount (and again only after a login/logout).
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!apiFetch) return; // guard: should never be falsy, but keeps the linter happy
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch("/incidents?limit=100&offset=0");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: IncidentListResponse = await res.json();
        if (!cancelled) setIncidents(data.items);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load incidents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiFetch]); // apiFetch identity is stable — this runs once on mount

  // -----------------------------------------------------------------------
  // WebSocket connection
  //
  // connectWs is defined INSIDE the effect so it closes over the current
  // `token` without needing to be listed as an external dependency, and so
  // the reconnect timer's recursive call always gets a fresh reference
  // (no stale-closure problem).
  //
  // The effect itself depends only on `token` — it re-runs exactly when the
  // user logs in or out, not on every render.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!token) return;

    let hasClosed = false; // prevents reconnect after intentional unmount

    function connectWs() {
      const ws = new WebSocket(`${WS_URL}/ws/incidents?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data as string);
          if (data && data.id) {
            setIncidents((prev) => {
              const isNew = !prev.find((i) => i.id === data.id);
              if (isNew) {
                setAnimatedIds((s) => new Set(s).add(data.id));
                setTimeout(() => {
                  setAnimatedIds((s) => {
                    const next = new Set(s);
                    next.delete(data.id);
                    return next;
                  });
                }, 600);
              }
              return upsertIncident(prev, data);
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!hasClosed) {
          // Auto-reconnect after 3 s — only if the component is still mounted
          reconnectTimer.current = setTimeout(connectWs, 3000);
        }
      };

      ws.onerror = () => {
        ws.close(); // triggers onclose → reconnect
      };
    }

    connectWs();

    return () => {
      hasClosed = true; // suppress reconnect timer
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]); // re-run only when the token string changes (login / logout)

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  function handleLogout() {
    wsRef.current?.close();
    logout();
    router.replace("/login");
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Loading incidents…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ------------------------------------------------------------------ */}
      {/* Nav                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <nav className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-lg bg-indigo-600 p-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4 text-white"
              >
                <path
                  fillRule="evenodd"
                  d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <span className="font-semibold text-white">Incident Response</span>
          </div>

          {/* Links + status */}
          <div className="flex items-center gap-4">
            {/* WS indicator */}
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  wsConnected
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-gray-600"
                }`}
              />
              <span className="text-xs text-gray-400 hidden sm:inline">
                {wsConnected ? "Live" : "Offline"}
              </span>
            </div>

            <Link
              href="/dashboard/history"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              History
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Live Incident Board</h1>
          <p className="mt-1 text-sm text-gray-400">
            {incidents.length} incident{incidents.length !== 1 ? "s" : ""} total
            &nbsp;·&nbsp;
            {incidents.filter((i) => i.status === "open").length} open
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Kanban columns */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colIncidents = incidents
              .filter((i) => (col.statuses as string[]).includes(i.status))
              .sort(
                (a, b) =>
                  new Date(b.detected_at).getTime() -
                  new Date(a.detected_at).getTime(),
              );

            return (
              <div key={col.id} className="flex flex-col gap-3">
                {/* Column header */}
                <div
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 bg-gray-900 ${col.accent}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${col.headerDot}`}
                    />
                    <span className="font-semibold text-sm text-white">
                      {col.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                    {colIncidents.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 min-h-[8rem]">
                  {colIncidents.length === 0 ? (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/40 py-8 text-sm text-gray-600">
                      No incidents
                    </div>
                  ) : (
                    colIncidents.map((incident) => (
                      <IncidentCard
                        key={incident.id}
                        incident={incident}
                        animateIn={animatedIds.has(incident.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
