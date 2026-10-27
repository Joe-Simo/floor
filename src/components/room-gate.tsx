"use client";
import type { useRoom } from "@/lib/use-room";
import { Wordmark } from "./ui";

/** Shows a calm full-page state while joining or when joining failed, otherwise the room. */
export function RoomGate({ r, code, children }: { r: ReturnType<typeof useRoom>; code: string; children: React.ReactNode }) {
  if (r.error)
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Wordmark />
        <h1 className="mt-10 text-2xl font-semibold">Could not open room {code}</h1>
        <p className="mt-3 text-mute">{r.error}</p>
        <a href={`/r/${code}`} className="mt-6 inline-block rounded-xl bg-ink px-4 py-2.5 font-medium text-paper">
          Try again
        </a>
      </main>
    );
  return (
    <>
      {r.mode === "local" && (
        <div className="bg-accent-soft px-4 py-2 text-center text-xs text-accent">Demo mode: this room lives in this browser only. Open it in a second tab to see it update live.</div>
      )}
      {children}
    </>
  );
}
