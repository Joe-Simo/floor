"use client";
import { useMemo, useState } from "react";
import { recap, summarize, type Group, type RoomState } from "@/lib/room";
import { plural } from "./ui";

/** The end-of-session summary: what people wanted most, what got answered, what is still open. */
export function RecapView({ room, onMarkAnswered, headingLevel = 2 }: { room: RoomState; onMarkAnswered?: (qid: string) => void; headingLevel?: 2 | 3 }) {
  const s = useMemo(() => summarize(room), [room]);
  const markdown = useMemo(() => recap(room), [room]);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const H = `h${headingLevel}` as "h2" | "h3";
  const Sub = `h${headingLevel + 1}` as "h3" | "h4";

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${
      (s.title || "floor")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "floor"
    }-recap.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-labelledby="recap-title" className="rounded-2xl border border-line bg-card p-5 sm:p-6" data-testid="recap">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-mute">Recap</p>
          <H id="recap-title" className="mt-1 text-xl font-semibold tracking-tight">
            {s.title}
          </H>
          {s.minutes !== null && <p className="mt-1 text-sm text-mute">Ran {s.minutes} min</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-paper hover:opacity-90">
            {copied === "copied" ? "Copied" : copied === "failed" ? "Copy blocked" : "Copy Markdown"}
          </button>
          <button type="button" onClick={download} className="rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium hover:border-ink">
            Download
          </button>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {copied === "copied" ? "Recap copied as Markdown." : copied === "failed" ? "The browser blocked copying. Use Download instead." : ""}
      </p>

      <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
        {[
          ["People", s.people],
          ["Asked", s.asked],
          ["Answered", s.answeredCount],
          ["Open", s.openCount],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-paper px-1 py-3">
            <dt className="text-xs text-mute">{k}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {s.asked === 0 ? (
        <p className="mt-6 text-sm text-mute">No questions were asked in this session.</p>
      ) : (
        <>
          {s.top.length > 0 && (
            <div className="mt-6">
              <Sub className="text-sm font-semibold text-mute">Most wanted</Sub>
              <ol className="mt-2 space-y-2">
                {s.top.map((q, i) => (
                  <li key={q.qid} className="flex items-baseline gap-3">
                    <span className="w-5 shrink-0 text-right font-mono text-sm text-mute" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 break-words">{q.text}</span>
                    <span className="shrink-0 text-xs tabular-nums text-mute">
                      {plural(q.voters.size, "vote")}
                      {q.answeredAt !== null && <span className="ml-1.5 rounded-full bg-ok-soft px-2 py-0.5 font-medium text-ok">Answered</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <GroupList title="Still open" groups={s.open} Sub={Sub} onMarkAnswered={onMarkAnswered} empty="Every question got an answer." />
          <GroupList title="Answered" groups={s.answered} Sub={Sub} empty="Nothing was marked answered." />
        </>
      )}
    </section>
  );
}

function GroupList({ title, groups, Sub, onMarkAnswered, empty }: { title: string; groups: Group[]; Sub: "h3" | "h4"; onMarkAnswered?: (qid: string) => void; empty: string }) {
  return (
    <div className="mt-6">
      <Sub className="text-sm font-semibold text-mute">
        {title} <span className="tabular-nums">({groups.reduce((n, g) => n + 1 + g.also.length, 0)})</span>
      </Sub>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-mute">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {groups.map((g) => (
            <li key={g.lead.qid} className="py-3">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 break-words leading-snug">{g.lead.text}</p>
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-mute">{plural(g.votes, "vote")}</span>
              </div>
              <p className="mt-1 text-xs text-mute">
                {g.lead.name || "Anonymous"}
                {g.also.length > 0 && ` · asked ${plural(g.also.length + 1, "way")}`}
              </p>
              {g.also.length > 0 && (
                <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-sm text-mute" aria-label="Similar questions">
                  {g.also.map((q) => (
                    <li key={q.qid} className="break-words">
                      {q.text}
                    </li>
                  ))}
                </ul>
              )}
              {onMarkAnswered && (
                <button type="button" onClick={() => onMarkAnswered(g.lead.qid)} className="mt-2 text-xs font-medium text-mute underline-offset-2 hover:text-ink hover:underline">
                  Mark answered
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
