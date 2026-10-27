import { parseEvent, type RoomEvent } from "@/lib/room";
import type { RoomTransport, TransportStatus } from "./types";

/**
 * Demo transport: the log lives in this browser's localStorage and tabs talk over BroadcastChannel.
 * Used when no Nexconn keys are configured, and in tests.
 */
export function localTransport(code: string, storage: Storage = window.localStorage): RoomTransport {
  const key = `floor:log:${code}`;
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`floor:${code}`) : null;
  const listeners = new Set<(e: RoomEvent) => void>();
  const statusListeners = new Set<(s: TransportStatus) => void>();

  const read = (): RoomEvent[] => {
    try {
      const raw = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(raw) ? raw.map(parseEvent).filter((e): e is RoomEvent => e !== null) : [];
    } catch {
      return [];
    }
  };

  if (bc) {
    bc.onmessage = (m) => {
      const e = parseEvent(m.data);
      if (e) listeners.forEach((l) => l(e));
    };
  }

  return {
    mode: "local",
    async history() {
      queueMicrotask(() => statusListeners.forEach((l) => l("live")));
      return read();
    },
    async send(e) {
      const log = read();
      log.push(e);
      storage.setItem(key, JSON.stringify(log.slice(-2000)));
      bc?.postMessage(e);
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
      bc?.close();
      listeners.clear();
      statusListeners.clear();
    },
  };
}
