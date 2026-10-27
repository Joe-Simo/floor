"use client";
import type { Question } from "@/lib/room";
import { ago } from "./ui";

type Props = {
  q: Question;
  meId: string | null;
  now: number;
  onVote?: (up: boolean) => void;
  onRetract?: () => void;
  hostActions?: React.ReactNode;
  emphasis?: boolean;
};

export function QuestionRow({ q, meId, now, onVote, onRetract, hostActions, emphasis }: Props) {
  const mine = q.by === meId;
  const voted = !!meId && q.voters.has(meId);
  const answered = q.answeredAt !== null;
  return (
    <li className={`rise flex gap-4 rounded-2xl border bg-card p-4 ${emphasis ? "border-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line"} ${answered ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={() => onVote?.(!voted)}
        disabled={!onVote || mine || answered}
        aria-pressed={voted}
        aria-label={mine ? `${q.voters.size} votes on your question` : voted ? `Remove your vote, ${q.voters.size} votes` : `Upvote, ${q.voters.size} votes`}
        className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
          voted ? "border-accent bg-accent text-white" : "border-line bg-paper text-ink enabled:hover:border-accent"
        } disabled:cursor-default`}
      >
        <svg viewBox="0 0 12 8" className="mb-0.5 size-3" aria-hidden>
          <path d="M1 7l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {q.voters.size}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`break-words leading-snug ${emphasis ? "text-lg font-medium" : ""}`}>{q.text}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-mute">
          <span>{q.name || "Anonymous"}</span>
          <span aria-hidden>·</span>
          <span>{ago(q.askedAt, now)}</span>
          {mine && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">You</span>}
          {answered && <span className="rounded-full bg-ok-soft px-2 py-0.5 font-medium text-ok">Answered</span>}
          {mine && !answered && onRetract && (
            <button type="button" onClick={onRetract} className="underline-offset-2 hover:text-ink hover:underline">
              Withdraw
            </button>
          )}
        </p>
        {hostActions && <div className="mt-3 flex flex-wrap gap-2">{hostActions}</div>}
      </div>
    </li>
  );
}

export function HostButton({ children, onClick, tone = "plain" }: { children: React.ReactNode; onClick: () => void; tone?: "plain" | "primary" | "quiet" }) {
  const cls =
    tone === "primary" ? "bg-ink text-paper hover:opacity-90" : tone === "quiet" ? "text-mute hover:text-ink" : "border border-line bg-paper hover:border-ink";
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${cls}`}>
      {children}
    </button>
  );
}
