'use client';

// <Conversation variant="chat" | "assistant">: the root owns the store,
// the message triad, the adapter runner, the live region and the feed. The
// feed is an APG Feed (`role="feed"`, `role="article"` items) inside a
// `flex-direction: column-reverse` scroller, so server HTML is already
// bottom-anchored and prepending older history keeps the distance from the
// bottom (the technique holds with the virtualizer; the anchor restore
// below covers measurement changes).
// Variable-height windowing reuses the Data Grid core metrics
// (`createVariableRowMetrics`, `computeRange`). Scroll position, the
// at-bottom flag, measured heights and the unread count live in the store
// or the DOM, never in React state.

import { computeRange, createVariableRowMetrics, type VariableRowMetrics } from '@salmonui/core/virtual';
import { Children, isValidElement, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { focusableIn } from '@salmonui/core/internal/focus-scope';
import { ConversationConfigContext, ConversationInstanceContext, join, useStore, type ConversationConfig, type ConversationInstance, type SendOptions } from './context.js';
import { createText, typingText } from './format.js';
import { FeedItem } from './Item.js';
import { ConversationJumpButton, ConversationPinnedBar, SLOT } from './parts.js';
import { loadAssistant } from '#conversation-assistant';
import { runAdapter, type RunOutcome } from './runner.js';
import { createConversationStore, type ConversationStore } from './store.js';
import type { ConversationAttachment, ConversationChangeReason, ConversationMessage, ConversationProps, ConversationUser } from './types.js';

const EMPTY: readonly never[] = Object.freeze([]);
const OVERSCAN = 6;
/** Distance from the bottom in px that still counts as "at the bottom". */
const BOTTOM_SLACK = 4;

/** Mutable feed geometry: measured heights by id and the metrics built from them. */
interface FeedGeometry {
  heights: Map<string, number>;
  metrics: VariableRowMetrics;
  ids: readonly string[];
  /** The first visible article and its offset from the scroller's top edge. */
  anchor: { id: string; top: number } | null;
  /** Keep the view at the bottom on the next adjust. */
  stick: boolean;
  /** Reveal this message once it is mounted. */
  reveal: { id: string; focus: boolean } | null;
  observer: ResizeObserver | null;
  frame: number;
  /** The scroll position this code last wrote or observed; a different one means the user scrolled. */
  lastTop: number;
}


/** Index window rendered on the server and before the first measurement. */
function initialWindow(count: number, initial: number): { first: number; last: number } {
  return { first: Math.max(0, count - initial), last: count };
}

function Feed({ instance, geometry, setSize, busy, label }: { readonly instance: ConversationInstance; readonly geometry: FeedGeometry; readonly setSize: number; readonly busy: boolean; readonly label: string }): ReactNode {
  const store = instance.store;
  const ids = useStore(store, store.getIds);
  const first = useStore(store, () => store.getView().first);
  const last = useStore(store, () => store.getView().last);
  const focusIndex = useSyncExternalStore(store.subscribe, () => store.getView().focusIndex, () => -1);
  const end = Math.min(last, ids.length);
  const items: ReactNode[] = [];
  // The roving article stays mounted when scrolled out of the window.
  const push = (i: number): void => void items.push(<FeedItem key={ids[i]} id={ids[i] as string} index={i} setSize={setSize} />);
  if (focusIndex >= 0 && focusIndex < first && focusIndex < ids.length) push(focusIndex);
  for (let i = first; i < end; i++) push(i);
  if (focusIndex >= end && focusIndex < ids.length) push(focusIndex);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const article = (event.target as Element).closest('article');
    if (!article || !event.currentTarget.contains(article)) return;
    const index = Number(article.getAttribute('data-index'));
    const root = instance.root;
    if ((event.ctrlKey || event.metaKey) && (event.key === 'End' || event.key === 'Home')) {
      // APG Feed: leave the feed to the first focusable element after / before it.
      const scroller = instance.scroller;
      if (!root || !scroller) return;
      const all = focusableIn(root).filter((el) => !scroller.contains(el));
      const after = event.key === 'End';
      const target = after ? all.find((el) => scroller.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) : [...all].reverse().find((el) => scroller.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
      if (target) {
        event.preventDefault();
        target.focus();
      }
      return;
    }
    if (event.target !== article) return;
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      const next = index + (event.key === 'PageDown' ? 1 : -1);
      const id = store.getIds()[next];
      if (id !== undefined) instance.scrollToMessage(id, true);
    }
  };
  const onFocus = (event: { target: EventTarget }): void => {
    const article = (event.target as Element).closest?.('article');
    if (article) store.setView({ focusIndex: Number(article.getAttribute('data-index')) });
  };

  return (
    <div role="feed" className="salmon-conversation-feed" aria-label={label} aria-busy={busy ? true : undefined} onKeyDown={onKeyDown} onFocus={onFocus}>
      {items}
    </div>
  );
}

