import { describe, expect, it } from "vitest";
import { askWait, fold, group, lookalikes, parseEvent, rank, recap, similarity, summarize, type RoomEvent } from "@/lib/room";

let n = 0;
const ev = <T extends Omit<RoomEvent, "id" | "t">>(e: T, t = ++n * 1000): RoomEvent => ({ id: `e-${String(t).padStart(8, "0")}`, t, ...e }) as unknown as RoomEvent;

const HOST = "u-host";
const open = ev({ kind: "room.open", by: HOST, title: "All-hands" }, 1);

describe("fold", () => {
  it("opens a room and records the host", () => {
    const s = fold([open]);
    expect(s.title).toBe("All-hands");
    expect(s.hostId).toBe(HOST);
  });

  it("keeps the first room.open even if another arrives later", () => {
    const s = fold([open, ev({ kind: "room.open", by: "u-intruder", title: "Mine now" }, 2)]);
    expect(s.hostId).toBe(HOST);
    expect(s.title).toBe("All-hands");
  });

  it("applies host rights even when room.open arrives after host actions in the log", () => {
    const ask = ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "When is the launch?" }, 5);
    const pin = ev({ kind: "q.pin", by: HOST, qid: "q-000001" }, 6);
    const s = fold([ask, pin, ev({ kind: "room.open", by: HOST, title: "Late" }, 7)]);
    expect(s.pinned).toBe("q-000001");
  });

  it("ignores host-only actions from guests", () => {
    const ask = ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "When is the launch?" });
    const s = fold([open, ask, ev({ kind: "q.answer", by: "u-b", qid: "q-000001", answered: true }), ev({ kind: "q.hide", by: "u-b", qid: "q-000001" })]);
    const q = s.questions.get("q-000001")!;
    expect(q.answeredAt).toBeNull();
    expect(q.hidden).toBe(false);
  });

  it("counts one vote per person, allows un-voting, and ignores self-votes", () => {
    const ask = ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "When is the launch?" });
    const s = fold([
      open,
      ask,
      ev({ kind: "q.vote", by: "u-b", qid: "q-000001", up: true }),
      ev({ kind: "q.vote", by: "u-b", qid: "q-000001", up: true }),
      ev({ kind: "q.vote", by: "u-c", qid: "q-000001", up: true }),
      ev({ kind: "q.vote", by: "u-c", qid: "q-000001", up: false }),
      ev({ kind: "q.vote", by: "u-a", qid: "q-000001", up: true }),
    ]);
    expect([...s.questions.get("q-000001")!.voters]).toEqual(["u-b"]);
  });

  it("is idempotent: the same event delivered twice changes nothing", () => {
    const ask = ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "When is the launch?" });
    const vote = ev({ kind: "q.vote", by: "u-b", qid: "q-000001", up: true });
    const unvote = ev({ kind: "q.vote", by: "u-b", qid: "q-000001", up: false });
    const s = fold([open, ask, vote, unvote, vote]);
    expect(s.questions.get("q-000001")!.voters.size).toBe(0);
  });

  it("gives the same state regardless of arrival order", () => {
    const log = [
      open,
      ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "First question here" }),
      ev({ kind: "q.ask", by: "u-b", qid: "q-000002", text: "Second question here" }),
      ev({ kind: "q.vote", by: "u-c", qid: "q-000002", up: true }),
      ev({ kind: "q.answer", by: HOST, qid: "q-000001", answered: true }),
    ];
    const a = rank(fold(log));
    const b = rank(fold([...log].reverse()));
    expect(a.open.map((q) => q.qid)).toEqual(b.open.map((q) => q.qid));
    expect(a.answered.map((q) => q.qid)).toEqual(b.answered.map((q) => q.qid));
  });

  it("only lets the author withdraw a question", () => {
    const ask = ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "When is the launch?" });
    expect(fold([open, ask, ev({ kind: "q.retract", by: "u-b", qid: "q-000001" })]).questions.get("q-000001")!.retracted).toBe(false);
    expect(fold([open, ask, ev({ kind: "q.retract", by: "u-a", qid: "q-000001" })]).questions.get("q-000001")!.retracted).toBe(true);
  });
});

