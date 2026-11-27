import type { AbortSignalLike, Scheduler } from './types.js';

type TimerGlobals = {
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

/** Platform timers and `Date.now`, read lazily at call time (never at import). */
export function systemScheduler(): Scheduler {
  return {
    now: () => Date.now(),
    setTimeout(callback, ms) {
      const g = globalThis as TimerGlobals;
      if (!g.setTimeout) throw new Error('@salmonui/data: no setTimeout in this runtime; pass a scheduler.');
      return g.setTimeout(callback, ms);
    },
    clearTimeout(handle) {
      (globalThis as TimerGlobals).clearTimeout?.(handle);
    },
  };
}

export interface ManualScheduler extends Scheduler {
  /** Moves the clock forward, running due timers in order. */
  advance(ms: number): void;
  /** Runs every pending timer (advancing the clock to each). */
  runAll(): void;
  readonly pending: number;
}

/** Deterministic scheduler for tests: time only moves through `advance`. */
export function createManualScheduler(start = 0): ManualScheduler {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const next = (limit: number): number | null => {
    let best: number | null = null;
    let bestAt = Infinity;
    for (const [id, t] of timers) {
      if (t.at <= limit && (t.at < bestAt || (t.at === bestAt && id < (best ?? Infinity)))) {
        best = id;
        bestAt = t.at;
      }
    }
    return best;
  };
  return {
    now: () => now,
    setTimeout(callback, ms) {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), callback });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(ms) {
      const target = now + ms;
      for (let id = next(target); id !== null; id = next(target)) {
        const t = timers.get(id) as { at: number; callback: () => void };
        timers.delete(id);
        now = Math.max(now, t.at);
        t.callback();
      }
      now = target;
    },
    runAll() {
      for (let id = next(Infinity); id !== null; id = next(Infinity)) {
        const t = timers.get(id) as { at: number; callback: () => void };
        timers.delete(id);
        now = Math.max(now, t.at);
        t.callback();
      }
    },
    get pending() {
      return timers.size;
    },
  };
}

/** Resolves after `ms` on the scheduler; rejects with the abort reason when `signal` aborts. */
export function delay(scheduler: Scheduler, ms: number, signal?: AbortSignalLike): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      scheduler.clearTimeout(handle);
      reject(abortError(signal as AbortSignalLike));
    };
    const handle = scheduler.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(reason?: unknown): void;
}

class FallbackSignal implements AbortSignalLike {
  aborted = false;
  reason: unknown = undefined;
  private listeners: (() => void)[] = [];
  addEventListener(_type: 'abort', listener: () => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_type: 'abort', listener: () => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  fire(reason: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    const list = this.listeners;
    this.listeners = [];
    for (const l of list) l();
  }
}

/** Platform `AbortController` when present (read lazily), otherwise a structural fallback. */
export function createAbortController(): AbortControllerLike {
  const Ctor = (globalThis as { AbortController?: new () => AbortControllerLike }).AbortController;
  if (Ctor) return new Ctor();
  const signal = new FallbackSignal();
  return { signal, abort: (reason?: unknown) => signal.fire(reason ?? new AbortedError()) };
}

/** Error used for aborted requests. `name === 'AbortError'`. */
export class AbortedError extends Error {
  override readonly name = 'AbortError';
  constructor(message = 'The request was aborted.') {
    super(message);
  }
}

export function abortError(signal: AbortSignalLike): unknown {
  return signal.reason instanceof Error ? signal.reason : new AbortedError();
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/** Aborts `controller` when `signal` aborts; returns the unlink function. */
export function linkSignal(signal: AbortSignalLike | undefined, controller: AbortControllerLike): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }
  const onAbort = (): void => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort);
  return () => signal.removeEventListener('abort', onAbort);
}
