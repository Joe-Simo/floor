import { z } from "zod";

/** Every change to a room is one small event. Every client folds the same log into the same state. */

export const MAX_QUESTION = 280;
export const MAX_CHAT = 500;
export const MAX_NAME = 40;
/** Slow mode choices, in seconds. 0 means off. */
export const SLOW_STEPS = [0, 30, 60, 120] as const;

const base = {
  id: z.string().min(6).max(40),
  t: z.number().int().nonnegative(),
  by: z.string().min(1).max(64),
};

export const EventSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("room.open"), title: z.string().trim().min(1).max(80) }),
  z.object({ ...base, kind: z.literal("q.ask"), qid: z.string().min(6).max(40), text: z.string().trim().min(3).max(MAX_QUESTION), name: z.string().trim().max(MAX_NAME).optional() }),
  z.object({ ...base, kind: z.literal("q.vote"), qid: z.string().min(6).max(40), up: z.boolean() }),
  z.object({ ...base, kind: z.literal("q.retract"), qid: z.string().min(6).max(40) }),
  z.object({ ...base, kind: z.literal("q.answer"), qid: z.string().min(6).max(40), answered: z.boolean() }),
  z.object({ ...base, kind: z.literal("q.pin"), qid: z.string().min(6).max(40).nullable() }),
  z.object({ ...base, kind: z.literal("q.hide"), qid: z.string().min(6).max(40) }),
  z.object({ ...base, kind: z.literal("room.end"), ended: z.boolean() }),
  z.object({ ...base, kind: z.literal("room.slow"), seconds: z.number().int().min(0).max(600) }),
  z.object({ ...base, kind: z.literal("chat.say"), text: z.string().trim().min(1).max(MAX_CHAT), name: z.string().trim().max(MAX_NAME).optional() }),
]);

export type RoomEvent = z.infer<typeof EventSchema>;
export type EventKind = RoomEvent["kind"];

export type Question = {
  qid: string;
  text: string;
  name?: string;
  by: string;
  askedAt: number;
  voters: Set<string>;
  answeredAt: number | null;
  hidden: boolean;
  retracted: boolean;
};

export type ChatLine = { id: string; by: string; name?: string; text: string; t: number };

export type RoomState = {
  title: string | null;
  hostId: string | null;
  openedAt: number | null;
  questions: Map<string, Question>;
  pinned: string | null;
  chat: ChatLine[];
  people: Set<string>;
  seen: Set<string>;
  /** When the host ended the session, or null while it runs. An ended room is frozen. */
  endedAt: number | null;
  /** Slow mode: each attendee may ask once per this many seconds. 0 is off. */
  slowSeconds: number;
  /** Time of each person's last accepted question, for slow mode. */
  lastAsk: Map<string, number>;
};

export function emptyRoom(): RoomState {
  return { title: null, hostId: null, openedAt: null, questions: new Map(), pinned: null, chat: [], people: new Set(), seen: new Set(), endedAt: null, slowSeconds: 0, lastAsk: new Map() };
}

const HOST_ONLY: ReadonlySet<EventKind> = new Set(["q.answer", "q.pin", "q.hide", "room.end", "room.slow"]);

/** What stops once a session ends. The host can still mark answered or hide, so the recap stays accurate. */
const FROZEN: ReadonlySet<EventKind> = new Set(["q.ask", "q.vote", "q.retract", "q.pin", "room.slow", "chat.say"]);

/** Milliseconds until this person may ask again under slow mode, measured from `at`. 0 means now. The host is never slowed. */
export function askWait(state: RoomState, userId: string, at: number): number {
  if (state.slowSeconds <= 0 || userId === state.hostId) return 0;
  const last = state.lastAsk.get(userId);
  if (last === undefined) return 0;
  return Math.max(0, last + state.slowSeconds * 1000 - at);
}

/** Parse untrusted input (a message from the network) into an event, or null. */
export function parseEvent(input: unknown): RoomEvent | null {
  const r = EventSchema.safeParse(input);
  return r.success ? r.data : null;
}

