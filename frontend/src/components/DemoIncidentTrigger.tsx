"use client";

import { useEffect, useRef, useState } from "react";

const CHAOS_SERVICE_URL =
  process.env.NEXT_PUBLIC_CHAOS_SERVICE_URL ?? "http://localhost:8001";

const CHAOS_OPTIONS = [
  {
    id: "high_latency",
    label: "High Latency",
    desc: "Simulates 5-10s response delays",
    icon: "⏱️",
  },
  {
    id: "high_errors",
    label: "High Errors",
    desc: "Triggers ~40% HTTP 500 server errors",
    icon: "💥",
  },
  {
    id: "service_down",
    label: "Service Down",
    desc: "Simulates complete service outage (HTTP 503)",
    icon: "🚫",
  },
  {
    id: "high_cpu",
    label: "High CPU",
    desc: "Spikes CPU load to 90-99%",
    icon: "🔥",
  },
] as const;

export default function DemoIncidentTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      setCooldownLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft]);

  async function triggerChaos(type: string) {
    setIsOpen(false);
    setLoading(true);
    setToastMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`${CHAOS_SERVICE_URL}/chaos/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, duration_seconds: 60 }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { detail?: string }).detail ?? `HTTP ${res.status}`
        );
      }

      setToastMessage("Demo incident triggered — watch it appear below");
      setCooldownLeft(10); // 10s debounce
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to trigger demo incident"
      );
    } finally {
      setLoading(false);
    }
  }

  const isBtnDisabled = loading || cooldownLeft > 0;

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-gray-900 to-indigo-950/40 p-4 shadow-lg mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-white">Live System Demo</h3>
          </div>
          <p className="text-xs text-gray-400 max-w-xl leading-relaxed">
            This is a live demo — trigger a simulated incident to see the AI diagnosis and remediation flow in action
          </p>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            disabled={isBtnDisabled}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Triggering…</span>
              </>
            ) : cooldownLeft > 0 ? (
              <span>Cooldown ({cooldownLeft}s)</span>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M13.5 4.938a7 7 0 11-9.006 1.737c.202-.257.59-.218.74.082l.258.517a.5.5 0 00.707.194l1.45-1.088a.5.5 0 00.1-0.672L6.89 4.316a.5.5 0 00-.73-.082l-.448.336A9 9 0 1018 10a.75.75 0 00-1.5 0 7.5 7.5 0 01-3-5.062z"
                    clipRule="evenodd"
                  />
                  <path d="M10 2a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0v-5.5A.75.75 0 0110 2z" />
                </svg>
                <span>Trigger Demo Incident</span>
                <span className="ml-1 text-[10px]">▼</span>
              </>
            )}
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute right-0 mt-2 w-72 z-20 rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-2xl space-y-1">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-800">
                Select Chaos Incident
              </div>
              {CHAOS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => triggerChaos(opt.id)}
                  className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-gray-800 transition-colors group"
                >
                  <span className="text-base leading-none mt-0.5">{opt.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-200 group-hover:text-white">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-gray-400 group-hover:text-gray-300">
                      {opt.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {toastMessage && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
