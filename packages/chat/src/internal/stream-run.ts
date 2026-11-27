// Generic adapter stream runner and frame-batched text buffer. Shared by the AI
// families (InlineAssist today; the Conversation runner can adopt it). No
// React, no DOM globals: the frame scheduler reads `requestAnimationFrame`
// from `globalThis` only when a flush is scheduled.
//
// - A `PromiseLike` result is one final response; an `AsyncIterable`
//   streams. There is no streaming flag.
// - A plain string chunk is a text delta (`{ type: 'text', delta }`).
// - Aborting the signal resolves the run at once (it does not wait for the
//   adapter's next chunk); a chunk or a value that arrives later is dropped.
// - The runner never throws: errors become `{ status: 'error' }`.

/** A typed response part. */
export type StreamPart =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'reasoning'; readonly delta: string }
  | { readonly type: 'tool'; readonly id: string; readonly name: string; readonly input: unknown; readonly output?: unknown; readonly status?: 'running' | 'done' | 'error' };

/** What an adapter yields: a text delta or a typed part. */
export type StreamChunk = string | StreamPart;

/** What an adapter returns: one final response or a stream. */
export type StreamResult = PromiseLike<string> | AsyncIterable<StreamChunk>;

export interface StreamSink {
  /** A text delta (never empty). */
  text(delta: string): void;
  /** A non-text part (`reasoning`, `tool`); ignored when absent. */
  part?(part: StreamPart): void;
}

export type StreamOutcome =
  | { readonly status: 'done'; readonly text: string }
  | { readonly status: 'aborted'; readonly text: string }
  | { readonly status: 'error'; readonly error: unknown; readonly text: string };

export const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => value != null && typeof (value as { then?: unknown }).then === 'function';
export const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => value != null && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';

const ABORTED: unique symbol = Symbol('aborted');
const noop = (): void => undefined;

/** Resolves with `ABORTED` when the signal aborts (immediately when it already has). */
function whenAborted(signal: AbortSignal): Promise<typeof ABORTED> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve(ABORTED);
    else signal.addEventListener('abort', () => resolve(ABORTED), { once: true });
  });
}

/**
 * Runs `start()` (the adapter call) and feeds its result into `sink` until it
 * ends or `signal` aborts. Returns the accumulated text with the outcome.
 * Never throws.
 */
export async function runStream(start: () => unknown, signal: AbortSignal, sink: StreamSink): Promise<StreamOutcome> {
  let text = '';
  const push = (chunk: unknown): void => {
    if (signal.aborted) return;
    if (typeof chunk === 'string') {
      if (chunk === '') return;
      text += chunk;
      sink.text(chunk);
      return;
    }
    if (chunk == null || typeof chunk !== 'object') return;
    const part = chunk as StreamPart;
    if (part.type === 'text') {
      if (typeof part.delta !== 'string' || part.delta === '') return;
      text += part.delta;
      sink.text(part.delta);
    } else sink.part?.(part);
  };
  const aborted = whenAborted(signal);
  try {
    const result = start();
    if (isPromiseLike<unknown>(result)) {
      const pending = Promise.resolve(result);
      pending.then(noop, noop);
      const value = await Promise.race([pending, aborted]);
      if (value === ABORTED || signal.aborted) return { status: 'aborted', text };
      push(value);
      return { status: 'done', text };
    }
    if (isAsyncIterable(result)) {
      const iterator = (result as AsyncIterable<unknown>)[Symbol.asyncIterator]();
      for (;;) {
        const next = iterator.next();
        // A step that settles after an abort is dropped, never unhandled.
        Promise.resolve(next).then(noop, noop);
        const step = await Promise.race([next, aborted]);
        if (step === ABORTED || signal.aborted) {
          // Let the adapter clean up (its `finally` blocks); its result is ignored.
          try {
            Promise.resolve(iterator.return?.()).then(noop, noop);
          } catch {
            // A throwing `return` changes nothing for the caller.
          }
          return { status: 'aborted', text };
        }
        if (step.done) return { status: 'done', text };
        push(step.value);
      }
    }
    return { status: 'done', text };
  } catch (error) {
    if (signal.aborted) return { status: 'aborted', text };
    return { status: 'error', error, text };
  }
}

/** Schedules `callback` once; returns a cancel function. */
export type FrameScheduler = (callback: () => void) => () => void;

/** `requestAnimationFrame` when present, else a 16 ms timer (Node, tests). */
export const frameScheduler: FrameScheduler = (callback) => {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (handle: number) => void };
  const raf = g.requestAnimationFrame;
  const caf = g.cancelAnimationFrame;
  if (raf && caf) {
    const handle = raf(callback);
    return () => caf(handle);
  }
  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
};

export interface StreamSnapshot {
  /** Text published by the last flush. */
  readonly text: string;
  /** A stream is open (between `start` and `end`). */
  readonly streaming: boolean;
}

/**
 * Text buffer of one streamed response: `push` appends to a pending list,
 * and one flush per frame publishes the joined text (one snapshot, one
 * listener round). `end` publishes synchronously.
 */
export interface StreamBuffer {
  start(): void;
  push(delta: string): void;
  /** Publishes the pending text, closes the stream and returns the full text. */
  end(): string;
  getSnapshot(): StreamSnapshot;
  subscribe(listener: () => void): () => void;
  /** Cancels a scheduled flush (unmount). */
  dispose(): void;
}

const IDLE: StreamSnapshot = Object.freeze({ text: '', streaming: false });

export function createStreamBuffer(schedule: FrameScheduler = frameScheduler): StreamBuffer {
  let snapshot = IDLE;
  let pending: string[] = [];
  let cancel: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const l of listeners) l();
  };
  const flush = (): void => {
    cancel = null;
    if (pending.length === 0) return;
    snapshot = { text: snapshot.text + pending.join(''), streaming: snapshot.streaming };
    pending = [];
    emit();
  };
  const stopFlush = (): void => {
    cancel?.();
    cancel = null;
  };
  return {
    start() {
      stopFlush();
      pending = [];
      snapshot = { text: '', streaming: true };
      emit();
    },
    push(delta) {
      if (!snapshot.streaming || delta === '') return;
      pending.push(delta);
      cancel ??= schedule(flush);
    },
    end() {
      stopFlush();
      const text = snapshot.text + pending.join('');
      pending = [];
      if (snapshot.streaming || text !== snapshot.text) {
        snapshot = { text, streaming: false };
        emit();
      }
      return text;
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose: stopFlush,
  };
}