/** Apply one event. Mutates and returns state. Invalid or unauthorized events are ignored, never thrown. */
export function apply(state: RoomState, e: RoomEvent): RoomState {
  if (state.seen.has(e.id)) return state;
  if (e.kind !== "room.open" && HOST_ONLY.has(e.kind) && e.by !== state.hostId) return state;
  if (state.endedAt !== null && FROZEN.has(e.kind)) return state;
  if (e.kind === "q.ask" && !state.questions.has(e.qid) && askWait(state, e.by, e.t) > 0) return state;
  state.seen.add(e.id);
  state.people.add(e.by);
  switch (e.kind) {
    case "room.open":
      if (state.hostId === null) {
        state.title = e.title;
        state.hostId = e.by;
        state.openedAt = e.t;
      }
      break;
    case "q.ask":
      if (!state.questions.has(e.qid)) {
        state.questions.set(e.qid, { qid: e.qid, text: e.text, name: e.name || undefined, by: e.by, askedAt: e.t, voters: new Set(), answeredAt: null, hidden: false, retracted: false });
        state.lastAsk.set(e.by, e.t);
      }
      break;
    case "q.vote": {
      const q = state.questions.get(e.qid);
      if (q && q.by !== e.by) {
        if (e.up) q.voters.add(e.by);
        else q.voters.delete(e.by);
      }
      break;
    }
    case "q.retract": {
      const q = state.questions.get(e.qid);
      if (q && q.by === e.by) q.retracted = true;
      break;
    }
    case "q.answer": {
      const q = state.questions.get(e.qid);
      if (q) {
        q.answeredAt = e.answered ? e.t : null;
        if (e.answered && state.pinned === e.qid) state.pinned = null;
      }
      break;
    }
    case "q.pin":
      if (e.qid === null || state.questions.has(e.qid)) state.pinned = e.qid;
      break;
    case "q.hide": {
      const q = state.questions.get(e.qid);
      if (q) {
        q.hidden = true;
        if (state.pinned === e.qid) state.pinned = null;
      }
      break;
    }
    case "room.end":
      if (e.ended) {
        if (state.endedAt === null) state.endedAt = e.t;
        state.pinned = null;
      } else {
        state.endedAt = null;
      }
      break;
    case "room.slow":
      state.slowSeconds = e.seconds;
      break;
    case "chat.say":
      state.chat.push({ id: e.id, by: e.by, name: e.name || undefined, text: e.text, t: e.t });
      break;
  }
  return state;
}

/**
 * Fold a log into state. Events are ordered by time then id so every client agrees,
 * except room.open, which always goes first so host rights are known before host actions.
 */
export function fold(events: Iterable<RoomEvent>): RoomState {
  const list = [...events].sort((a, b) => {
    if (a.kind === "room.open" && b.kind !== "room.open") return -1;
    if (b.kind === "room.open" && a.kind !== "room.open") return 1;
    return a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const s = emptyRoom();
  for (const e of list) apply(s, e);
  s.chat.sort((a, b) => a.t - b.t);
  return s;
}

export type Ranked = { pinned: Question | null; open: Question[]; answered: Question[] };

/** Pinned first, then most votes, then oldest. Answered questions move to their own list, newest answer first. */
export function rank(state: RoomState): Ranked {
  const visible = [...state.questions.values()].filter((q) => !q.hidden && !q.retracted);
  const pinned = state.pinned ? visible.find((q) => q.qid === state.pinned && q.answeredAt === null) ?? null : null;
  const open = visible
    .filter((q) => q.answeredAt === null && q !== pinned)
    .sort((a, b) => b.voters.size - a.voters.size || a.askedAt - b.askedAt || (a.qid < b.qid ? -1 : 1));
  const answered = visible.filter((q) => q.answeredAt !== null).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));
  return { pinned, open, answered };
}

const STOP = new Set("a an the and or but of to in on for with at by from is are was were be been do does did can could should would will i you we they it this that what why how when where who which my your our me us about into".split(" "));

export function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

/** Jaccard overlap of meaningful words, 0 to 1. */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

/** Open questions that look like the draft, best match first. Used to suggest an upvote instead of a duplicate. */
export function lookalikes(state: RoomState, draft: string, threshold = 0.5, limit = 2): Question[] {
  if (words(draft).size < 2) return [];
  const { pinned, open } = rank(state);
  return [...(pinned ? [pinned] : []), ...open]
    .map((q) => ({ q, s: similarity(draft, q.text) }))
    .filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.q);
}

