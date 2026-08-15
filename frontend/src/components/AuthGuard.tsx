"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Wraps any client component tree and redirects to /login when there is no
 * token in the auth context.
 *
 * Usage: wrap the layout of every protected section with <AuthGuard>.
 *
 * NOTE: Because the token lives only in React state (not localStorage), a
 * hard page refresh will clear it and the guard will redirect the user to
 * /login. That is the intentional tradeoff for this portfolio project.
 *
 * `ready` is false on the very first synchronous render (before any useEffect
 * has run). We must NOT redirect until ready=true, otherwise every client-side
 * navigation into a /dashboard/* route will incorrectly bounce to /login
 * because the new layout segment mounts with isAuthenticated=false before
 * React has propagated the in-memory token through the context tree.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect once we know the auth state is settled.
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, ready, router]);

  // While auth state is still being determined, render a neutral screen.
  // This covers: (a) the first render before useEffect fires, and
  // (b) the brief moment after redirect is queued but before navigation completes.
  if (!ready || !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-400">
          {!ready ? "Loading…" : "Redirecting…"}
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
