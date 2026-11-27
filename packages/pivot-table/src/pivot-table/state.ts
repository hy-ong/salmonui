'use client';

// State persistence: the report
// model is saved under `salmon-pivot-table:<id>` on every applied change and
// restored on mount (after hydration, so the server markup is the default
// report). Saved states are schema-versioned (`PivotTableState.version`) and
// tagged with the application `version`.

import { useLayoutEffect, useRef } from 'react';
import type { PivotController } from './controller.js';
import type { PivotPersistState } from './types.js';

export const PERSIST_PREFIX = 'salmon-pivot-table:';

interface Saved {
  readonly app?: string | undefined;
  readonly state: unknown;
}

function storageOf(persist: PivotPersistState): PivotPersistState['storage'] | null {
  if (persist.storage) return persist.storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Restores the saved state on mount and saves the model after every applied change. */
export function usePivotPersistence<Row>(pivot: PivotController<Row>, persist: PivotPersistState | undefined): void {
  const latest = useRef(persist);
  useLayoutEffect(() => {
    latest.current = persist;
  });
  const id = persist?.id;
  useLayoutEffect(() => {
    const options = latest.current;
    if (!id || !options) return;
    const storage = storageOf(options);
    if (!storage) return;
    const key = PERSIST_PREFIX + id;
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        if ((saved.app ?? undefined) === (options.version ?? undefined)) pivot.restoreState(saved.state as never);
      }
    } catch {
      // A corrupt entry is ignored and overwritten on the next change.
    }
    let model = pivot.model;
    return pivot.subscribe(() => {
      const next = pivot.model;
      if (next === model) return;
      model = next;
      try {
        const saved: Saved = { app: latest.current?.version, state: pivot.getState() };
        storage.setItem(key, JSON.stringify(saved));
      } catch {
        // Quota or privacy mode: persistence is best effort.
      }
    });
  }, [pivot, id]);
}