function TypingIndicator({ users, config, render }: { readonly users: readonly string[]; readonly config: ConversationConfig; readonly render: ConversationProps['renderTyping'] }): ReactNode {
  if (users.length === 0) return null;
  const resolved = users.map((id) => config.users.get(id) ?? ({ id, name: id } as ConversationUser));
  return (
    <div className="salmon-conversation-typing" aria-hidden="true">
      {render ? (
        render({ users: resolved })
      ) : (
        <>
          <span className="salmon-conversation-typing__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="salmon-conversation-typing__text">{typingText(config.text, resolved.map((u) => u.name))}</span>
        </>
      )}
    </div>
  );
}

export function ConversationRoot(props: ConversationProps): ReactNode {
  const {
    variant = 'chat',
    currentUser = 'user',
    users = EMPTY,
    typingUsers = EMPTY,
    layout = 'bubbles',
    timestamps = true,
    formatTimestamp,
    timeZone,
    dateSeparators = false,
    renderDateSeparator,
    renderItem,
    renderAvatar,
    renderEmpty,
    renderTyping,
    itemActions,
    renderContent,
    renderPending,
    renderReasoning,
    renderTool,
    hasOlder = false,
    jumpButton = true,
    initialItemCount = 30,
    className,
    style,
    classNames,
    styles,
    children,
    ref,
  } = props;
  const locale = useLocale(props.locale) ?? 'en-US';
  const localeText = useLocaleText('conversation', props.localeText);
  const baseId = useId();
  const [messages, setMessages] = useControllableState<readonly ConversationMessage[], [{ readonly reason: ConversationChangeReason }]>(props.messages, () => props.defaultMessages ?? EMPTY, props.onMessagesChange, 'Conversation messages');
  const [store] = useState<ConversationStore>(() => {
    const s = createConversationStore(messages);
    s.setView(initialWindow(messages.length, initialItemCount));
    return s;
  });
  const [geometry] = useState<FeedGeometry>(() => ({ heights: new Map(), metrics: createVariableRowMetrics(0, () => 0), ids: EMPTY, anchor: null, stick: true, reveal: null, observer: null, frame: 0, lastTop: 0 }));
  const [instance] = useState<ConversationInstance>(() => createInstance(store, baseId, props, geometry));
  const loadingOlder = useSyncExternalStore(store.subscribe, () => store.getView().loadingOlder, () => false);
  const ids = useStore(store, store.getIds);

  if (DEV && variant !== 'chat' && variant !== 'assistant') warnOnce('conversation-variant', `Conversation: unknown variant "${String(variant)}".`);

  useLayoutEffect(() => {
    instance.props = props;
    instance.commitRaw = setMessages;
    instance.text = config.text;
  });

  const usersKey = users;
  const userMap = useMemo(() => new Map(usersKey.map((u) => [u.id, u])), [usersKey]);
  const config = useMemo<ConversationConfig>(
    () => ({
      currentUser,
      users: userMap,
      layout,
      timestamps,
      formatTimestamp,
      locale,
      timeZone,
      dateSeparators,
      renderDateSeparator,
      renderItem,
      renderAvatar,
      itemActions,
      assistant: variant === 'assistant',
      renderContent,
      renderPending,
      renderReasoning,
      renderTool,
      renderAttachment: props.renderAttachment,
      onAttachmentClick: props.onAttachmentClick,
      hasRetry: props.onRetry !== undefined,
      text: createText(localeText, locale),
    }),
    [currentUser, userMap, layout, timestamps, formatTimestamp, locale, timeZone, dateSeparators, renderDateSeparator, renderItem, renderAvatar, itemActions, variant, renderContent, renderPending, renderReasoning, renderTool, props.renderAttachment, props.onAttachmentClick, props.onRetry, localeText],
  );

  // Sync the message list into the store, then anchor, announce and count unread.
  useLayoutEffect(() => {
    const before = store.getIds().length;
    const view = store.getView();
    const diff = store.setMessages(messages);
    if (!diff.changed) return;
    if (diff.prepended > 0) store.setView({ first: view.first + diff.prepended, last: view.last + diff.prepended, focusIndex: view.focusIndex >= 0 ? view.focusIndex + diff.prepended : -1 });
    else if (view.last >= before) store.setView({ last: messages.length });
    if (diff.appended.length > 0 && before > 0) {
      const auto = instance.props.autoScroll ?? 'whenAtBottom';
      const own = diff.appended.some((id) => store.getMessage(id)?.author === currentUser);
      const stick = auto === 'always' || (auto !== 'never' && (own || store.getView().atBottom));
      geometry.stick = stick;
      const incoming = diff.appended.map((id) => store.getMessage(id)).filter((m): m is ConversationMessage => !!m && m.author !== currentUser && m.text !== '');
      if (!stick && incoming.length > 0) store.setView({ unread: store.getView().unread + incoming.length });
      const latest = incoming[incoming.length - 1];
      if (latest) instance.announce(config.text('newMessage', { author: userMap.get(latest.author)?.name ?? latest.author, text: latest.text }));
    }
    adjust(instance, geometry);
  }, [messages, store, instance, geometry, currentUser, config, userMap]);

  // Typing indicator changes are announced once each.
  const typingKey = typingUsers.join('\u0000');
  useEffect(() => {
    if (typingKey === '') return;
    instance.announce(typingText(config.text, typingKey.split('\u0000').map((id) => userMap.get(id)?.name ?? id)));
  }, [typingKey, instance, config, userMap]);

  useEffect(() => mountFeed(instance, geometry), [instance, geometry]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: (options) => instance.scrollToBottom(options?.behavior),
      scrollToMessage: (id, options) => instance.scrollToMessage(id, options?.focus ?? false),
      focus: () => instance.focusComposer(),
      send: (text) => void instance.send(text),
      stop: () => instance.stop(),
      regenerate: (id) => void loadAssistant().then((m) => m.regenerate(instance, id)),
      get element() {
        return instance.root;
      },
    }),
    [instance],
  );

  const start: ReactNode[] = [];
  const end: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && (child.type as { [SLOT]?: string })[SLOT] === 'start') start.push(child);
    else end.push(child);
  });

  const setSize = hasOlder ? -1 : ids.length;
  return (
    <ConversationInstanceContext value={instance}>
      <ConversationConfigContext value={config}>
        <div
          ref={(el) => {
            instance.root = el;
          }}
          className={join('salmon-conversation', className, classNames?.root)}
          style={styles?.root ? { ...styles.root, ...style } : style}
          data-variant={variant}
          data-layout={layout}
        >
          {start}
          <ConversationPinnedBar />
          <div
            ref={(el) => {
              instance.scroller = el;
            }}
            className={join('salmon-conversation-scroller', classNames?.scroller)}
            style={styles?.scroller}
          >
            <div className="salmon-conversation-content">
              {hasOlder ? (
                <div className="salmon-conversation-older" data-loading={loadingOlder ? '' : undefined}>
                  {loadingOlder ? (
                    <span className="salmon-conversation-skeleton" role="status">
                      <span className="salmon-conversation-sr">{config.text('loadingOlder')}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="salmon-conversation-spacer" data-edge="start" aria-hidden="true" />
              {ids.length === 0 && renderEmpty ? <div className="salmon-conversation-empty">{renderEmpty()}</div> : null}
              <Feed instance={instance} geometry={geometry} setSize={setSize} busy={loadingOlder} label={config.text('feedLabel')} />
              <div className="salmon-conversation-spacer" data-edge="end" aria-hidden="true" />
            </div>
          </div>
          <TypingIndicator users={typingUsers} config={config} render={renderTyping} />
          {jumpButton ? <ConversationJumpButton /> : null}
          {end}
          <div
            ref={(el) => {
              instance.live = el;
            }}
            className="salmon-conversation-sr"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          />
        </div>
      </ConversationConfigContext>
    </ConversationInstanceContext>
  );
}

function createInstance(store: ConversationStore, baseId: string, initialProps: ConversationProps, geometry: FeedGeometry): ConversationInstance {
  let controller: AbortController | null = null;
  let typing = false;
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let announceTimer: ReturnType<typeof setTimeout> | null = null;
  let generated = 0;
  const newId = (): string => {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    return c?.randomUUID ? c.randomUUID() : `${baseId}-${Date.now().toString(36)}-${(generated++).toString(36)}`;
  };
  /** Runs the adapter for response `id` and commits the result once; the assistant variant runs it in its chunk. */
  const respond = (history: readonly ConversationMessage[], text: string, attachments: readonly ConversationAttachment[], id: string): void => {
    const adapter = instance.props.adapter as NonNullable<ConversationProps['adapter']>;
    instance.stop();
    const own = new AbortController();
    controller = own;
    store.setView({ responding: true });
    const request = { messages: history, text, attachments };
    const run: Promise<RunOutcome> = instance.props.variant === 'assistant' ? loadAssistant().then((m) => m.run(adapter, request, id, store, own.signal, runAdapter)) : runAdapter(adapter, request, id, store, own.signal);
    void run.then((outcome) => {
      if (controller === own) {
        controller = null;
        store.setView({ responding: false });
      }
      const failed = outcome.status === 'error';
      if (failed) instance.props.onError?.(outcome.error);
      instance.commit((prev) => {
        const m = prev.find((x) => x.id === id);
        if (!m) return prev;
        const next = outcome.apply ? outcome.apply(m) : outcome.text === '' && !failed ? null : failed ? { ...m, text: outcome.text, status: 'error' as const } : { id, author: m.author, text: outcome.text, ...(m.createdAt !== undefined ? { createdAt: m.createdAt } : null) };
        return next ? prev.map((x) => (x === m ? next : x)) : prev.filter((x) => x !== m);
      }, 'response');
      if (outcome.status === 'done' && outcome.text !== '') {
        const author = store.getMessage(id)?.author ?? '';
        const name = instance.props.users?.find((u) => u.id === author)?.name ?? author;
        instance.announce(instance.text!('responseComplete', { author: name, text: outcome.text }));
      }
    });
  };
  const instance: ConversationInstance = {
    store,
    baseId,
    props: initialProps,
    root: null,
    scroller: null,
    composer: null,
    live: null,
    commitRaw: null,
    commit(update, reason) {
      instance.commitRaw?.(update, Object.freeze({ reason }));
    },
    send(text, options: SendOptions = {}) {
      const p = instance.props;
      const attachments = options.attachments ?? EMPTY;
      if (text.trim() === '' && attachments.length === 0) return false;
      const replyTo = store.getView().replyTo;
      const message: ConversationMessage = {
        id: newId(),
        author: p.currentUser ?? 'user',
        text,
        createdAt: new Date(),
        ...(replyTo ? { replyTo } : null),
        ...(options.mentions && options.mentions.length > 0 ? { mentions: options.mentions } : null),
        ...(attachments.length > 0 ? { attachments } : null),
      };
      if (p.onBeforeSend) {
        let prevented = false;
        const event = {
          message,
          preventDefault: () => {
            prevented = true;
          },
          get defaultPrevented() {
            return prevented;
          },
        };
        p.onBeforeSend(event);
        if (prevented) return false;
      }
      instance.stopTyping();
      geometry.stick = (p.autoScroll ?? 'whenAtBottom') !== 'never';
      store.setView({ replyTo: null, unread: 0 });
      const adapter = p.adapter;
      const responseId = adapter ? newId() : '';
      const author = p.adapterAuthor ?? 'assistant';
      let history: readonly ConversationMessage[] = [message];
      // One proposal for the message and the pending response, so a controlled parent sees both.
      instance.commit((prev) => {
        history = [...prev, message];
        return adapter ? [...history, { id: responseId, author, text: '', createdAt: new Date(), status: 'sending' }] : history;
      }, 'send');
      p.onSend?.(Object.freeze({ message }));
      if (adapter) respond(history, text, attachments, responseId);
      return true;
    },
    stop() {
      if (!controller) return;
      controller.abort();
      instance.props.onStop?.({ message: store.getMessage(store.getStream()?.id as string) });
    },
    respond,
    scrollToBottom(behavior) {
      const s = instance.scroller;
      geometry.stick = true;
      store.setView({ unread: 0 });
      const n = store.getIds().length;
      const view = store.getView();
      if (view.last < n) store.setView({ first: Math.max(0, n - (view.last - view.first)), last: n });
      if (s) {
        s.scrollTo({ top: 0, behavior: behavior ?? 'auto' });
        geometry.lastTop = s.scrollTop;
      }
      adjust(instance, geometry);
    },
    scrollToMessage(id, focus) {
      const index = store.indexOf(id);
      if (index < 0) return false;
      geometry.stick = false;
      geometry.reveal = { id, focus: focus ?? false };
      const view = store.getView();
      if (focus) store.setView({ focusIndex: index });
      if (index < view.first || index >= view.last) {
        const n = store.getIds().length;
        const size = Math.max(view.last - view.first, OVERSCAN * 2 + 1);
        const first = Math.max(0, Math.min(index - OVERSCAN, n - size));
        // No adjust before React mounts the new window: the old articles would size the
        // spacers wrong. The window subscription adjusts (and reveals) after the commit.
        store.setView({ first, last: Math.min(n, first + size) });
      } else adjust(instance, geometry);
      return true;
    },
    announce(text) {
      const live = instance.live;
      if (!live) return;
      // Clear first so a repeated text is announced again.
      live.textContent = '';
      if (announceTimer) clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        live.textContent = text;
      }, 50);
    },
    action(action, message) {
      const p = instance.props;
      let prevented = false;
      p.onItemActionClick?.({
        action,
        message,
        preventDefault: () => {
          prevented = true;
        },
        get defaultPrevented() {
          return prevented;
        },
      });
      if (prevented) return;
      if (action === 'copy') void (globalThis as { navigator?: { clipboard?: { writeText(text: string): Promise<void> } } }).navigator?.clipboard?.writeText(message.text).catch(() => {});
      else if (action === 'reply') {
        store.setView({ replyTo: message.id });
        instance.focusComposer();
      } else if (action === 'pin') instance.commit((prev) => prev.map((m) => (m.id === message.id ? { ...m, pinned: !m.pinned } : m)), 'pin');
      else if (action === 'delete') {
        if (store.getView().replyTo === message.id) store.setView({ replyTo: null });
        instance.commit((prev) => prev.filter((m) => m.id !== message.id), 'delete');
      }
    },
    focusComposer() {
      instance.composer?.focus();
    },
    typed() {
      const p = instance.props;
      if (!p.onTypingChange) return;
      if (!typing) {
        typing = true;
        p.onTypingChange(Object.freeze({ typing: true }));
      }
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => instance.stopTyping(), p.typingTimeout ?? 3000);
    },
    stopTyping() {
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = null;
      if (!typing) return;
      typing = false;
      instance.props.onTypingChange?.(Object.freeze({ typing: false }));
    },
  };
  return instance;
}

