import { parseEvent, type RoomEvent } from "@/lib/room";

/**
 * What a Floor message carries over Nexconn.
 *
 * - `{ v: 1, e }` is one room event, sent by the person who made it.
 * - `{ v: 1, snap: [...] }` is a catch-up snapshot of earlier events, sent only by the host.
 *
 * Nexconn group channels show a new member only messages sent after they joined, unless the
 * Console setting "pre-join history access by new member" is on. When a newcomer's history has no
 * `room.open`, it asks the host for a snapshot. Snapshots are persisted, so a later reload replays
 * them from the newcomer's own history.
 */
export type Wire = { v: 1; e: unknown } | { v: 1; snap: unknown[] };

/** Room events in one received message. Events are only trusted from their author; snapshots only from the host. */
export function decode(content: unknown, senderUserId: string, hostId: string | undefined): RoomEvent[] {
  if (!content || typeof content !== "object") return [];
  const c = content as Record<string, unknown>;
  if ("e" in c) {
    const e = parseEvent(c.e);
    return e && e.by === senderUserId ? [e] : [];
  }
  if (Array.isArray(c.snap) && hostId && senderUserId === hostId) {
    return c.snap.map(parseEvent).filter((e): e is RoomEvent => e !== null);
  }
  return [];
}

/** True when a history misses the start of the room, so this client joined the channel after it opened. */
export function needsCatchUp(events: RoomEvent[]): boolean {
  return !events.some((e) => e.kind === "room.open");
}

/** Split events, oldest first, into snapshot messages that stay well under Nexconn's message size limit. */
export function chunk(events: RoomEvent[], maxBytes = 48_000): RoomEvent[][] {
  const out: RoomEvent[][] = [];
  let cur: RoomEvent[] = [];
  let size = 0;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const n = JSON.stringify(e).length + 1;
    if (cur.length && size + n > maxBytes) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(e);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
