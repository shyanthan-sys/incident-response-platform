"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 text-white">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-gray-400">You are authenticated! 🎉</p>
      <button
        onClick={handleLogout}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-700 transition"
      >
        Sign out
      </button>
    </main>
  );
}
