import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incident Response Platform",
  description: "Detect, triage, and resolve production incidents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/*
         * AuthProvider lives at the root so every page — login, callback,
         * dashboard — shares the same token state.
         */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
