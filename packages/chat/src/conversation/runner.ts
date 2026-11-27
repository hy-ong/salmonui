// Adapter runner: a Promise result is one
// final response, an AsyncIterable streams. Chunks go to the store's stream
// buffer (flushed once per animation frame); a chunk that arrives after the
// signal aborted is dropped. No React, no DOM globals.

import type { ConversationStore } from './store.js';
import type { ConversationAdapter, ConversationMessage, ConversationRequest } from './types.js';

export type RunOutcome = ({ readonly status: 'done' | 'aborted' } | { readonly status: 'error'; readonly error: unknown }) & {
  readonly text: string;
  /** The committed response for the message before the run (null drops it); the chat default when absent. */
  readonly apply?: (message: ConversationMessage) => ConversationMessage | null;
};

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => value != null && typeof (value as { then?: unknown }).then === 'function';
const isAsyncIterable = (value: unknown): value is AsyncIterable<string> => value != null && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';

/** Runs `adapter` for `request`, streaming into `store` under message `id`. Never throws. */
export async function runAdapter(adapter: ConversationAdapter, request: ConversationRequest, id: string, store: ConversationStore, signal: AbortSignal): Promise<RunOutcome> {
  store.startStream(id);
  let text = '';
  // A newer response may own the stream buffer; this run then only keeps its own text.
  const mine = (): boolean => store.getStream()?.id === id;
  // Strings only: the assistant variant's runner (its chunk) turns parts into strings and part updates.
  const push = (chunk: unknown): void => {
    if (typeof chunk !== 'string' || chunk === '') return;
    text += chunk;
    if (mine()) store.pushStream(chunk);
  };
  const end = (): string => {
    if (mine()) store.endStream();
    return text;
  };
  try {
    const result = adapter(request, { signal });
    if (isPromiseLike<string>(result)) {
      const value = await result;
      if (signal.aborted) return { status: 'aborted', text: end() };
      push(value);
      return { status: 'done', text: end() };
    }
    if (isAsyncIterable(result)) {
      for await (const chunk of result) {
        if (signal.aborted) break;
        push(chunk);
      }
      return signal.aborted ? { status: 'aborted', text: end() } : { status: 'done', text: end() };
    }
    return { status: 'done', text: end() };
  } catch (error) {
    const partial = end();
    if (signal.aborted) return { status: 'aborted', text: partial };
    return { status: 'error', error, text: partial };
  }
}
