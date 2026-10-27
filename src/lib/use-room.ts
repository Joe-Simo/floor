"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { eventId, userId as newUserId } from "@/lib/ids";
import { fold, rank, type RoomEvent } from "@/lib/room";
import type { RoomTransport, TransportStatus } from "@/lib/transport/types";

export type Me = { userId: string; name: string };

const ID_RE = /^u-[a-z0-9]{3,40}$/;

/**
 * Host identity lives in localStorage so host controls survive closing the tab.
 * Guest identity lives in sessionStorage: it survives a refresh, and every tab is
 * its own person, so a host can open a guest tab next to the host tab and both work.
 */
function identityStore(host: boolean): [Storage, string] {
  return host ? [localStorage, "floor:host"] : [sessionStorage, "floor:guest"];
}

export function loadMe(host = false): Me {
  const [store, key] = identityStore(host);
  let id = store.getItem(`${key}-id`);
  if (!id || !ID_RE.test(id)) {
    id = newUserId();
    store.setItem(`${key}-id`, id);
  }
  return { userId: id, name: store.getItem(`${key}-name`) ?? "" };
}

export function saveName(name: string, host = false): Me {
  const [store, key] = identityStore(host);
  store.setItem(`${key}-name`, name.trim().slice(0, 40));
  return loadMe(host);
}

type Distribute<T> = T extends RoomEvent ? Omit<T, "id" | "t" | "by"> : never;
export type Draft = Distribute<RoomEvent>;

export function useRoom(code: string, opts: { host?: boolean; title?: string } = {}) {
  // Rooms render client-only (see ClientOnly), so browser storage is safe to read here.
  const [me, setMe] = useState<Me | null>(() => loadMe(!!opts.host));
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [status, setStatus] = useState<TransportStatus>("connecting");
  const [mode, setMode] = useState<"local" | "nexconn" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const transport = useRef<RoomTransport | null>(null);

  useEffect(() => {
    let cancelled = false;
    let t: RoomTransport | null = null;
    const offs: Array<() => void> = [];
    const identity = loadMe(!!opts.host);

    (async () => {
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, userId: identity.userId, name: identity.name, host: !!opts.host, title: opts.title }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not join this room.");
        if (data.mode === "nexconn") {
          const { nexconnTransport } = await import("@/lib/transport/nexconn");
          t = await nexconnTransport(data);
        } else {
          const { localTransport } = await import("@/lib/transport/local");
          t = localTransport(code);
        }
        if (cancelled) return void t.close();
        transport.current = t;
        setMode(t.mode);
        offs.push(t.onStatus(setStatus));
        const pending: RoomEvent[] = [];
        let ready = false;
        offs.push(
          t.onEvent((e) => {
            if (!ready) return void pending.push(e);
            setEvents((prev) => [...prev, e]);
          }),
        );
        const past = await t.history();
        ready = true;
        setEvents([...past, ...pending]);
        setReady(true);
        setStatus((x) => (x === "connecting" ? "live" : x));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not join this room.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      offs.forEach((o) => o());
      t?.close();
      transport.current = null;
    };
  }, [code, opts.host, opts.title]);

  const send = useCallback(
    async (draft: Draft) => {
      const t = transport.current;
      const who = me ?? loadMe(!!opts.host);
      if (!t) throw new Error("Not connected yet.");
      const e = { ...draft, id: eventId(), t: Date.now(), by: who.userId } as RoomEvent;
      await t.send(e);
    },
    [me, opts.host],
  );

  const room = useMemo(() => fold(events), [events]);
  const ranked = useMemo(() => rank(room), [room]);

  return { me, setMe, room, ranked, status, mode, error, ready, send, isHost: !!me && room.hostId === me.userId };
}