const rectTop = (el: Element): number => el.getBoundingClientRect().top;

/** Rebuilds the metrics when the id list changed, keeping measured heights by id. */
function syncMetrics(instance: ConversationInstance, geometry: FeedGeometry): void {
  const ids = instance.store.getIds();
  if (ids === geometry.ids) return;
  const estimate = instance.props.estimatedItemHeight ?? 64;
  geometry.ids = ids;
  geometry.metrics = createVariableRowMetrics(ids.length, (i) => geometry.heights.get(ids[i] as string) ?? estimate);
}

/**
 * Measures the mounted articles, sizes the spacers, restores the anchor (or
 * stays at the bottom), reveals a requested message and recomputes the
 * mounted window. Reads come before writes; runs in layout effects and
 * observer callbacks, never during render.
 */
function adjust(instance: ConversationInstance, geometry: FeedGeometry): void {
  const scroller = instance.scroller;
  if (!scroller) return;
  const store = instance.store;
  syncMetrics(instance, geometry);
  const metrics = geometry.metrics;
  const ids = geometry.ids;
  const view = store.getView();
  // Measure.
  const articles = scroller.querySelectorAll<HTMLElement>('article[data-index]');
  for (const a of articles) {
    const id = a.getAttribute('data-id') as string;
    const h = a.getBoundingClientRect().height;
    if (h > 0 && geometry.heights.get(id) !== h) {
      geometry.heights.set(id, h);
      const index = Number(a.getAttribute('data-index'));
      if (ids[index] === id) metrics.setHeight(index, h);
    }
    geometry.observer?.observe(a);
  }
  // Spacers stand in for the unmounted items.
  const startSpacer = scroller.querySelector<HTMLElement>('[data-edge="start"]');
  const endSpacer = scroller.querySelector<HTMLElement>('[data-edge="end"]');
  const first = Math.min(view.first, ids.length);
  const last = Math.min(view.last, ids.length);
  if (startSpacer) startSpacer.style.height = `${metrics.offsetOf(first)}px`;
  if (endSpacer) endSpacer.style.height = `${Math.max(0, metrics.totalHeight - metrics.offsetOf(last))}px`;
  // Position. A scroll since the last write or observation wins over a pending stick.
  if (scroller.scrollTop !== geometry.lastTop) {
    geometry.stick = -scroller.scrollTop <= BOTTOM_SLACK;
    geometry.anchor = null;
  }
  const top = rectTop(scroller);
  const reveal = geometry.reveal;
  const revealEl = reveal ? scroller.querySelector<HTMLElement>(`article[data-id="${cssEscape(reveal.id)}"]`) : null;
  if (reveal && revealEl) {
    geometry.reveal = null;
    revealEl.scrollIntoView({ block: 'nearest' });
    if (reveal.focus) revealEl.focus({ preventScroll: true });
  } else if (geometry.stick) {
    scroller.scrollTop = 0;
  } else if (geometry.anchor) {
    const el = scroller.querySelector(`article[data-id="${cssEscape(geometry.anchor.id)}"]`);
    if (el) {
      const delta = rectTop(el) - top - geometry.anchor.top;
      if (Math.abs(delta) >= 0.5) scroller.scrollTop += delta;
    }
  }
  geometry.lastTop = scroller.scrollTop;
  updateWindow(instance, geometry);
}

