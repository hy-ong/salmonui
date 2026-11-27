import type { AbortSignalLike } from './types.js';

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(reason?: unknown): void;
}

type AbortControllerCtor = new () => AbortControllerLike;

class FallbackAbortSignal implements AbortSignalLike {
  aborted = false;
  reason: unknown = undefined;
  private listeners: (() => void)[] = [];
  addEventListener(_type: 'abort', listener: () => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_type: 'abort', listener: () => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  /** @internal */
  fire(reason: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    const listeners = this.listeners;
    this.listeners = [];
    for (const l of listeners) l();
  }
}

/** Uses the platform `AbortController` when present (browsers, Node, Deno, Bun, workers). */
export function createAbortController(): AbortControllerLike {
  const Ctor = (globalThis as { AbortController?: AbortControllerCtor }).AbortController;
  if (Ctor) return new Ctor();
  const signal = new FallbackAbortSignal();
  return { signal, abort: (reason?: unknown) => signal.fire(reason ?? new Error('Aborted')) };
}

export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}
