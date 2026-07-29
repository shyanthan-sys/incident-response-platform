"use client";

import { type IncidentStatus, statusLabel } from "@/lib/types";

interface StatusBadgeProps {
  status: IncidentStatus;
  /** Optional extra class names */
  className?: string;
}

const STATUS_STYLES: Record<
  IncidentStatus,
  { dot: string; text: string; bg: string }
> = {
  open: {
    dot: "bg-red-500",
    text: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
  },
  needs_manual_intervention: {
    dot: "bg-yellow-400",
    text: "text-yellow-300",
    bg: "bg-yellow-400/10 border-yellow-400/30",
  },
  auto_recovered: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/30",
  },
  resolved: {
    dot: "bg-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  rejected: {
    dot: "bg-gray-500",
    text: "text-gray-400",
    bg: "bg-gray-500/10 border-gray-500/30",
  },
};

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const { dot, text, bg } = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${bg} ${text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {statusLabel(status)}
    </span>
  );
}