const cssEscape = (value: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&'));

/** Recomputes the at-bottom flag, the anchor and the mounted window from the scroll position. */
function updateWindow(instance: ConversationInstance, geometry: FeedGeometry): void {
  const scroller = instance.scroller;
  if (!scroller) return;
  const store = instance.store;
  const startSpacer = scroller.querySelector<HTMLElement>('[data-edge="start"]');
  if (!startSpacer) return;
  const sRect = scroller.getBoundingClientRect();
  const distance = Math.max(0, -scroller.scrollTop);
  const atBottom = distance <= BOTTOM_SLACK;
  // Anchor: the first article whose bottom is below the scroller's top edge.
  let anchor: FeedGeometry['anchor'] = null;
  for (const a of scroller.querySelectorAll<HTMLElement>('article[data-index]')) {
    const r = a.getBoundingClientRect();
    if (r.bottom > sRect.top) {
      anchor = { id: a.getAttribute('data-id') as string, top: r.top - sRect.top };
      break;
    }
  }
  geometry.anchor = anchor;
  const y = sRect.top - startSpacer.getBoundingClientRect().top;
  const range = computeRange(geometry.metrics, y, scroller.clientHeight || 1, OVERSCAN);
  const view = store.getView();
  const n = geometry.ids.length;
  const slack = OVERSCAN >> 1;
  const keep = view.last - view.first > 0 && range.start >= view.first + (view.first > 0 ? slack : 0) && range.end <= view.last - (view.last < n ? slack : 0) && view.last <= n;
  store.setView({ atBottom, ...(atBottom ? { unread: 0 } : null), ...(keep ? null : { first: range.overscanStart, last: range.overscanEnd }) });
  if (!atBottom) geometry.stick = false;
  // Load older history when the top is within one viewport.
  const p = instance.props;
  if (p.hasOlder && p.onLoadOlder && !view.loadingOlder && y < scroller.clientHeight) {
    const result = p.onLoadOlder();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      store.setView({ loadingOlder: true });
      void Promise.resolve(result)
        .catch((error: unknown) => p.onError?.(error))
        .finally(() => store.setView({ loadingOlder: false }));
    }
  }
}

