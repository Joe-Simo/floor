import { describe, expect, it } from "vitest";
import type { RoomEvent } from "@/lib/room";
import { chunk, decode, needsCatchUp } from "@/lib/transport/wire";

const open: RoomEvent = { id: "e-open01", t: 1, by: "u-host01", kind: "room.open", title: "All hands" };
const ask: RoomEvent = { id: "e-ask001", t: 2, by: "u-ana001", kind: "q.ask", qid: "q-abc123", text: "Is the demo live?" };

describe("wire decode", () => {
  it("trusts a single event only from its author", () => {
    expect(decode({ v: 1, e: ask }, "u-ana001", "u-host01")).toEqual([ask]);
    expect(decode({ v: 1, e: ask }, "u-mallory", "u-host01")).toEqual([]);
  });

  it("trusts a snapshot only from the host, and drops junk inside it", () => {
    expect(decode({ v: 1, snap: [open, ask, { kind: "nope" }] }, "u-host01", "u-host01")).toEqual([open, ask]);
    expect(decode({ v: 1, snap: [open, ask] }, "u-ana001", "u-host01")).toEqual([]);
    expect(decode({ v: 1, snap: [open] }, "u-host01", undefined)).toEqual([]);
  });

  it("ignores empty or odd content", () => {
    expect(decode(null, "u-a", "u-a")).toEqual([]);
    expect(decode({ v: 1 }, "u-a", "u-a")).toEqual([]);
  });
});

describe("catch-up", () => {
  it("is needed only when the history misses room.open", () => {
    expect(needsCatchUp([])).toBe(true);
    expect(needsCatchUp([ask])).toBe(true);
    expect(needsCatchUp([open, ask])).toBe(false);
  });

  it("chunks oldest first and keeps every chunk under the size limit", () => {
    const many: RoomEvent[] = Array.from({ length: 300 }, (_, i) => ({ id: `e-${String(i).padStart(6, "0")}`, t: 1000 - i, by: "u-ana001", kind: "chat.say", text: "x".repeat(400) }));
    const parts = chunk(many, 20_000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(JSON.stringify(p).length).toBeLessThan(20_000 + 600);
    const flat = parts.flat();
    expect(flat).toHaveLength(300);
    expect(flat.map((e) => e.t)).toEqual([...flat.map((e) => e.t)].sort((a, b) => a - b));
    expect(chunk([])).toEqual([]);
  });
});
