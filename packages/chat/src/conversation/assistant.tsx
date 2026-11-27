'use client';

// Assistant renderers (a chunk loaded only for
// `variant="assistant"`, through `#conversation-assistant`): prompt and
// response items, the pending response,
// reasoning and tool parts, response alternatives and
// feedback, the prompt / response action toolbars and
// `renderContent`. Model output is rendered as text nodes or by the
// application's `renderContent`, never as HTML.

import { use, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { replaceText } from '@salmonui/core/internal/text-edit';
import { useSpeechRecognition } from '@salmonui/inputs/speech-to-text';
import { useHydrated } from '@salmonui/core/internal/hydrated';
// Type-only: the conversation modules this chunk uses arrive as `kit`, so the
// chunk adds no static edge into the initial chunk (one initial chunk).
import type { ConversationConfig, ConversationInstance } from './context.js';
import type { ConversationText } from './format.js';
import type { AssistantKit } from './Item.js';
import type { ConversationStore } from './store.js';
import type { RunOutcome } from './runner.js';
import type { ConversationActionItem, ConversationAdapter, ConversationDictationProps, ConversationRequest, ConversationItemProps, ConversationLocaleText, ConversationMessage, ConversationResponsePart, ConversationToolPart } from './types.js';

const EMPTY: readonly never[] = Object.freeze([]);
/** Default `localeText` of the assistant renderers (the chat keys are in `CONVERSATION_DEFAULT_LOCALE_TEXT`). */
const TEXT: Partial<ConversationLocaleText> = {
  dictate: 'Dictate',
  dictationUnsupported: 'Dictation is not available in this browser',
  edit: 'Edit',
  regenerate: 'Regenerate',
  helpful: 'Helpful',
  notHelpful: 'Not helpful',
  previousResponse: 'Previous response',
  nextResponse: 'Next response',
  responseIndex: '{index} of {count}',
  reasoning: 'Reasoning',
  tool: '{name}: {status}',
  toolRunning: 'running',
  toolDone: 'done',
  toolError: 'failed',
  responding: 'Generating a response',
};
const PROMPT_ACTIONS: readonly ConversationActionItem[] = Object.freeze(['edit', 'copy'] as const);
const RESPONSE_ACTIONS: readonly ConversationActionItem[] = Object.freeze(['copy', 'regenerate', 'feedback'] as const);

const svg = (d: string): ReactNode => (
  <svg className="salmon-conversation-icon-svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS: Readonly<Record<string, string>> = {
  edit: 'M10.5 2.5l3 3L6 13H3v-3z',
  regenerate: 'M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3',
  positive: 'M5 7v6.5H2.5V7zM5 7l2.5-5c1 0 2 .8 1.7 2L8.5 6.5h4a1 1 0 0 1 1 1.2l-1 5a1 1 0 0 1-1 .8H5',
  negative: 'M5 9V2.5H2.5V9zM5 9l2.5 5c1 0 2-.8 1.7-2l-.7-2.5h4a1 1 0 0 0 1-1.2l-1-5a1 1 0 0 0-1-.8H5',
  prev: 'M10 3 5 8l5 5',
  next: 'M6 3l5 5-5 5',
};

/** Locale text: the application's `localeText`, then the assistant defaults, then the chat defaults. */
const textOf =
  (kit: AssistantKit, config: ConversationConfig): ConversationText =>
  (key, params) => {
    // The chat defaults hold no assistant keys: '' means "not overridden".
    const text = config.text(key, params);
    return text === '' && TEXT[key] !== undefined ? kit.formatMessage(TEXT[key], params, config.locale) : text;
  };

/** Fires `onItemActionClick`; returns true when the built-in follow-up was cancelled. */
function fire(instance: ConversationInstance, action: string, message: ConversationMessage, feedback?: 'positive' | 'negative'): boolean {
  let prevented = false;
  instance.props.onItemActionClick?.({
    action,
    message,
    ...(action === 'feedback' ? { feedback } : null),
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  });
  return prevented;
}

/** Prompt and response action toolbars. */
function Actions({ kit, message, shown, response, items }: { readonly kit: AssistantKit; readonly message: ConversationMessage; readonly shown: string; readonly response: boolean; readonly items: readonly ConversationActionItem[] }): ReactNode {
  const { instance, config } = kit.useConversation('Conversation.ItemActions');
  const tabbable = use(kit.ItemTabbableContext);
  const t = textOf(kit, config);
  let first = tabbable;
  const button = (id: string, label: string, icon: ReactNode, onClick: () => void, pressed?: boolean): ReactNode => {
    const tab = first;
    first = false;
    return (
      <button key={id} type="button" className="salmon-conversation-item-action" data-action={id} aria-label={label} title={label} aria-pressed={pressed} tabIndex={tab ? 0 : -1} onClick={onClick}>
        {icon}
      </button>
    );
  };
  const out: ReactNode[] = [];
  for (const item of items) {
    if (typeof item !== 'string') {
      out.push(button(item.id, item.label, item.icon ?? item.label, () => instance.action(item.id, message)));
    } else if (item === 'feedback') {
      if (!response) continue;
      for (const value of ['positive', 'negative'] as const) {
        const on = message.feedback === value;
        out.push(
          button(value, t(value === 'positive' ? 'helpful' : 'notHelpful'), svg(ICONS[value] as string), () => {
            const next = on ? undefined : value;
            if (fire(instance, 'feedback', message, next)) return;
            instance.commit((prev) => prev.map((m) => (m.id === message.id ? withFeedback(m, next) : m)), 'feedback');
          }, on),
        );
      }
    } else if (item === 'regenerate') {
      if (response) out.push(button(item, t(item), svg(ICONS[item] as string), () => fire(instance, item, message) || regenerate(instance, message.id)));
    } else if (item === 'edit') {
      if (!response)
        out.push(
          button(item, t(item), svg(ICONS[item] as string), () => {
            const el = instance.composer;
            if (!fire(instance, item, message) && el) replaceText(el, 0, el.value.length, message.text);
          }),
        );
    } else if (item === 'copy') {
      out.push(
        button(item, t(item), kit.icon('copy'), () => {
          if (!fire(instance, item, message)) void (globalThis as { navigator?: { clipboard?: { writeText(text: string): Promise<void> } } }).navigator?.clipboard?.writeText(shown).catch(() => {});
        }),
      );
    } else {
      out.push(button(item, item === 'pin' && message.pinned ? t('unpin') : t(item), kit.icon(item), () => instance.action(item, message)));
    }
  }
  if (out.length === 0) return null;
  return (
    <div role="toolbar" aria-label={t('messageActions')} className="salmon-conversation-item-actions" onKeyDown={kit.toolbarKeyDown}>
      {out}
    </div>
  );
}

function withFeedback(m: ConversationMessage, value: 'positive' | 'negative' | undefined): ConversationMessage {
  const { feedback: _old, ...rest } = m;
  return value ? { ...rest, feedback: value } : rest;
}

/**
 * Streamed reasoning and tool parts: a per-store channel of
 * this chunk, published at most once per animation frame, so the chat store
 * and the initial chunk stay unchanged. Keyed by the instance's store: a
 * runtime cache, not render state.
 */
interface PartsChannel {
  id: string;
  parts: readonly ConversationResponsePart[];
  frame: boolean;
  readonly listeners: Set<() => void>;
  readonly subscribe: (listener: () => void) => () => void;
}

const channels = new WeakMap<ConversationStore, PartsChannel>();

function channelOf(store: ConversationStore): PartsChannel {
  let c = channels.get(store);
  if (!c) {
    const listeners = new Set<() => void>();
    c = { id: '', parts: EMPTY, frame: false, listeners, subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)) };
    channels.set(store, c);
  }
  return c;
}

