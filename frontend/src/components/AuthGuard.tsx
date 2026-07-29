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
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  // Render nothing while the redirect is in flight to avoid a flash of
  // protected content.
  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-400">Redirecting…</p>
      </main>
    );
  }

  return <>{children}</>;
}
