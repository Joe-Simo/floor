"use client";
import type { RoomEvent } from "@/lib/room";
import type { RoomTransport, TransportStatus } from "./types";
import { chunk, decode, needsCatchUp } from "./wire";

export const FLOOR_MESSAGE_TYPE = "floor:evt";
/** A newcomer asking the host for a catch-up snapshot. Not stored: only the live host needs to hear it. */
export const SYNC_MESSAGE_TYPE = "floor:sync";

type Session = { appKey: string; area?: "SG" | "NA" | "SA" | "OM"; token: string; groupId: string; userId?: string; hostId?: string };

let initializedKey: string | null = null;

/**
 * Live transport: each room event is one persisted custom message in a Nexconn group channel.
 * History comes from the channel's remote message store. Late joiners also get a host snapshot (see wire.ts).
 */
export async function nexconnTransport(session: Session): Promise<RoomTransport> {
  const sdk = await import("@nexconn/chat");
  const { NCEngine, GroupChannel, BaseChannel, SendMessageParams, MessageHandler, ConnectionStatusHandler, AreaCode } = sdk;

  // The data center must match the app's region in the Console (Floor's app is North America).
  const area = session.area ?? "SG";
  const initKey = `${session.appKey}:${area}`;
  if (initializedKey !== initKey) {
    NCEngine.initialize({ appKey: session.appKey, areaCode: AreaCode[area] });
    NCEngine.registerCustomMessages([
      { messageType: FLOOR_MESSAGE_TYPE, isPersisted: true, isCounted: false },
      { messageType: SYNC_MESSAGE_TYPE, isPersisted: false, isCounted: false },
    ]);
    initializedKey = initKey;
  }

  const amHost = !!session.userId && session.userId === session.hostId;
  /** Everything this client has seen, so the host can answer a catch-up request. */
  const known = new Map<string, RoomEvent>();
  const remember = (es: RoomEvent[]) => es.forEach((e) => known.set(e.id, e));
  let asked = false;
  let replyTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<(e: RoomEvent) => void>();
  const statusListeners = new Set<(s: TransportStatus) => void>();
  const emitStatus = (s: TransportStatus) => statusListeners.forEach((l) => l(s));
  const handlerId = `floor-${session.groupId}-${Math.random().toString(36).slice(2)}`;

  NCEngine.addConnectionStatusHandler(
    handlerId,
    new ConnectionStatusHandler({
      onConnectionStatusChanged({ status }) {
        const n = Number(status);
        emitStatus(n === 0 ? "live" : n === 1 ? "connecting" : n === 3 ? "offline" : "error");
      },
    }),
  );

  NCEngine.addMessageHandler(
    handlerId,
    new MessageHandler({
      onMessageReceived({ messages }) {
        for (const m of messages) {
          if (m.channelIdentifier.channelId !== session.groupId) continue;
          if (m.messageType === SYNC_MESSAGE_TYPE) {
            if (amHost) scheduleSnapshot();
            continue;
          }
          if (m.messageType !== FLOOR_MESSAGE_TYPE) continue;
          const es = decode(m.content, m.senderUserId, session.hostId);
          remember(es);
          es.forEach((e) => listeners.forEach((l) => l(e)));
        }
      },
    }),
  );

  emitStatus("connecting");
  const res = await NCEngine.connect({ token: session.token });
  if (res.code !== 0) {
    emitStatus("error");
    throw new Error(`Nexconn connect failed (${res.code})`);
  }
  emitStatus("live");

  const channel = new GroupChannel(session.groupId);

  /** Host only: answer catch-up requests, batching a burst of newcomers into one snapshot. */
  function scheduleSnapshot() {
    if (replyTimer) return;
    replyTimer = setTimeout(async () => {
      replyTimer = null;
      for (const part of chunk([...known.values()])) {
        const params = new SendMessageParams({ v: 1, snap: part }, FLOOR_MESSAGE_TYPE);
        params.disableNotification = true;
        await channel.sendMessage(params).catch(() => null);
      }
    }, 1200);
  }

  return {
    mode: "nexconn",
    async history() {
      const query = BaseChannel.createMessagesQuery({ channelIdentifier: channel.identifier, startTime: Date.now(), pageSize: 100, isAscending: false });
      const out: RoomEvent[] = [];
      for (let page = 0; page < 20; page++) {
        const r = await query.loadNextPage();
        if (r.code !== 0 || !r.data) break;
        for (const m of r.data.data) {
          if (m.messageType !== FLOOR_MESSAGE_TYPE) continue;
          out.push(...decode(m.content, m.senderUserId, session.hostId).reverse());
        }
        if (!query.hasNext) break;
      }
      const past = out.reverse();
      remember(past);
      // Joined after the room opened and the app does not share pre-join history: ask the host once.
      if (!amHost && !asked && needsCatchUp(past)) {
        asked = true;
        const params = new SendMessageParams({ v: 1 }, SYNC_MESSAGE_TYPE);
        params.disableNotification = true;
        await channel.sendMessage(params).catch(() => null);
      }
      return past;
    },
    async send(e) {
      const params = new SendMessageParams({ v: 1, e }, FLOOR_MESSAGE_TYPE);
      params.disableNotification = e.kind !== "q.ask" && e.kind !== "chat.say";
      const r = await channel.sendMessage(params);
      if (r.code !== 0) throw new Error(`Send failed (${r.code})`);
      remember([e]);
      listeners.forEach((l) => l(e));
    },
    onEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    async close() {
      if (replyTimer) clearTimeout(replyTimer);
      NCEngine.removeMessageHandler(handlerId);
      NCEngine.removeConnectionStatusHandler(handlerId);
      listeners.clear();
      statusListeners.clear();
      await NCEngine.disconnect();
    },
  };
}