describe("rank", () => {
  it("orders by votes, then oldest first, with pinned and answered apart", () => {
    const s = fold([
      open,
      ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "Old question with no votes" }),
      ev({ kind: "q.ask", by: "u-b", qid: "q-000002", text: "Popular question" }),
      ev({ kind: "q.ask", by: "u-c", qid: "q-000003", text: "Newer question with no votes" }),
      ev({ kind: "q.ask", by: "u-d", qid: "q-000004", text: "Pinned question" }),
      ev({ kind: "q.ask", by: "u-e", qid: "q-000005", text: "Answered question" }),
      ev({ kind: "q.vote", by: "u-x", qid: "q-000002", up: true }),
      ev({ kind: "q.pin", by: HOST, qid: "q-000004" }),
      ev({ kind: "q.answer", by: HOST, qid: "q-000005", answered: true }),
    ]);
    const r = rank(s);
    expect(r.pinned?.qid).toBe("q-000004");
    expect(r.open.map((q) => q.qid)).toEqual(["q-000002", "q-000001", "q-000003"]);
    expect(r.answered.map((q) => q.qid)).toEqual(["q-000005"]);
  });

  it("unpins a question when it is answered or hidden", () => {
    const base = [open, ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "A question" }), ev({ kind: "q.pin", by: HOST, qid: "q-000001" })];
    expect(fold([...base, ev({ kind: "q.answer", by: HOST, qid: "q-000001", answered: true })]).pinned).toBeNull();
    expect(fold([...base, ev({ kind: "q.hide", by: HOST, qid: "q-000001" })]).pinned).toBeNull();
  });
});

describe("parseEvent", () => {
  it("rejects malformed or oversized input", () => {
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent({ kind: "q.ask", id: "e-000001", t: 1, by: "u-a", qid: "q-000001", text: "x".repeat(281) })).toBeNull();
    expect(parseEvent({ kind: "nope", id: "e-000001", t: 1, by: "u-a" })).toBeNull();
    expect(parseEvent({ kind: "chat.say", id: "e-000001", t: 1, by: "u-a", text: "hi" })).not.toBeNull();
  });
});

describe("lookalikes", () => {
  const s = fold([
    open,
    ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "Will the new pricing apply to existing customers?" }),
    ev({ kind: "q.ask", by: "u-b", qid: "q-000002", text: "What is the roadmap for mobile?" }),
  ]);

  it("finds a question with the same meaning words", () => {
    expect(similarity("Does new pricing apply to existing customers too?", "Will the new pricing apply to existing customers?")).toBeGreaterThan(0.6);
    expect(lookalikes(s, "does the new pricing apply for existing customers").map((q) => q.qid)).toEqual(["q-000001"]);
  });

  it("stays quiet for unrelated or very short drafts", () => {
    expect(lookalikes(s, "Who designed the office?")).toEqual([]);
    expect(lookalikes(s, "pricing")).toEqual([]);
  });
});

describe("recap", () => {
  it("lists answered and open questions with vote counts", () => {
    const s = fold([
      open,
      ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "Answered one", name: "Ana" }),
      ev({ kind: "q.ask", by: "u-b", qid: "q-000002", text: "Open one" }),
      ev({ kind: "q.vote", by: "u-c", qid: "q-000002", up: true }),
      ev({ kind: "q.answer", by: HOST, qid: "q-000001", answered: true }),
    ]);
    const text = recap(s);
    expect(text).toContain("# All-hands");
    expect(text).toContain("## Answered (1)\n- Answered one (0 votes, Ana)");
    expect(text).toContain("## Still open (1)\n- Open one (1 vote)");
    expect(text).not.toContain("\u2014");
  });
});

