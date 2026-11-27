// Per-instance conversation store. Messages
// are an ordered id list plus a record map keyed by `message.id`; a new
// `messages` array is diffed by id and reference, so React items that read
// their own record through `useSyncExternalStore` re-render only when that
// record changed. Streamed text never touches React state: chunks are
// buffered here and one flush per animation frame publishes them to the
// streaming item only. View transients (at-bottom flag, unread count,
// mounted window, reply target) live here too. No React, no DOM globals.

import type { ConversationMessage } from './types.js';

export interface ConversationView {
  /** The scroller is at (or within a few px of) the bottom. */
  readonly atBottom: boolean;
  /** Incoming messages appended while not at the bottom. */
  readonly unread: number;
  /** Mounted item range `[first, last)`. */
  readonly first: number;
  readonly last: number;
  /** Older history is loading. */
  readonly loadingOlder: boolean;
  /** Message the composer replies to. */
  readonly replyTo: string | null;
  /** Index of the article that holds the feed's tab stop (-1: the last one). */
  readonly focusIndex: number;
  /** An adapter response is pending or streaming. */
  readonly responding: boolean;
}

export interface StreamState {
  readonly id: string;
  /** Text published by the last flush. */
  readonly text: string;
  readonly done: boolean;
}

/** What a `setMessages` call changed, for scroll anchoring and announcements. */
export interface MessagesDiff {
  /** Ids added after the previous last message. */
  readonly appended: readonly string[];
  /** Items added before the previous first message. */
  readonly prepended: number;
  readonly changed: boolean;
}

export type FrameScheduler = (callback: () => void) => () => void;

export interface ConversationStore {
  getIds(): readonly string[];
  getMessage(id: string): ConversationMessage | undefined;
  /** Current messages in order (a cached array; same reference until the next change). */
  getMessages(): readonly ConversationMessage[];
  indexOf(id: string): number;
  setMessages(next: readonly ConversationMessage[]): MessagesDiff;
  subscribe(listener: () => void): () => void;

  getView(): ConversationView;
  setView(patch: Partial<ConversationView>): void;

  /** Starts buffering a streamed response for message `id`. */
  startStream(id: string): void;
  /** Appends a chunk; publishes at the next animation frame. */
  pushStream(delta: string): void;
  /** Publishes the buffer now and marks the stream done; returns the full text. */
  endStream(): string;
  getStream(): StreamState | null;
  subscribeStream(listener: () => void): () => void;
  /** Cancels a scheduled flush (unmount). */
  dispose(): void;
}

const EMPTY_VIEW: ConversationView = Object.freeze({ atBottom: true, unread: 0, first: 0, last: 0, loadingOlder: false, replyTo: null, focusIndex: -1, responding: false });

/** `requestAnimationFrame` when present, else a macrotask. */
export const defaultFrameScheduler: FrameScheduler = (callback) => {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (handle: number) => void };
  if (g.requestAnimationFrame && g.cancelAnimationFrame) {
    const raf = g.requestAnimationFrame;
    const caf = g.cancelAnimationFrame;
    const handle = raf(callback);
    return () => caf(handle);
  }
  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
};

/** Diff of two id lists: appended ids after the old last id, and the count prepended before the old first id. */
export function diffIds(previous: readonly string[], next: readonly string[]): { appended: string[]; prepended: number } {
  if (previous.length === 0) return { appended: [...next], prepended: 0 };
  const firstOld = previous[0] as string;
  const lastOld = previous[previous.length - 1] as string;
  const prepended = Math.max(0, next.indexOf(firstOld));
  const lastIndex = next.lastIndexOf(lastOld);
  const appended = lastIndex < 0 ? [] : next.slice(lastIndex + 1);
  return { appended, prepended: next.indexOf(firstOld) < 0 ? 0 : prepended };
}

export function createConversationStore(initial: readonly ConversationMessage[], schedule: FrameScheduler = defaultFrameScheduler): ConversationStore {
  let messages: readonly ConversationMessage[] = initial;
  let ids: readonly string[] = initial.map((m) => m.id);
  let records = new Map<string, ConversationMessage>(initial.map((m) => [m.id, m]));
  let positions: Map<string, number> | null = null;
  let view = EMPTY_VIEW;
  const listeners = new Set<() => void>();
  const streamListeners = new Set<() => void>();
  let stream: StreamState | null = null;
  let pending: string[] = [];
  let cancelFlush: (() => void) | null = null;

  const emit = (): void => {
    for (const l of listeners) l();
  };
  const emitStream = (): void => {
    for (const l of streamListeners) l();
  };
  const flush = (): void => {
    cancelFlush = null;
    if (!stream || pending.length === 0) return;
    stream = { id: stream.id, text: stream.text + pending.join(''), done: stream.done };
    pending = [];
    emitStream();
  };

  return {
    getIds: () => ids,
    getMessage: (id) => records.get(id),
    getMessages: () => messages,
    indexOf(id) {
      positions ??= new Map(ids.map((value, index) => [value, index]));
      return positions.get(id) ?? -1;
    },
    setMessages(next) {
      if (next === messages) return { appended: [], prepended: 0, changed: false };
      const nextIds = next.map((m) => m.id);
      const sameIds = nextIds.length === ids.length && nextIds.every((id, i) => id === ids[i]);
      const nextRecords = new Map<string, ConversationMessage>();
      let changed = !sameIds;
      for (const m of next) {
        nextRecords.set(m.id, m);
        if (records.get(m.id) !== m) changed = true;
      }
      const diff = sameIds ? { appended: [], prepended: 0 } : diffIds(ids, nextIds);
      messages = next;
      records = nextRecords;
      if (!sameIds) {
        ids = nextIds;
        positions = null;
      }
      if (changed) emit();
      return { ...diff, changed };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getView: () => view,
    setView(patch) {
      let changed = false;
      for (const key of Object.keys(patch) as (keyof ConversationView)[]) {
        if (patch[key] !== undefined && !Object.is(patch[key], view[key])) changed = true;
      }
      if (!changed) return;
      view = { ...view, ...patch };
      emit();
    },
    startStream(id) {
      cancelFlush?.();
      cancelFlush = null;
      pending = [];
      stream = { id, text: '', done: false };
      emitStream();
    },
    pushStream(delta) {
      if (!stream || stream.done || delta === '') return;
      pending.push(delta);
      cancelFlush ??= schedule(flush);
    },
    endStream() {
      if (!stream) return '';
      cancelFlush?.();
      cancelFlush = null;
      const text = stream.text + pending.join('');
      pending = [];
      stream = { id: stream.id, text, done: true };
      emitStream();
      return text;
    },
    getStream: () => stream,
    subscribeStream(listener) {
      streamListeners.add(listener);
      return () => void streamListeners.delete(listener);
    },
    dispose() {
      cancelFlush?.();
      cancelFlush = null;
    },
  };
}
