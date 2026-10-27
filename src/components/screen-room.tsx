"use client";
import { useRoom } from "@/lib/use-room";
import { QR } from "./qr";
import { plural } from "./ui";

/** For the projector: the question being answered, the next few, and how to join. */
export function ScreenRoom({ code }: { code: string }) {
  const r = useRoom(code);
  const origin = window.location.origin;
  const { pinned, open } = r.ranked;
  const lead = pinned ?? open[0] ?? null;
  const next = (pinned ? open : open.slice(1)).slice(0, 3);
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <main className="flex min-h-dvh flex-col bg-ink p-10 text-paper">
      <header className="flex items-start justify-between gap-8">
        <div>
          <p className="text-lg text-paper/60">{r.room.title ?? "Floor"}</p>
          <p className="mt-1 text-sm text-paper/40">
            {plural(r.room.people.size, "person", "people")} in the room{r.mode === "local" ? " · demo mode" : ""}
          </p>
        </div>
        <div className="flex items-center gap-5 rounded-2xl bg-paper p-4 text-ink">
          {origin && <QR value={`${origin}/r/${code}`} size={120} label={`QR code to join room ${code}`} />}
          <div>
            <p className="text-sm text-mute">Ask at {host}</p>
            <p className="font-mono text-4xl font-semibold tracking-[0.2em]">{code}</p>
          </div>
        </div>
      </header>

      <section className="flex flex-1 flex-col justify-center py-10">
        {lead ? (
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

      {next.length > 0 && (
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
  );
}
