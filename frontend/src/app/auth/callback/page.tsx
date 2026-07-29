"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";

// ---------------------------------------------------------------------------
// Inner component — must be wrapped in <Suspense> because useSearchParams()
// requires it in the Next.js App Router.
// ---------------------------------------------------------------------------

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Destructure both setToken AND the live token value from context so we
  // can watch for the state update in the second effect below.
  const { token, setToken } = useAuth();

  // Effect 1 — runs once on mount.
  // Reads the token from the URL query string and writes it into context state.
  // Does NOT navigate — navigation happens only after React confirms the write
  // in Effect 2 below.
  useEffect(() => {
    const rawToken = searchParams.get("token");

    if (!rawToken) {
      // No token in URL — something went wrong on the backend side.
      router.replace("/login?error=missing_token");
      return;
    }

    // This schedules a state update; the new value is NOT yet visible to any
    // component — React will re-render on the next commit cycle.
    setToken(rawToken);
  }, [searchParams, router, setToken]);

  // Effect 2 — runs whenever `token` changes in context.
  // By the time this effect fires, React has committed the setToken() update,
  // so AuthGuard on /dashboard will read isAuthenticated = true on its very
  // first render — eliminating the race condition.
  useEffect(() => {
    if (token) {
      router.replace("/dashboard");
    }
  }, [token, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <svg
          className="h-10 w-10 animate-spin text-indigo-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm text-gray-400">Completing sign-in…</p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page export — Suspense boundary required by Next.js for useSearchParams
// ---------------------------------------------------------------------------

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-950">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
