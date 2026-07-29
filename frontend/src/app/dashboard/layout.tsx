import AuthGuard from "@/components/AuthGuard";
import type { ReactNode } from "react";

/**
 * Every route under /dashboard/* is wrapped by AuthGuard.
 * No token in React state → redirect to /login.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