/** Scroll and resize listeners of the feed (client only). */
function mountFeed(instance: ConversationInstance, geometry: FeedGeometry): () => void {
  const scroller = instance.scroller;
  if (!scroller) return () => {};
  const win = scroller.ownerDocument.defaultView;
  const schedule = (): void => {
    if (geometry.frame || !win) return;
    geometry.frame = win.requestAnimationFrame(() => {
      geometry.frame = 0;
      adjust(instance, geometry);
    });
  };
  const onScroll = (): void => {
    // A user scroll away from the bottom wins over a pending stick-to-bottom adjust.
    geometry.stick = -scroller.scrollTop <= BOTTOM_SLACK;
    geometry.lastTop = scroller.scrollTop;
    // The anchor is re-read after the scroll, never restored to its pre-scroll place.
    geometry.anchor = null;
    if (geometry.frame || !win) return;
    geometry.frame = win.requestAnimationFrame(() => {
      geometry.frame = 0;
      updateWindow(instance, geometry);
    });
  };
  if (typeof ResizeObserver !== 'undefined') {
    geometry.observer = new ResizeObserver(schedule);
    geometry.observer.observe(scroller);
  }
  scroller.addEventListener('scroll', onScroll, { passive: true });
  // A scroll of the server HTML before hydration is kept.
  geometry.stick = -scroller.scrollTop <= BOTTOM_SLACK;
  geometry.lastTop = scroller.scrollTop;
  // Re-adjust whenever the mounted window changes.
  let last = instance.store.getView();
  const unsubscribe = instance.store.subscribe(() => {
    const v = instance.store.getView();
    if (v.first !== last.first || v.last !== last.last) queueMicrotask(() => adjust(instance, geometry));
    last = v;
  });
  adjust(instance, geometry);
  return () => {
    scroller.removeEventListener('scroll', onScroll);
    geometry.observer?.disconnect();
    geometry.observer = null;
    if (geometry.frame && win) win.cancelAnimationFrame(geometry.frame);
    geometry.frame = 0;
    unsubscribe();
    instance.stop();
    instance.stopTyping();
    instance.store.dispose();
  };
}
