"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { recap } from "@/lib/room";
import { useRoom } from "@/lib/use-room";
import { HostButton, QuestionRow } from "./question";
import { QR } from "./qr";
import { RoomGate } from "./room-gate";
import { plural, StatusPill, Wordmark } from "./ui";
import { useNow } from "./use-now";

export function HostRoom({ code }: { code: string }) {
  const [title] = useState(() => sessionStorage.getItem(`floor:new:${code}`) ?? undefined);
  const r = useRoom(code, { host: true, title });
  const now = useNow();
  const opened = useRef(false);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = window.location.origin;


  useEffect(() => {
    if (!r.ready || opened.current || r.room.hostId || !title) return;
    opened.current = true;
    r.send({ kind: "room.open", title }).then(() => sessionStorage.removeItem(`floor:new:${code}`));
  }, [r, title, code]);

  const joinUrl = `${origin}/r/${code}`;
  const { pinned, open, answered } = r.ranked;

  async function copy(what: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  }

  if (r.ready && !r.room.hostId && !title)
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Wordmark />
        <h1 className="mt-10 text-2xl font-semibold">Room {code} has not been opened</h1>
        <p className="mt-3 text-mute">{r.mode === "local" ? "In demo mode a room only exists in the browser that opened it." : "Nobody has opened this room yet."} Start a new room to host one.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-ink px-4 py-2.5 font-medium text-paper">
          Start a room
        </Link>
      </main>
    );

  if (r.ready && r.room.hostId && !r.isHost)
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Wordmark />
        <h1 className="mt-10 text-2xl font-semibold">This room is hosted from another device</h1>
        <p className="mt-3 text-mute">Host controls stay with the browser that opened the room. You can still join as a guest.</p>
        <a href={`/r/${code}`} className="mt-6 inline-block rounded-xl bg-ink px-4 py-2.5 font-medium text-paper">
          Join as a guest
        </a>
      </main>
    );

  return (
    <RoomGate r={r} code={code}>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-5 sm:px-8">
        <header className="flex items-center justify-between gap-3">
          <Wordmark />
          <StatusPill status={r.status} mode={r.mode} />
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-line bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">You are hosting</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">{r.room.title ?? title ?? "Opening the room"}</h1>
              <div className="mt-5 flex justify-center">{origin && <QR value={joinUrl} size={200} label={`QR code to join room ${code}`} />}</div>
              <p className="mt-4 text-center font-mono text-3xl font-semibold tracking-[0.25em]">{code}</p>
              <p className="mt-1 text-center text-xs text-mute">{joinUrl.replace(/^https?:\/\//, "")}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <HostButton onClick={() => copy("link", joinUrl)}>{copied === "link" ? "Copied" : "Copy link"}</HostButton>
                <HostButton onClick={() => window.open(`/r/${code}/screen`, "_blank", "noopener")}>Screen view</HostButton>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-card p-5 text-sm">
              <dl className="grid grid-cols-3 text-center">
                <div>
                  <dt className="text-mute">People</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{r.room.people.size}</dd>
                </div>
                <div>
                  <dt className="text-mute">Open</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{open.length + (pinned ? 1 : 0)}</dd>
                </div>
                <div>
                  <dt className="text-mute">Answered</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{answered.length}</dd>
                </div>
              </dl>
              <button onClick={() => copy("recap", recap(r.room))} className="mt-5 w-full rounded-xl border border-ink px-4 py-2.5 font-medium hover:bg-ink hover:text-paper">
                {copied === "recap" ? "Recap copied" : "Copy recap"}
              </button>
            </div>
          </aside>

          <section>
            {pinned ? (
              <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">Answering now</p>
                <ol>
                  <QuestionRow
                    q={pinned}
                    meId={r.me?.userId ?? null}
                    now={now}
                    emphasis
                    hostActions={
                      <>
                        <HostButton tone="primary" onClick={() => r.send({ kind: "q.answer", qid: pinned.qid, answered: true })}>
                          Done, next
                        </HostButton>
                        <HostButton tone="quiet" onClick={() => r.send({ kind: "q.pin", qid: null })}>
                          Unpin
                        </HostButton>
                      </>
                    }
                  />
                </ol>
              </div>
            ) : open[0] ? (
              <div className="mb-6 flex items-center justify-between rounded-2xl bg-accent-soft p-4 text-sm">
                <span className="text-accent">Top question has {plural(open[0].voters.size, "vote")}. Pin it when you start answering.</span>
                <HostButton tone="primary" onClick={() => r.send({ kind: "q.pin", qid: open[0].qid })}>
                  Answer top question
                </HostButton>
              </div>
            ) : null}

            <h2 className="text-sm font-semibold text-mute">Queue, most votes first</h2>
            <ol className="mt-3 space-y-3">
              {open.map((q) => (
                <QuestionRow
                  key={q.qid}
                  q={q}
                  meId={r.me?.userId ?? null}
                  now={now}
                  hostActions={
                    <>
                      <HostButton onClick={() => r.send({ kind: "q.pin", qid: q.qid })}>Answer now</HostButton>
                      <HostButton onClick={() => r.send({ kind: "q.answer", qid: q.qid, answered: true })}>Mark answered</HostButton>
                      <HostButton tone="quiet" onClick={() => r.send({ kind: "q.hide", qid: q.qid })}>
                        Hide
                      </HostButton>
                    </>
                  }
                />
              ))}
              {open.length === 0 && !pinned && (
                <li className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-mute">Questions will appear here as people ask them. Share the code or the QR to get started.</li>
              )}
            </ol>

            {answered.length > 0 && (
              <>
                <h2 className="mt-10 text-sm font-semibold text-mute">Answered</h2>
                <ol className="mt-3 space-y-3">
                  {answered.map((q) => (
                    <QuestionRow
                      key={q.qid}
                      q={q}
                      meId={r.me?.userId ?? null}
                      now={now}
                      hostActions={
                        <HostButton tone="quiet" onClick={() => r.send({ kind: "q.answer", qid: q.qid, answered: false })}>
                          Reopen
                        </HostButton>
                      }
                    />
                  ))}
                </ol>
              </>
            )}
          </section>
        </div>
      </main>
    </RoomGate>
  );
}
