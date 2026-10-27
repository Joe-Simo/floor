import { describe, expect, it } from "vitest";
import { fold, lookalikes, parseEvent, rank, recap, similarity, type RoomEvent } from "@/lib/room";

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