function publish(c: PartsChannel, id: string, parts: readonly ConversationResponsePart[]): void {
  if (c.id !== id) return;
  c.parts = parts;
  if (c.frame) return;
  c.frame = true;
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number };
  (g.requestAnimationFrame ?? ((cb: () => void) => setTimeout(cb, 16)))(() => {
    c.frame = false;
    for (const l of c.listeners) l();
  });
}

/** The parts of the streaming response (one reference per published frame), else the committed ones. */
function useStreamParts(store: ConversationStore, id: string, live: boolean, committed: readonly ConversationResponsePart[]): readonly ConversationResponsePart[] {
  const c = channelOf(store);
  const streamed = useSyncExternalStore(c.subscribe, () => (c.id === id ? c.parts : EMPTY), () => EMPTY);
  return live ? streamed : committed;
}

/** Streamed text through `renderContent`: one render per flushed frame of this item only. */
function StreamContent({ store, message, render }: { readonly store: ConversationStore; readonly message: ConversationMessage; readonly render: NonNullable<ConversationConfig['renderContent']> }): ReactNode {
  const text = useSyncExternalStore(
    store.subscribeStream,
    () => {
      const s = store.getStream();
      return s?.id === message.id ? s.text : '';
    },
    () => '',
  );
  return <span className="salmon-conversation-stream">{text === '' ? null : render(text, { message, streaming: true })}</span>;
}

