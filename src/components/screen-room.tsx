"use client";
import { useMemo } from "react";
import { summarize } from "@/lib/room";
import { useRoom } from "@/lib/use-room";
import { ConnectionBanner } from "./connection-banner";
import { QR } from "./qr";
import { every, plural } from "./ui";

/** For the projector: the question being answered, the next few, and how to join. */
export function ScreenRoom({ code }: { code: string }) {
  const r = useRoom(code);
  const origin = window.location.origin;
  const { pinned, open } = r.ranked;
  const lead = pinned ?? open[0] ?? null;
  const next = (pinned ? open : open.slice(1)).slice(0, 3);
  const host = origin.replace(/^https?:\/\//, "");
  const ended = r.room.endedAt !== null;
  const summary = useMemo(() => (ended ? summarize(r.room) : null), [ended, r.room]);

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-paper">
      <ConnectionBanner connection={r.connection} mode={r.mode} dark />
      <main className="flex flex-1 flex-col p-10">
        <header className="flex items-start justify-between gap-8">
          <div>
            <p className="text-lg text-paper/60">{r.room.title ?? "Floor"}</p>
            <p className="mt-1 text-sm text-paper/40">
              {plural(r.room.people.size, "person", "people")} in the room{r.mode === "local" ? " · demo mode" : ""}
            </p>
            {!ended && r.room.slowSeconds > 0 && <p className="mt-1 text-sm text-paper/40">Slow mode: one question each every {every(r.room.slowSeconds)}</p>}
          </div>
          <div className="flex items-center gap-5 rounded-2xl bg-paper p-4 text-ink">
            {origin && <QR value={`${origin}/r/${code}`} size={120} label={`QR code to join room ${code}`} />}
            <div>
              <p className="text-sm text-mute">
                {ended ? "Recap at" : "Ask at"} {host}
              </p>
              <p className="font-mono text-4xl font-semibold tracking-[0.2em]">{code}</p>
            </div>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10" aria-live="polite">
          {summary ? (
            <div className="rise" data-testid="screen-ended">
              <p className="text-xl font-medium text-[#9db4f5]">That is a wrap</p>
              <p className="mt-4 max-w-5xl text-5xl font-semibold leading-tight tracking-tight lg:text-6xl">Thank you for the questions.</p>
              <p className="mt-6 text-xl text-paper/60">
                {plural(summary.asked, "question")} from {plural(summary.people, "person", "people")} · {summary.answeredCount} answered
                {summary.minutes !== null ? ` · ${summary.minutes} min` : ""}
              </p>
            </div>
          ) : lead ? (
            <>
              <p className="text-xl font-medium text-[#9db4f5]">{pinned ? "Answering now" : "Top question"}</p>
              <p className="mt-4 max-w-5xl text-5xl font-semibold leading-tight tracking-tight lg:text-6xl">{lead.text}</p>
              <p className="mt-6 text-xl text-paper/50">
                {plural(lead.voters.size, "vote")} · {lead.name || "Anonymous"}
              </p>
            </>
          ) : (
            <p className="max-w-4xl text-5xl font-semibold leading-tight tracking-tight text-paper/80">Scan the code and ask the first question.</p>
          )}
        </section>

        {summary && summary.top.length > 0 && (
          <footer className="border-t border-paper/15 pt-6">
            <p className="text-sm text-paper/50">Most wanted</p>
            <ol className="mt-2 grid gap-4 md:grid-cols-3">
              {summary.top.map((q) => (
                <li key={q.qid}>
                  <p className="text-sm tabular-nums text-paper/50">
                    {plural(q.voters.size, "vote")}
                    {q.answeredAt !== null ? " · answered" : ""}
                  </p>
                  <p className="mt-1 line-clamp-3 text-lg leading-snug">{q.text}</p>
                </li>
              ))}
            </ol>
          </footer>
        )}

        {!summary && next.length > 0 && (
          <footer className="grid gap-4 border-t border-paper/15 pt-6 md:grid-cols-3">
            {next.map((q) => (
              <div key={q.qid} className="rise">
                <p className="text-sm tabular-nums text-paper/50">{plural(q.voters.size, "vote")}</p>
                <p className="mt-1 line-clamp-3 text-lg leading-snug">{q.text}</p>
              </div>
            ))}
          </footer>
        )}
      </main>
    </div>
  );
}