describe("end session", () => {
  const ask = (by: string, qid: string, text: string, t?: number) => ev({ kind: "q.ask", by, qid, text }, t);

  it("freezes the room: no new questions, votes, withdrawals or chat after the end", () => {
    const s = fold([
      open,
      ask("u-a", "q-000001", "Before the end", 10),
      ev({ kind: "q.pin", by: HOST, qid: "q-000001" }, 11),
      ev({ kind: "room.end", by: HOST, ended: true }, 20),
      ask("u-b", "q-000002", "After the end", 21),
      ev({ kind: "q.vote", by: "u-b", qid: "q-000001", up: true }, 22),
      ev({ kind: "q.retract", by: "u-a", qid: "q-000001" }, 23),
      ev({ kind: "chat.say", by: "u-b", text: "hello?" }, 24),
      ev({ kind: "room.slow", by: HOST, seconds: 60 }, 25),
    ]);
    expect(s.endedAt).toBe(20);
    expect(s.pinned).toBeNull();
    expect([...s.questions.keys()]).toEqual(["q-000001"]);
    expect(s.questions.get("q-000001")!.voters.size).toBe(0);
    expect(s.questions.get("q-000001")!.retracted).toBe(false);
    expect(s.chat).toEqual([]);
    expect(s.slowSeconds).toBe(0);
  });

  it("only the host can end, and replaying the log shows the ended state", () => {
    const log = [open, ask("u-a", "q-000001", "A question", 10), ev({ kind: "room.end", by: "u-a", ended: true }, 11)];
    expect(fold(log).endedAt).toBeNull();
    const ended = [...log, ev({ kind: "room.end", by: HOST, ended: true }, 12)];
    expect(fold(ended).endedAt).toBe(12);
    expect(fold([...ended].reverse()).endedAt).toBe(12);
  });

  it("still lets the host tidy up after the end, so the recap is accurate", () => {
    const s = fold([
      open,
      ask("u-a", "q-000001", "Answered late", 10),
      ask("u-b", "q-000002", "Off topic", 11),
      ev({ kind: "room.end", by: HOST, ended: true }, 20),
      ev({ kind: "q.answer", by: HOST, qid: "q-000001", answered: true }, 21),
      ev({ kind: "q.hide", by: HOST, qid: "q-000002" }, 22),
    ]);
    expect(s.questions.get("q-000001")!.answeredAt).toBe(21);
    expect(s.questions.get("q-000002")!.hidden).toBe(true);
  });

  it("can be reopened by the host, and only events after the reopen count", () => {
    const s = fold([
      open,
      ev({ kind: "room.end", by: HOST, ended: true }, 20),
      ask("u-a", "q-000001", "While ended", 21),
      ev({ kind: "room.end", by: HOST, ended: false }, 22),
      ask("u-a", "q-000002", "After reopening", 23),
    ]);
    expect(s.endedAt).toBeNull();
    expect([...s.questions.keys()]).toEqual(["q-000002"]);
  });

  it("keeps the first end time if the host ends twice", () => {
    const s = fold([open, ev({ kind: "room.end", by: HOST, ended: true }, 20), ev({ kind: "room.end", by: HOST, ended: true }, 30)]);
    expect(s.endedAt).toBe(20);
  });
});

describe("slow mode", () => {
  const ask = (by: string, qid: string, t: number) => ev({ kind: "q.ask", by, qid, text: `Question ${qid}` }, t);
  const slow = (seconds: number, t: number) => ev({ kind: "room.slow", by: HOST, seconds }, t);

  it("accepts one question per person per window and drops the rest the same way on every client", () => {
    const log = [open, slow(60, 10), ask("u-a", "q-000001", 1_000), ask("u-a", "q-000002", 30_000), ask("u-b", "q-000003", 30_000), ask("u-a", "q-000004", 61_000)];
    const a = fold(log);
    const b = fold([...log].reverse());
    expect([...a.questions.keys()].sort()).toEqual(["q-000001", "q-000003", "q-000004"]);
    expect([...b.questions.keys()].sort()).toEqual([...a.questions.keys()].sort());
  });

  it("does not slow the host, and only the host can turn it on", () => {
    const s = fold([open, slow(60, 10), ask(HOST, "q-000001", 1_000), ask(HOST, "q-000002", 2_000)]);
    expect(s.questions.size).toBe(2);
    const t = fold([open, ev({ kind: "room.slow", by: "u-a", seconds: 120 }, 10)]);
    expect(t.slowSeconds).toBe(0);
  });

  it("counts questions asked before slow mode was switched on", () => {
    const s = fold([open, ask("u-a", "q-000001", 1_000), slow(60, 2_000), ask("u-a", "q-000002", 20_000)]);
    expect([...s.questions.keys()]).toEqual(["q-000001"]);
  });

  it("lets everyone ask freely again when switched off", () => {
    const s = fold([open, slow(60, 10), ask("u-a", "q-000001", 1_000), slow(0, 2_000), ask("u-a", "q-000002", 3_000)]);
    expect(s.questions.size).toBe(2);
  });

  it("tells a client how long to wait", () => {
    const s = fold([open, slow(30, 10), ask("u-a", "q-000001", 1_000)]);
    expect(askWait(s, "u-a", 11_000)).toBe(20_000);
    expect(askWait(s, "u-a", 31_000)).toBe(0);
    expect(askWait(s, "u-b", 11_000)).toBe(0);
    expect(askWait(s, HOST, 11_000)).toBe(0);
  });

  it("rejects out of range settings", () => {
    expect(parseEvent({ kind: "room.slow", id: "e-000001", t: 1, by: HOST, seconds: -5 })).toBeNull();
    expect(parseEvent({ kind: "room.slow", id: "e-000001", t: 1, by: HOST, seconds: 6000 })).toBeNull();
  });
});