const TOOL_STATUS = { running: 'toolRunning', done: 'toolDone', error: 'toolError' } as const;

function Part({ kit, instance, part, message, streaming, config }: { readonly kit: AssistantKit; readonly instance: ConversationInstance; readonly part: ConversationResponsePart; readonly message: ConversationMessage; readonly streaming: boolean; readonly config: ConversationConfig }): ReactNode {
  const t = textOf(kit, config);
  if (part.type === 'reasoning') {
    if (config.renderReasoning) return config.renderReasoning({ text: part.delta, message, streaming });
    return (
      <details className="salmon-conversation-reasoning" onToggle={(event) => instance.props.onReasoningClick?.(Object.freeze({ message, open: event.currentTarget.open }))}>
        <summary>{t('reasoning')}</summary>
        <div dir="auto">{part.delta}</div>
      </details>
    );
  }
  if (part.type !== 'tool') return null;
  const tool: ConversationToolPart = part;
  const custom = config.renderTool?.[tool.name];
  if (custom) return custom({ part: tool, message });
  const status = tool.status ?? (tool.output === undefined ? 'running' : 'done');
  return (
    <details className="salmon-conversation-reasoning" data-tool={tool.name} data-status={status}>
      <summary>{t('tool', { name: tool.name, status: t(TOOL_STATUS[status]) })}</summary>
      <pre dir="auto">{json(tool.input)}</pre>
      {tool.output !== undefined ? <pre dir="auto">{json(tool.output)}</pre> : null}
    </details>
  );
}

const json = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
};

/** A prompt or response of the assistant variant (`Conversation.Item` with `variant="assistant"`). */
export function AssistantItem({ kit, message, children, className, style }: ConversationItemProps & { readonly kit: AssistantKit }): ReactNode {
  const { Avatar, AttachmentChip, StreamText, join } = kit;
  const { instance, config } = kit.useConversation('Conversation.Item');
  const tabbable = use(kit.ItemTabbableContext);
  const hydrated = useHydrated();
  const store = instance.store;
  const streaming = kit.useStreaming(store, message.id);
  const t = textOf(kit, config);
  const own = message.author === config.currentUser;
  const live = !own && (streaming === 'live' || (streaming === 'done' && message.text === ''));
  const parts = useStreamParts(store, message.id, live, message.parts ?? EMPTY);
  // Alternatives: earlier responses, then the latest; the shown one is local view state.
  const all = message.alternatives && message.alternatives.length > 0 ? [...message.alternatives, message.text] : null;
  const [view, setView] = useState<{ readonly count: number; readonly index: number } | null>(null);
  const index = all ? (view && view.count === all.length ? view.index : all.length - 1) : 0;
  const shown = all ? (all[index] as string) : message.text;
  const user = config.users.get(message.author);
  const date = kit.messageDate(message);
  const idBase = `${instance.baseId}-m-${message.id}`;
  const actions = config.itemActions;
  const split = actions as { readonly prompt?: readonly ConversationActionItem[]; readonly response?: readonly ConversationActionItem[] } | undefined;
  const items = actions === false ? EMPTY : Array.isArray(actions) ? (actions as readonly ConversationActionItem[]) : ((own ? split?.prompt : split?.response) ?? (own ? PROMPT_ACTIONS : RESPONSE_ACTIONS));
  const render = config.renderContent;
  let body: ReactNode = children;
  if (body === undefined) {
    if (live) {
      body = (
        <>
          {render ? <StreamContent store={store} message={message} render={render} /> : <StreamText store={store} id={message.id} />}
          <span className="salmon-conversation-pending">
            {config.renderPending ? config.renderPending({ message }) : <span className="salmon-conversation-skeleton" />}
            <span className="salmon-conversation-sr">{t('responding')}</span>
          </span>
        </>
      );
    } else if (!own && render) body = render(shown, { message, streaming: false });
    else body = own ? kit.mentionSegments(shown, message.mentions, (id) => config.users.get(id)).map((seg, i) => (seg.mention ? <span key={i} className="salmon-conversation-mention" data-user={seg.mention}>{seg.text}</span> : seg.text)) : shown;
  }
  const step = (delta: 1 | -1): void => setView({ count: (all as string[]).length, index: index + delta });
  return (
    <div className={join('salmon-conversation-item', className)} style={style} data-own={own ? '' : undefined} data-author={message.author} data-role={own ? 'prompt' : 'response'} data-status={message.status}>
      <Avatar user={user} id={message.author} config={config} />
      <div className="salmon-conversation-item__body">
        <div className="salmon-conversation-item__meta">
          <span id={`${idBase}-author`} className="salmon-conversation-item__author">
            {user?.name ?? message.author}
          </span>
          {config.timestamps && date ? (
            <time id={`${idBase}-time`} className="salmon-conversation-item__time" dateTime={date.toISOString()}>
              {kit.formatDate(config, date, hydrated, kit.DEFAULT_TIME_FORMAT)}
            </time>
          ) : null}
        </div>
        {parts.map((part, i) => (
          <Part key={part.type === 'tool' ? part.id : i} kit={kit} instance={instance} part={part} message={message} streaming={live} config={config} />
        ))}
        <div className="salmon-conversation-item__bubble" dir="auto">
          {body}
        </div>
        {all && !live ? (
          <div role="group" className="salmon-conversation-alternatives" aria-label={t('responseIndex', { index: index + 1, count: all.length })}>
            <button type="button" className="salmon-conversation-item-action" aria-label={t('previousResponse')} disabled={index === 0} tabIndex={tabbable ? 0 : -1} onClick={() => step(-1)}>
              {svg(ICONS['prev'] as string)}
            </button>
            <span aria-hidden="true">{t('responseIndex', { index: index + 1, count: all.length })}</span>
            <button type="button" className="salmon-conversation-item-action" aria-label={t('nextResponse')} disabled={index === all.length - 1} tabIndex={tabbable ? 0 : -1} onClick={() => step(1)}>
              {svg(ICONS['next'] as string)}
            </button>
          </div>
        ) : null}
        {message.attachments && message.attachments.length > 0 ? (
          <div className="salmon-conversation-item__attachments">
            {message.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} message={message} tabbable={tabbable} config={config} />
            ))}
          </div>
        ) : null}
        {message.status === 'error' && !own ? (
          <div className="salmon-conversation-item__status" data-status="error">
            <button type="button" className="salmon-conversation-retry" tabIndex={tabbable ? 0 : -1} onClick={() => regenerate(instance, message.id)}>
              {t('retry')}
            </button>
          </div>
        ) : null}
      </div>
      {live ? null : <Actions kit={kit} message={message} shown={shown} response={!own} items={items} />}
    </div>
  );
}

