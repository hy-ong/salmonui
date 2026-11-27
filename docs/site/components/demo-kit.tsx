'use client';

import { useState } from 'react';

/**
 * Demo read-outs written from data-source and grid callbacks. The grid starts
 * data sources after mount and never invokes these callbacks while rendering,
 * so plain React state is safe: `set` is a stable `setState`.
 */
export interface DemoStore<T> {
  set(value: T | ((previous: T) => T)): void;
}

/** A value plus a stable setter that callbacks can capture once (for example in a data source created in `useState`). */
export function useDemoStore<T>(initial: T): [T, DemoStore<T>] {
  const [value, setValue] = useState(initial);
  const [store] = useState<DemoStore<T>>(() => ({ set: setValue }));
  return [value, store];
}

/** A bounded event log: `push` is stable and safe from any grid or data-source callback. */
export function useEventLog(limit = 30): [readonly string[], (entry: string) => void] {
  const [entries, store] = useDemoStore<readonly string[]>([]);
  const [push] = useState(() => (entry: string) => store.set((list) => [entry, ...list].slice(0, limit)));
  return [entries, push];
}

export function EventLog({ entries, label = 'Event log' }: { entries: readonly string[]; label?: string }) {
  return (
    <div className="demo-log" role="log" aria-label={label} tabIndex={0}>
      {entries.length === 0 ? (
        <span>No events yet.</span>
      ) : (
        <ol reversed>
          {entries.map((entry, index) => (
            <li key={`${entries.length - index}`}>{entry}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