describe("recap grouping", () => {
  const log = [
    open,
    ev({ kind: "q.ask", by: "u-a", qid: "q-000001", text: "Will the new pricing apply to existing customers?", name: "Ana" }, 10),
    ev({ kind: "q.ask", by: "u-b", qid: "q-000002", text: "Does new pricing apply for existing customers too?" }, 11),
    ev({ kind: "q.ask", by: "u-c", qid: "q-000003", text: "What is the roadmap for mobile?" }, 12),
    ev({ kind: "q.ask", by: "u-d", qid: "q-000004", text: "Is there a mobile roadmap this year?" }, 13),
    ev({ kind: "q.ask", by: "u-e", qid: "q-000005", text: "Who designed the new office?" }, 14),
    ev({ kind: "q.vote", by: "u-x", qid: "q-000001", up: true }, 20),
    ev({ kind: "q.vote", by: "u-y", qid: "q-000001", up: true }, 21),
    ev({ kind: "q.vote", by: "u-x", qid: "q-000002", up: true }, 22),
    ev({ kind: "q.vote", by: "u-z", qid: "q-000002", up: true }, 23),
    ev({ kind: "q.vote", by: "u-x", qid: "q-000004", up: true }, 24),
    ev({ kind: "q.answer", by: HOST, qid: "q-000002", answered: true }, 30),
    ev({ kind: "room.end", by: HOST, ended: true }, 31 * 60_000),
  ];

  it("gathers near duplicates under the most voted one and counts distinct voters", () => {
    const groups = group([...fold(log).questions.values()]);
    expect(groups.map((g) => [g.lead.qid, ...g.also.map((q) => q.qid)])).toEqual([["q-000001", "q-000002"], ["q-000004", "q-000003"], ["q-000005"]]);
    expect(groups[0].votes).toBe(3);
    expect(groups[0].answered).toBe(true);
    expect(groups[1].answered).toBe(false);
  });

  it("is deterministic regardless of log order", () => {
    const a = summarize(fold(log));
    const b = summarize(fold([...log].reverse()));
    expect(b.open.map((g) => g.lead.qid)).toEqual(a.open.map((g) => g.lead.qid));
    expect(b.answered.map((g) => g.lead.qid)).toEqual(a.answered.map((g) => g.lead.qid));
  });

  it("summarizes top voted, answered and open, and the session length", () => {
    const s = summarize(fold(log));
    expect(s.top.map((q) => q.qid)).toEqual(["q-000001", "q-000002", "q-000004"]);
    expect(s.answeredCount).toBe(2);
    expect(s.openCount).toBe(3);
    expect(s.answered.length).toBe(1);
    expect(s.open.length).toBe(2);
    expect(s.minutes).toBe(31);
  });

  it("writes grouped Markdown with a most wanted list and no dashes other than list markers", () => {
    const text = recap(fold(log));
    expect(text).toContain("Ran 31 min.");
    expect(text).toContain("## Most wanted\n1. Will the new pricing apply to existing customers? (2 votes)");
    expect(text).toContain("## Answered (2)\n- Will the new pricing apply to existing customers? (3 votes, Ana)\n  - Also asked: Does new pricing apply for existing customers too?");
    expect(text).toContain("## Still open (3)");
    expect(text).toContain("5 questions, 2 answered, 3 still open.");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("leaves hidden and withdrawn questions out", () => {
    const s = summarize(fold([...log.slice(0, -1), ev({ kind: "q.hide", by: HOST, qid: "q-000005" }, 40), ev({ kind: "q.retract", by: "u-c", qid: "q-000003" }, 41)]));
    expect(s.asked).toBe(3);
    expect(s.open.map((g) => g.lead.qid)).toEqual(["q-000004"]);
  });
});
