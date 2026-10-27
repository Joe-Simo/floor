"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Rooms live in browser storage and sockets, so they render only on the client. */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <>{children}</> : <div className="min-h-dvh" aria-busy="true" />;
}