/** Questions that look alike, gathered under the one with the most votes. */
export type Group = {
  lead: Question;
  also: Question[];
  /** Distinct people who voted for any question in the group. */
  votes: number;
  answered: boolean;
};

const byVotes = (a: Question, b: Question) => b.voters.size - a.voters.size || a.askedAt - b.askedAt || (a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0);

/**
 * Deterministic grouping for the recap: walk questions from most to least voted and join each one
 * to the first group holding a question at least `threshold` similar to it. No model, no network.
 */
export function group(questions: Question[], threshold = 0.4): Group[] {
  const groups: Question[][] = [];
  for (const q of [...questions].sort(byVotes)) {
    const home = groups.find((g) => g.some((m) => similarity(m.text, q.text) >= threshold));
    if (home) home.push(q);
    else groups.push([q]);
  }
  return groups.map(([lead, ...also]) => {
    const voters = new Set<string>();
    for (const m of [lead, ...also]) for (const v of m.voters) voters.add(v);
    return { lead, also, votes: voters.size, answered: [lead, ...also].some((m) => m.answeredAt !== null) };
  });
}

export type Summary = {
  title: string;
  people: number;
  asked: number;
  /** Questions in answered groups. A near copy of an answered question counts as answered. */
  answeredCount: number;
  openCount: number;
  /** Up to three questions with at least one vote, most votes first. */
  top: Question[];
  answered: Group[];
  open: Group[];
  /** Whole minutes from open to end, when the session has ended. */
  minutes: number | null;
};

/** Everything the recap shows, computed once so the screen and the Markdown always agree. */
export function summarize(state: RoomState): Summary {
  const visible = [...state.questions.values()].filter((q) => !q.hidden && !q.retracted);
  const groups = group(visible);
  const answered = groups.filter((g) => g.answered);
  const open = groups.filter((g) => !g.answered).sort((a, b) => b.votes - a.votes || byVotes(a.lead, b.lead));
  answered.sort((a, b) => b.votes - a.votes || byVotes(a.lead, b.lead));
  const minutes = state.endedAt !== null && state.openedAt !== null ? Math.max(1, Math.round((state.endedAt - state.openedAt) / 60_000)) : null;
  return {
    title: state.title ?? "Floor session",
    people: state.people.size,
    asked: visible.length,
    answeredCount: answered.reduce((n, g) => n + 1 + g.also.length, 0),
    openCount: open.reduce((n, g) => n + 1 + g.also.length, 0),
    top: visible.filter((q) => q.voters.size > 0).sort(byVotes).slice(0, 3),
    answered,
    open,
    minutes,
  };
}

const votes = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;

/** Markdown recap a host can paste anywhere after the session. */
export function recap(state: RoomState): string {
  const s = summarize(state);
  const line = (g: Group) => {
    const head = `- ${g.lead.text} (${votes(g.votes)}${g.lead.name ? `, ${g.lead.name}` : ""})`;
    return [head, ...g.also.map((q) => `  - Also asked: ${q.text}${q.name ? ` (${q.name})` : ""}`)];
  };
  const facts = [`${s.people} ${s.people === 1 ? "person" : "people"}`, `${s.asked} ${s.asked === 1 ? "question" : "questions"}`, `${s.answeredCount} answered`, `${s.openCount} still open`];
  const out = [`# ${s.title}`, "", `${facts.join(", ")}.${s.minutes !== null ? ` Ran ${s.minutes} min.` : ""}`, ""];
  if (s.top.length) {
    out.push("## Most wanted", ...s.top.map((q, i) => `${i + 1}. ${q.text} (${votes(q.voters.size)}${q.answeredAt !== null ? ", answered" : ""})`), "");
  }
  out.push(`## Answered (${s.answeredCount})`, ...(s.answered.length ? s.answered.flatMap(line) : ["- None yet"]), "");
  out.push(`## Still open (${s.openCount})`, ...(s.open.length ? s.open.flatMap(line) : ["- None"]), "");
  return out.join("\n");
}
