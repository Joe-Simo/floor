"use client";
import { useMemo, useState } from "react";
import { askWait, lookalikes, MAX_CHAT, MAX_QUESTION } from "@/lib/room";
import { saveName, useRoom } from "@/lib/use-room";
import { QuestionRow } from "./question";
import { RecapView } from "./recap-view";
import { clock, every, plural, StatusPill, timeOfDay, Wordmark } from "./ui";
import { useNow } from "./use-now";
import { RoomGate } from "./room-gate";

export function AttendeeRoom({ code }: { code: string }) {
  const r = useRoom(code);
  const slow = r.room.slowSeconds;
  const now = useNow(slow > 0 ? 1000 : 30_000);
  const [picked, setTab] = useState<"questions" | "chat" | "recap" | null>(null);
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showAnswered, setShowAnswered] = useState(false);
  const meId = r.me?.userId ?? null;
  const similar = useMemo(() => lookalikes(r.room, draft), [r.room, draft]);
  const ended = r.room.endedAt !== null;
  // When the session ends everyone lands on the recap, unless they choose another tab.
  const tab = picked === "recap" && !ended ? "questions" : (picked ?? (ended ? "recap" : "questions"));
  const wait = meId ? Math.min(askWait(r.room, meId, now), slow * 1000) : 0;

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (text.length < 3 || busy || wait > 0 || ended) return;
    setBusy(true);
    setNote(null);
    try {
      await r.send({ kind: "q.ask", qid: `q-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, name: r.me?.name || undefined });
      setDraft("");
      setNote(slow > 0 ? `Asked. Slow mode is on, so your next question opens in ${every(slow)}.` : "Asked. It is on the list below.");
    } catch {
      setNote("That did not send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function say(e: React.FormEvent) {
    e.preventDefault();
    const text = chat.trim();
    if (!text || ended) return;
    setChat("");
    await r.send({ kind: "chat.say", text, name: r.me?.name || undefined }).catch(() => setChat(text));
  }

  const { pinned, open, answered } = r.ranked;

  return (
    <RoomGate r={r} code={code}>
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Wordmark />
          <StatusPill status={r.status} mode={r.mode} />
        </header>

        <div className="mt-6">
          <p className="font-mono text-xs tracking-[0.25em] text-mute">ROOM {code}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.room.title ?? "Waiting for the host"}</h1>
          <p className="mt-1 text-sm text-mute">
            {plural(r.room.people.size, "person", "people")} · {ended ? `Ended at ${timeOfDay(r.room.endedAt!)}` : plural(open.length + (pinned ? 1 : 0), "open question")}
          </p>
        </div>

        {ended ? (
          <div className="rise mt-6 rounded-2xl bg-ink p-5 text-paper" data-testid="ended">
            <h2 className="text-lg font-semibold">This session has ended</h2>
            <p className="mt-1 text-sm text-paper/70">Thanks for your questions. Here is what the room asked, and what got answered.</p>
          </div>
        ) : (
          <NameField name={r.me?.name ?? ""} onSave={(n) => r.setMe(saveName(n))} />
        )}

        <div className="mt-6 flex gap-1 rounded-xl bg-line/60 p-1 text-sm font-medium" role="tablist">
          {(ended ? (["recap", "questions", "chat"] as const) : (["questions", "chat"] as const)).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-2 capitalize ${tab === t ? "bg-card shadow-sm" : "text-mute hover:text-ink"}`}
            >
              {t === "chat" ? `Chat${r.room.chat.length ? ` (${r.room.chat.length})` : ""}` : t === "recap" ? "Recap" : "Questions"}
            </button>
          ))}
        </div>

        {tab === "recap" ? (
          <div className="mt-4">
            <RecapView room={r.room} />
          </div>
        ) : tab === "questions" ? (
          <>
            {!ended && (
              <form onSubmit={ask} className="mt-4 rounded-2xl border border-line bg-card p-4">
                <label htmlFor="ask" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="ask"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_QUESTION))}
                  rows={2}
                  placeholder="Ask the speaker something"
                  className="w-full resize-none bg-transparent text-base outline-none placeholder:text-mute"
                />
                {similar.length > 0 && (
                  <div className="mt-2 rounded-xl bg-accent-soft p-3 text-sm">
                    <p className="font-medium text-accent">Someone may have asked this already</p>
                    <ul className="mt-2 space-y-2">
                      {similar.map((q) => (
                        <li key={q.qid} className="flex items-start justify-between gap-3">
                          <span className="text-ink">{q.text}</span>
                          {q.by !== meId && !q.voters.has(meId ?? "") && (
                            <button
                              type="button"
                              onClick={() => {
                                r.send({ kind: "q.vote", qid: q.qid, up: true });
                                setDraft("");
                                setNote("Upvoted instead. Good call.");
                              }}
                              className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                            >
                              Upvote this
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs tabular-nums text-mute">
                    {draft.length}/{MAX_QUESTION}
                  </span>
                  <button
                    disabled={busy || draft.trim().length < 3 || !r.canSend || wait > 0}
                    aria-describedby={slow > 0 ? "slow-note" : undefined}
                    className="rounded-xl bg-ink px-4 py-2 text-sm font-medium tabular-nums text-paper disabled:opacity-40"
                  >
                    {wait > 0 ? `Ask in ${clock(wait)}` : "Ask"}
                  </button>
                </div>
                {slow > 0 && (
                  <p id="slow-note" className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-mute" data-testid="slow-note">
                    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden>
                      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span>
                      Slow mode is on: one question per person every {every(slow)}, so the best ones get room to rise.
                      {wait > 0 && " Meanwhile, upvote the ones you want answered."}
                    </span>
                  </p>
                )}
              </form>
            )}
            {note && (
              <p className="mt-2 text-sm text-mute" role="status">
                {note}
              </p>
            )}

            <ol className="mt-5 space-y-3" aria-label="Questions, most votes first">
              {pinned && (
                <>
                  <li className="text-xs font-semibold uppercase tracking-wider text-accent">Being answered now</li>
                  <QuestionRow q={pinned} meId={meId} now={now} emphasis onVote={ended ? undefined : (up) => r.send({ kind: "q.vote", qid: pinned.qid, up })} />
                </>
              )}
              {open.map((q) => (
                <QuestionRow
                  key={q.qid}
                  q={q}
                  meId={meId}
                  now={now}
                  onVote={ended ? undefined : (up) => r.send({ kind: "q.vote", qid: q.qid, up })}
                  onRetract={ended ? undefined : () => r.send({ kind: "q.retract", qid: q.qid })}
                />
              ))}
              {!pinned && open.length === 0 && (
                <li className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-mute">{ended ? "No open questions were left." : "No questions yet. Be the first."}</li>
              )}
            </ol>

            {answered.length > 0 && (
              <div className="mt-8">
                <button onClick={() => setShowAnswered((s) => !s)} className="text-sm font-medium text-mute hover:text-ink" aria-expanded={showAnswered}>
                  {showAnswered ? "Hide" : "Show"} {plural(answered.length, "answered question")}
                </button>
                {showAnswered && (
                  <ol className="mt-3 space-y-3">
                    {answered.map((q) => (
                      <QuestionRow key={q.qid} q={q} meId={meId} now={now} />
                    ))}
                  </ol>
                )}
              </div>
            )}
          </>
        ) : (
          <section className="mt-4 rounded-2xl border border-line bg-card">
            <ol className="max-h-[55dvh] space-y-3 overflow-y-auto p-4" aria-live="polite">
              {r.room.chat.length === 0 && <li className="py-6 text-center text-sm text-mute">Side chat for the room. Say hello.</li>}
              {r.room.chat.map((c) => (
                <li key={c.id} className={`rise ${c.by === meId ? "text-right" : ""}`}>
                  <p className="text-xs text-mute">{c.by === meId ? "You" : c.name || "Anonymous"}</p>
                  <p className={`mt-0.5 inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left ${c.by === meId ? "bg-ink text-paper" : "bg-paper"}`}>{c.text}</p>
                </li>
              ))}
            </ol>
            {ended ? (
              <p className="border-t border-line p-4 text-center text-sm text-mute">Chat closed when the session ended.</p>
            ) : (
              <form onSubmit={say} className="flex gap-2 border-t border-line p-3">
                <label htmlFor="chat" className="sr-only">
                  Message
                </label>
                <input
                  id="chat"
                  value={chat}
                  onChange={(e) => setChat(e.target.value.slice(0, MAX_CHAT))}
                  placeholder="Message the room"
                  className="min-w-0 flex-1 rounded-xl bg-paper px-3 py-2 outline-none"
                />
                <button className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40" disabled={!chat.trim() || !r.canSend}>
                  Send
                </button>
              </form>
            )}
          </section>
        )}
      </main>
    </RoomGate>
  );
}

function NameField({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing)
    return (
      <p className="mt-3 text-sm text-mute">
        Posting as <span className="font-medium text-ink">{name || "Anonymous"}</span>.{" "}
        <button
          className="underline underline-offset-2 hover:text-ink"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          {name ? "Change" : "Add your name"}
        </button>
      </p>
    );
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
        setEditing(false);
      }}
    >
      <label htmlFor="name" className="sr-only">
        Your name
      </label>
      <input
        id="name"
        autoFocus
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your name (optional)"
        className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <button className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper">Save</button>
    </form>
  );
}
