import { z } from "zod";

/** Every change to a room is one small event. Every client folds the same log into the same state. */

export const MAX_QUESTION = 280;
export const MAX_CHAT = 500;
export const MAX_NAME = 40;

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
};

export function emptyRoom(): RoomState {
  return { title: null, hostId: null, openedAt: null, questions: new Map(), pinned: null, chat: [], people: new Set(), seen: new Set() };
}

const HOST_ONLY: ReadonlySet<EventKind> = new Set(["q.answer", "q.pin", "q.hide"]);

/** Parse untrusted input (a message from the network) into an event, or null. */
export function parseEvent(input: unknown): RoomEvent | null {
  const r = EventSchema.safeParse(input);
  return r.success ? r.data : null;
}

/** Apply one event. Mutates and returns state. Invalid or unauthorized events are ignored, never thrown. */
export function apply(state: RoomState, e: RoomEvent): RoomState {
  if (state.seen.has(e.id)) return state;
  if (e.kind !== "room.open" && HOST_ONLY.has(e.kind) && e.by !== state.hostId) return state;
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

/** Plain-text recap a host can paste anywhere after the session. */
export function recap(state: RoomState): string {
  const { pinned, open, answered } = rank(state);
  const line = (q: Question) => `- ${q.text} (${q.voters.size} ${q.voters.size === 1 ? "vote" : "votes"}${q.name ? `, ${q.name}` : ""})`;
  const out = [`# ${state.title ?? "Floor session"}`, "", `${state.people.size} people, ${state.questions.size} questions.`, ""];
  out.push(`## Answered (${answered.length})`, ...(answered.length ? answered.map(line) : ["- None yet"]), "");
  const rest = [...(pinned ? [pinned] : []), ...open];
  out.push(`## Still open (${rest.length})`, ...(rest.length ? rest.map(line) : ["- None"]), "");
  return out.join("\n");
}