/** `api.regenerate(id)`: the previous text becomes an alternative and the adapter runs again for the prompt before `id`; a failed response (Retry) commits with `'retry'`. */
export function regenerate(instance: ConversationInstance, id: string): void {
  const messages = instance.store.getMessages();
  const at = instance.store.indexOf(id);
  const me = instance.props.currentUser ?? 'user';
  let prompt = at - 1;
  while (prompt >= 0 && (messages[prompt] as ConversationMessage).author !== me) prompt--;
  // An unknown id (at -1) leaves prompt below 0.
  if (!instance.props.adapter || prompt < 0) return;
  const history = messages.slice(0, prompt + 1);
  const last = history[prompt] as ConversationMessage;
  instance.commit(
    (prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const { parts: _p, feedback: _f, alternatives = EMPTY, ...rest } = m;
        const alts = m.text === '' ? alternatives : [...alternatives, m.text];
        return { ...rest, text: '', status: 'sending' as const, ...(alts.length ? { alternatives: alts } : null) };
      }),
    (messages[at] as ConversationMessage).status === 'error' ? 'retry' : 'regenerate',
  );
  instance.respond(history, last.text, last.attachments ?? EMPTY, id);
}

/**
 * `Conversation.Dictation`: the Inputs `useSpeechRecognition` hook
 * from its public entry (a composition edge to `@salmonui/inputs/speech-to-text`;
 * no SpeechToText markup). The transcript replaces the text after the draft
 * that was in the composer when the session started, through the native
 * input path (undo and `onValueChange` see it). Disabled on the server, during
 * hydration and without recognition, with the reason as its description.
 */
