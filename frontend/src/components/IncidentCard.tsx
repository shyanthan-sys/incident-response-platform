"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import StatusBadge from "@/components/StatusBadge";
import {
  type Incident,
  alertTypeLabel,
  severityBorderClass,
  severityDotClass,
  timeAgo,
} from "@/lib/types";

interface IncidentCardProps {
  incident: Incident;
  /** When true the card animates in — set for newly arrived WS incidents */
  animateIn?: boolean;
}

export default function IncidentCard({
  incident,
  animateIn = false,
}: IncidentCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  // Trigger the fade+slide animation by toggling a class after mount
  useEffect(() => {
    if (!animateIn || !cardRef.current) return;
    const el = cardRef.current;
    // Start invisible + shifted down
    el.classList.add("opacity-0", "translate-y-2");
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.remove("opacity-0", "translate-y-2");
        el.classList.add("opacity-100", "translate-y-0");
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [animateIn]);

  const dotColor = severityDotClass(incident.severity);
  const borderColor = severityBorderClass(incident.severity);

  return (
    <Link
      ref={cardRef}
      href={`/dashboard/incidents/${incident.id}`}
      className={`
        block rounded-xl border bg-gray-900 p-4 shadow-sm transition-all duration-300
        hover:bg-gray-800 hover:shadow-md hover:-translate-y-0.5 cursor-pointer
        ${borderColor}
        ${animateIn ? "opacity-0 translate-y-2" : "opacity-100"}
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
          <span className="font-semibold text-white truncate text-sm">
            {incident.service_name}
          </span>
        </div>
        <StatusBadge status={incident.status} />
      </div>

      {/* Alert type */}
      <p className="mt-2 text-xs text-gray-400 pl-4">
        {alertTypeLabel(incident.alert_type)}
      </p>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between pl-4">
        <span className="text-xs text-gray-500">
          {timeAgo(incident.detected_at)}
        </span>
        <span
          className={`text-xs font-medium capitalize ${
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
      </div>

      {/* Diagnosis snippet if available */}
      {incident.diagnosis && (
        <p className="mt-2 pl-4 text-xs text-gray-500 line-clamp-2 italic border-t border-gray-800 pt-2">
          {incident.diagnosis}
        </p>
      )}
    </Link>
  );
}
