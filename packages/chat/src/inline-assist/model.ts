// InlineAssist model: the per-instance
// store (response phase, command menu flag, the streamed text buffer) and
// the pure helpers the component uses. No React, no DOM globals.

import { createStreamBuffer, type FrameScheduler, type StreamBuffer } from '../internal/stream-run.js';
import type { InlineAssistAnchor, InlineAssistCommand, InlineAssistLocaleText, InlineAssistMessage, InlineAssistPoint, InlineAssistRequest } from './types.js';

export const INLINE_ASSIST_DEFAULT_LOCALE_TEXT: Required<InlineAssistLocaleText> = Object.freeze({
  label: 'AI assistant',
  prompt: 'Prompt',
  placeholder: 'Ask AI, or type / for commands',
  send: 'Send',
  stop: 'Stop',
  accept: 'Accept',
  discard: 'Discard',
  retry: 'Retry',
  commands: 'Commands',
  responseActions: 'Response actions',
  pending: 'Thinking…',
  error: 'The response failed.',
  dictation: 'Dictate',
});

/** `'idle'`: no response shown; `'pending'`: waiting for the first chunk; `'streaming'`; `'done'`: a finished (or stopped, or failed) response. */
export type AssistPhase = 'idle' | 'pending' | 'streaming' | 'done';

export interface AssistView {
  readonly phase: AssistPhase;
  /** The shown response once finished (`phase: 'done'`). */
  readonly message: InlineAssistMessage | null;
  /** The command menu is shown through `api.showCommands()` (typing `/` shows it too). */
  readonly commands: boolean;
}

export interface AssistStore {
  getView(): AssistView;
  setView(patch: Partial<AssistView>): void;
  subscribe(listener: () => void): () => void;
  readonly stream: StreamBuffer;
  dispose(): void;
}

const IDLE_VIEW: AssistView = Object.freeze({ phase: 'idle', message: null, commands: false });

export function createAssistStore(schedule?: FrameScheduler): AssistStore {
  let view = IDLE_VIEW;
  const listeners = new Set<() => void>();
  const stream = createStreamBuffer(schedule);
  return {
    getView: () => view,
    setView(patch) {
      let changed = false;
      for (const key of Object.keys(patch) as (keyof AssistView)[]) if (patch[key] !== undefined && !Object.is(patch[key], view[key])) changed = true;
      if (!changed) return;
      view = { ...view, ...patch };
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    stream,
    dispose: () => stream.dispose(),
  };
}

/** The filter text after a leading `/` (no whitespace), or `null` when the prompt is not a command query. */
export function commandQuery(value: string): string | null {
  const match = /^\/(\S*)$/.exec(value);
  return match ? (match[1] as string) : null;
}

/** Commands whose label or keywords contain `query` (case-insensitive); all of them for an empty query. */
export function filterCommands(commands: readonly InlineAssistCommand[], query: string): readonly InlineAssistCommand[] {
  const q = query.trim().toLowerCase();
  if (q === '') return commands;
  return commands.filter((c) => c.label.toLowerCase().includes(q) || (c.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false));
}

export const isPoint = (anchor: unknown): anchor is InlineAssistPoint => anchor != null && typeof (anchor as InlineAssistPoint).x === 'number' && typeof (anchor as InlineAssistPoint).y === 'number' && !('getBoundingClientRect' in (anchor as object));

/** A DOM `Range` (duck-typed, so the module stays free of DOM globals). */
export const isRange = (anchor: unknown): anchor is Range => anchor != null && typeof (anchor as Range).getBoundingClientRect === 'function' && typeof (anchor as Range).cloneContents === 'function';

/** The request's `selection`: the prop, else the text of a `Range` anchor, else `''`. Event time only. */
export function selectionText(anchor: InlineAssistAnchor | null | undefined, selection: string | undefined): string {
  if (selection !== undefined) return selection;
  return isRange(anchor) ? anchor.toString() : '';
}

export function buildRequest(prompt: string, command: InlineAssistCommand | undefined, selection: string, messages: readonly InlineAssistMessage[]): InlineAssistRequest {
  return Object.freeze({ prompt, command, selection, messages });
}

/** Appends `message`, or replaces the last message when `replaceLast` (Retry). */
export function commitMessage(messages: readonly InlineAssistMessage[], message: InlineAssistMessage, replaceLast: boolean): readonly InlineAssistMessage[] {
  return replaceLast && messages.length > 0 ? [...messages.slice(0, -1), message] : [...messages, message];
}

/** The prompt after dictation: the text before dictation started, a space, then the transcript. */
export function mergeTranscript(base: string, transcript: string): string {
  if (transcript === '') return base;
  if (base === '' || /\s$/.test(base)) return base + transcript;
  return `${base} ${transcript}`;
}

/** A frozen event whose `preventDefault()` cancels the built-in follow-up. */
export function cancelable<T extends object>(fields: T): T & { preventDefault(): void; readonly defaultPrevented: boolean } {
  let prevented = false;
  return Object.freeze(
    Object.defineProperties(
      { ...fields, preventDefault: () => void (prevented = true) },
      { defaultPrevented: { get: () => prevented, enumerable: true } },
    ),
  ) as T & { preventDefault(): void; readonly defaultPrevented: boolean };
}
