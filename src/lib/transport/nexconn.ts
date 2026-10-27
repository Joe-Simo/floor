"use client";
import { parseEvent, type RoomEvent } from "@/lib/room";
import type { RoomTransport, TransportStatus } from "./types";

export const FLOOR_MESSAGE_TYPE = "floor:evt";

type Session = { appKey: string; token: string; groupId: string };

let initializedKey: string | null = null;

/**
 * Live transport: each room event is one persisted custom message in a Nexconn group channel.
 * History comes from the channel's remote message store, so late joiners see the whole session.
 */
export async function nexconnTransport(session: Session): Promise<RoomTransport> {
  const sdk = await import("@nexconn/chat");
  const { NCEngine, GroupChannel, BaseChannel, SendMessageParams, MessageHandler, ConnectionStatusHandler } = sdk;

  if (initializedKey !== session.appKey) {
    NCEngine.initialize({ appKey: session.appKey });
    NCEngine.registerCustomMessages([{ messageType: FLOOR_MESSAGE_TYPE, isPersisted: true, isCounted: false }]);
    initializedKey = session.appKey;
  }

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
          if (m.messageType !== FLOOR_MESSAGE_TYPE || m.channelIdentifier.channelId !== session.groupId) continue;
          const e = parseEvent(m.content?.e);
          if (e && e.by === m.senderUserId) listeners.forEach((l) => l(e));
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
          const e = parseEvent(m.content?.e);
          if (e && e.by === m.senderUserId) out.push(e);
        }
        if (!query.hasNext) break;
      }
      return out.reverse();
    },
    async send(e) {
      const params = new SendMessageParams({ v: 1, e }, FLOOR_MESSAGE_TYPE);
      params.disableNotification = e.kind !== "q.ask" && e.kind !== "chat.say";
      const r = await channel.sendMessage(params);
      if (r.code !== 0) throw new Error(`Send failed (${r.code})`);
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
      NCEngine.removeMessageHandler(handlerId);
      NCEngine.removeConnectionStatusHandler(handlerId);
      listeners.clear();
      statusListeners.clear();
      await NCEngine.disconnect();
    },
  };
}
