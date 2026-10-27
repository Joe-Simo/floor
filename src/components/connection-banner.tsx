"use client";
import { useEffect, useState } from "react";

type Connection = "ok" | "offline" | "reconnecting";

/**
 * A slim, calm bar that says when the room has lost its connection and when it is back.
 * The live region is always mounted so screen readers hear each change once.
 */
export function ConnectionBanner({ connection, mode, dark = false }: { connection: Connection; mode: "local" | "nexconn" | null; dark?: boolean }) {
  const [prev, setPrev] = useState<Connection>(connection);
  // Counts recoveries, so each "back online" note gets its own timer. Null hides the note.
  const [backAt, setBackAt] = useState<number | null>(null);
  if (prev !== connection) {
    setPrev(connection);
    setBackAt(connection === "ok" ? (backAt ?? 0) + 1 : null);
  }

  useEffect(() => {
    if (backAt === null) return;
    const id = setTimeout(() => setBackAt(null), 3000);
    return () => clearTimeout(id);
  }, [backAt]);

  const state = connection !== "ok" ? connection : backAt !== null ? "back" : null;
  const text =
    state === "offline"
      ? mode === "local"
        ? "You are offline. This demo room keeps working in this browser."
        : "You are offline. Everything here is kept, and Floor reconnects on its own when your network is back."
      : state === "reconnecting"
        ? "Reconnecting to the room. Nothing is lost."
        : state === "back"
          ? "Back online. You are up to date."
          : "";

  const tone = dark
    ? state === "back"
      ? "bg-[#1f3a2c] text-[#bfe6cf]"
      : "bg-[#3a3326] text-[#f3dfb0]"
    : state === "back"
      ? "bg-ok-soft text-ok"
      : state === "offline"
        ? "bg-warn-soft text-warn"
        : "bg-line text-ink";

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sticky top-0 z-20">
      {state && (
        <p className={`rise flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium ${tone}`} data-connection={state}>
          <span className={`size-2 shrink-0 rounded-full bg-current ${state === "back" ? "" : "breathe"}`} aria-hidden />
          {text}
        </p>
      )}
    </div>
  );
}
