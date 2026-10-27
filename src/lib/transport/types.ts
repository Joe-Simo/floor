import type { RoomEvent } from "@/lib/room";

export type TransportStatus = "connecting" | "live" | "offline" | "error";

/** How a room's events travel. The room model does not care which one is in use. */
export interface RoomTransport {
  readonly mode: "local" | "nexconn";
  /** Every past event, oldest to newest as far as the transport knows. */
  history(): Promise<RoomEvent[]>;
  send(e: RoomEvent): Promise<void>;
  onEvent(cb: (e: RoomEvent) => void): () => void;
  onStatus(cb: (s: TransportStatus) => void): () => void;
  close(): Promise<void>;
}
