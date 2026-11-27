'use client';

// Client-only values that must not appear in server HTML (today, the host
// time zone). `useSyncExternalStore` with a
// server snapshot makes the hydration render match the server render, then
// re-renders once with the client value.

import { useSyncExternalStore } from 'react';

const subscribe = (): (() => void) => () => {};

/** False on the server and during hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Re-reads `read` on the client (after hydration) and returns `null` on the
 * server and during hydration. `read` must return a primitive so repeated
 * reads compare equal.
 */
export function useClientValue<T extends string | number | boolean>(read: () => T): T | null {
  return useSyncExternalStore<T | null>(subscribe, read, () => null);
}