export function Dictation({ kit, lang, recognizer, className, style }: ConversationDictationProps & { readonly kit: AssistantKit }): ReactNode {
  const { instance, config } = kit.useConversation('Conversation.Dictation');
  const text = textOf(kit, config);
  const base = useRef(0);
  const speech = useSpeechRecognition({
    ...(lang !== undefined ? { lang } : null),
    ...(recognizer ? { recognizer } : null),
    onTranscriptChange: (transcript) => {
      const el = instance.composer;
      if (!el) return;
      // The draft before the session stays; dictated text follows it after a space.
      const at = Math.min(base.current, el.value.length);
      const sep = at > 0 && !/\s$/u.test(el.value.slice(0, at)) ? ' ' : '';
      replaceText(el, at, el.value.length, sep + transcript);
    },
  });
  const listening = speech.state === 'listening';
  return (
    <button
      type="button"
      className={['salmon-conversation-composer__dictate', className].filter(Boolean).join(' ')}
      style={style}
      aria-label={text('dictate')}
      disabled={!speech.supported}
      title={speech.supported ? undefined : text('dictationUnsupported')}
      aria-pressed={speech.supported ? listening : undefined}
      data-listening={listening ? '' : undefined}
      onClick={() => {
        if (listening) return speech.stop();
        base.current = instance.composer?.value.length ?? 0;
        speech.start();
      }}
    >
      {kit.icon('mic')}
    </button>
  );
}

type Part = ConversationResponsePart;

/**
 * Appends a reasoning or tool part: a reasoning delta
 * extends the last part when it is reasoning, a tool part updates the one
 * with its `id` (status and output). Returns a new array.
 */
export function mergePart(parts: readonly Part[], part: Part): readonly Part[] {
  const last = parts[parts.length - 1];
  if (part.type === 'reasoning' && last?.type === 'reasoning') return [...parts.slice(0, -1), { type: 'reasoning', delta: last.delta + part.delta }];
  if (part.type === 'tool') {
    const at = parts.findIndex((p) => p.type === 'tool' && p.id === part.id);
    if (at >= 0) return parts.map((p, i) => (i === at ? { ...p, ...part } : p));
  }
  return [...parts, part];
}

const isIterable = (value: unknown): value is AsyncIterable<string | Part> => value != null && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';

/**
 * An assistant response over the chat runner:
 * text chunks (a string or a `text` part) stream as before; reasoning and
 * tool parts are merged and published to the stream once per frame; the
 * committed message carries them. A response that produced nothing is
 * dropped, or a regenerated one gets its previous text back.
 */
export async function run(adapter: ConversationAdapter, request: ConversationRequest, id: string, store: ConversationStore, signal: AbortSignal, runAdapter: (adapter: ConversationAdapter, request: ConversationRequest, id: string, store: ConversationStore, signal: AbortSignal) => Promise<RunOutcome>): Promise<RunOutcome> {
  let parts: readonly Part[] = [];
  const channel = channelOf(store);
  channel.id = id;
  channel.parts = EMPTY;
  const wrapped: ConversationAdapter = (req, context) => {
    const result = adapter(req, context);
    if (!isIterable(result)) return result;
    return (async function* () {
      for await (const chunk of result) {
        if (typeof chunk === 'string') yield chunk;
        else if (chunk?.type === 'text') yield chunk.delta;
        else if (chunk?.type === 'reasoning' || chunk?.type === 'tool') {
          parts = mergePart(parts, chunk);
          publish(channel, id, parts);
        }
      }
    })();
  };
  const outcome = await runAdapter(wrapped, request, id, store, signal);
  const failed = outcome.status === 'error';
  return {
    ...outcome,
    apply: (m) => {
      const { status: _s, parts: _p, alternatives, ...rest } = m;
      if (outcome.text === '' && !failed && parts.length === 0) {
        if (!alternatives?.length) return null;
        return { ...rest, text: alternatives[alternatives.length - 1] as string, ...(alternatives.length > 1 ? { alternatives: alternatives.slice(0, -1) } : null) };
      }
      return { ...rest, ...(alternatives ? { alternatives } : null), text: outcome.text, ...(parts.length > 0 ? { parts } : null), ...(failed ? { status: 'error' as const } : null) };
    },
  };
}

/** The composer clear button (`Conversation.Composer` `clearable`); hidden by CSS while the draft is empty. */
export function ClearButton({ kit, disabled, clear }: { readonly kit: AssistantKit; readonly disabled: boolean; readonly clear: () => void }): ReactNode {
  const { config } = kit.useConversation('Conversation.Composer');
  return (
    <button type="button" className="salmon-conversation-composer__clear" aria-label={config.text('clear')} disabled={disabled} onClick={clear}>
      {kit.icon('close')}
    </button>
  );
}
