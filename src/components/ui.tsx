"use client";
import Link from "next/link";
import type { TransportStatus } from "@/lib/transport/types";

export function StatusPill({ status, mode }: { status: TransportStatus; mode: "local" | "nexconn" | null }) {
  const label = status === "live" ? (mode === "local" ? "Demo mode" : "Live") : status === "connecting" ? "Connecting" : status === "offline" ? "Offline, retrying" : "Not connected";
  const tone = status === "live" ? (mode === "local" ? "bg-accent-soft text-accent" : "bg-ok-soft text-ok") : "bg-line text-mute";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`} role="status" aria-live="polite">
      <span className={`size-1.5 rounded-full ${status === "live" ? "bg-current" : "bg-mute"}`} aria-hidden />
      {label}
    </span>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1d1c1a" />
        <path d="M9 22h14M11 17h10M13 12h6" stroke="#f6f4ef" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      Floor
    </Link>
  );
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

/** "0:42" style countdown. */
export function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "1 minute", "30 seconds", "2 minutes": how slow mode reads in a sentence. */
export function every(seconds: number) {
  if (seconds % 60 === 0) return seconds === 60 ? "minute" : `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

/** Short time of day in the viewer's locale, for "ended at". */
export function timeOfDay(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
