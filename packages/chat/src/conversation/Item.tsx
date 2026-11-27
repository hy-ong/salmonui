'use client';

// Feed articles and the default item content. Each article reads its
// own record from the store, so a new `messages` array re-renders only the
// changed items. Text is always rendered as text nodes, never as HTML.

import { readAssistant } from '#conversation-assistant';
import { formatMessage } from '@salmonui/core/internal/dates/index';
import { memo, Suspense, use, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { ConversationConfigContext, ItemTabbableContext, join, toolbarKeyDown, useConversation, useStore, type ConversationConfig } from './context.js';
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT, dateFormatter, formatSize, initials, mentionSegments, messageDate, startsNewDay } from './format.js';
import type { ConversationStore } from './store.js';
import type { ConversationActionItem, ConversationAttachment, ConversationItemActionsProps, ConversationItemProps, ConversationMessage, ConversationUser } from './types.js';

export const DEFAULT_ITEM_ACTIONS: readonly ConversationActionItem[] = Object.freeze(['copy', 'reply', 'pin', 'delete'] as const);


/** Only URLs that cannot run script are rendered as links. */
const SAFE_URL = /^(?:https?:|blob:|mailto:|\/(?!\/)|\.\.?\/)/iu;

function formatDate(config: ConversationConfig, date: Date, hydrated: boolean, options: Intl.DateTimeFormatOptions): string {
  // Without an explicit zone the server and the hydration render use UTC, then the host zone.
  const timeZone = config.timeZone ?? (hydrated ? undefined : 'UTC');
  const custom = config.formatTimestamp;
  if (typeof custom === 'function' && options === DEFAULT_TIME_FORMAT) return custom(date, { locale: config.locale, timeZone });
  const resolved = options === DEFAULT_TIME_FORMAT && custom && typeof custom === 'object' ? custom : options;
  return dateFormatter(config.locale, timeZone, resolved).format(date);
}

/** A decorative icon span (`data-icon` selects the glyph in the stylesheet). */
export const icon = (name: string): ReactNode => <span className="salmon-conversation-icon" data-icon={name} aria-hidden="true" />;

/** `'live'` while message `id` streams, `'done'` after its stream ended, else `'none'`. */
function useStreaming(store: ConversationStore, id: string): 'live' | 'done' | 'none' {
  return useSyncExternalStore(
    store.subscribeStream,
    () => {
      const s = store.getStream();
      return s === null || s.id !== id ? 'none' : s.done ? 'done' : 'live';
    },
    () => 'none',
  );
}

/**
 * Streamed text: appended to text nodes on each flushed frame, outside
 * React (zero commits while streaming). Unmounted once the final message
 * is committed.
 */
function StreamText({ store, id }: { readonly store: ConversationStore; readonly id: string }): ReactNode {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let rendered = 0;
    const paint = (): void => {
      const s = store.getStream();
      if (!s || s.id !== id) return;
      if (s.text.length < rendered) {
        el.textContent = '';
        rendered = 0;
      }
      if (s.text.length > rendered) {
        el.append(el.ownerDocument.createTextNode(s.text.slice(rendered)));
        rendered = s.text.length;
      }
    };
    paint();
    return store.subscribeStream(paint);
  }, [store, id]);
  return <span ref={ref} className="salmon-conversation-stream" />;
}

function Avatar({ user, id, config }: { readonly user: ConversationUser | undefined; readonly id: string; readonly config: ConversationConfig }): ReactNode {
  if (config.renderAvatar) return <span className="salmon-conversation-avatar">{config.renderAvatar({ user, id })}</span>;
  const avatar = user?.avatar;
  return (
    <span className="salmon-conversation-avatar" aria-hidden="true">
      {typeof avatar === 'string' ? <img src={avatar} alt="" /> : avatar !== undefined && avatar !== null ? avatar : <span className="salmon-conversation-avatar__initials">{initials(user?.name ?? id)}</span>}
      {user?.status !== undefined ? <span className="salmon-conversation-avatar__status">{user.status}</span> : null}
    </span>
  );
}

/** Name and size of an attachment chip (sent and pending). */
export function attachmentLabel(attachment: ConversationAttachment, locale: string): ReactNode {
  return (
    <>
      <span className="salmon-conversation-attachment__name">{attachment.name}</span>
      {attachment.size !== undefined ? <span className="salmon-conversation-attachment__size">{formatSize(attachment.size, locale)}</span> : null}
    </>
  );
}

function AttachmentChip({ attachment, message, tabbable, config }: { readonly attachment: ConversationAttachment; readonly message: ConversationMessage; readonly tabbable: boolean; readonly config: ConversationConfig }): ReactNode {
  const tabIndex = tabbable ? 0 : -1;
  if (config.renderAttachment) return config.renderAttachment({ attachment, message, tabIndex });
  const label = attachmentLabel(attachment, config.locale);
  if (!config.onAttachmentClick && attachment.url && SAFE_URL.test(attachment.url)) {
    return (
      <a className="salmon-conversation-attachment" href={attachment.url} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" className="salmon-conversation-attachment" tabIndex={tabIndex} onClick={() => config.onAttachmentClick?.(Object.freeze({ attachment, message }))}>
      {label}
    </button>
  );
}

/** Message actions toolbar: APG Toolbar keys, visible on hover and focus within the item. */
export function ConversationItemActions({ message, items, className }: ConversationItemActionsProps): ReactNode {
  const { instance, config } = useConversation('Conversation.ItemActions');
  const tabbable = use(ItemTabbableContext);
  const list = items ?? (Array.isArray(config.itemActions) ? (config.itemActions as readonly ConversationActionItem[]) : DEFAULT_ITEM_ACTIONS);
  const t = config.text;
  return (
    <div role="toolbar" aria-label={t('messageActions')} className={join('salmon-conversation-item-actions', className)} onKeyDown={toolbarKeyDown}>
      {list.map((item, i) => {
        const id = typeof item === 'string' ? item : item.id;
        const label = typeof item === 'string' ? (item === 'pin' && message.pinned ? t('unpin') : t(item as 'copy')) : item.label;
        return (
          <button key={id} type="button" className="salmon-conversation-item-action" data-action={id} aria-label={label} title={label} tabIndex={tabbable && i === 0 ? 0 : -1} onClick={() => instance.action(id, message)}>
            {typeof item === 'string' ? icon(item) : (item.icon ?? label)}
          </button>
        );
      })}
    </div>
  );
}

/** What the assistant chunk uses from the initial chunk (handed over, so the chunk has no static edge back). */
const KIT = { useConversation, ItemTabbableContext, Avatar, AttachmentChip, StreamText, useStreaming, formatDate, join, mentionSegments, messageDate, DEFAULT_TIME_FORMAT, formatMessage, toolbarKeyDown, icon };
export type AssistantKit = typeof KIT;

function AssistantGate({ name, props }: { readonly name: 'AssistantItem' | 'Dictation' | 'ClearButton'; readonly props: object }): ReactNode {
  const got = readAssistant();
  const C = (got instanceof Promise ? use(got) : got)[name] as (p: { readonly kit: AssistantKit }) => ReactNode;
  return <C {...props} kit={KIT} />;
}

/** A component of the assistant chunk (suspends in the browser while the chunk loads; static on the server). */
export const assistantSlot = (name: 'AssistantItem' | 'Dictation' | 'ClearButton', props: object): ReactNode => (
  <Suspense fallback={null}>
    <AssistantGate name={name} props={props} />
  </Suspense>
);

/** Default content of a feed item; use it in `renderItem` to decorate items. */
export function ConversationItem(props: ConversationItemProps): ReactNode {
  return use(ConversationConfigContext)?.assistant ? assistantSlot('AssistantItem', props) : <ChatItem {...props} />;
}

function ChatItem({ message, children, className, style }: ConversationItemProps): ReactNode {
  const { instance, config } = useConversation('Conversation.Item');
  const tabbable = use(ItemTabbableContext);
  const hydrated = useHydrated();
  const store = instance.store;
  const streaming = useStreaming(store, message.id);
  const replyTarget = useStore(store, () => (message.replyTo ? store.getMessage(message.replyTo) : undefined));
  const t = config.text;
  const own = message.author === config.currentUser;
  const user = config.users.get(message.author);
  const name = user?.name ?? message.author;
  const date = messageDate(message);
  const idBase = `${instance.baseId}-m-${message.id}`;
  const showStream = streaming === 'live' || (streaming === 'done' && message.text === '');
  const preview = replyTarget ? { author: config.users.get(replyTarget.author)?.name ?? replyTarget.author, text: replyTarget.text } : message.replyPreview;
  const body =
    children ??
    (showStream ? (
      <StreamText store={store} id={message.id} />
    ) : (
      mentionSegments(message.text, message.mentions, (id) => config.users.get(id)).map((seg, i) =>
        seg.mention ? (
          <span key={i} className="salmon-conversation-mention" data-user={seg.mention}>
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )
    ));
  return (
    <div
      className={join('salmon-conversation-item', className)}
      style={style}
      data-own={own ? '' : undefined}
      data-author={message.author}
      data-status={message.status}
      data-pinned={message.pinned ? '' : undefined}
    >
      <Avatar user={user} id={message.author} config={config} />
      <div className="salmon-conversation-item__body">
        <div className="salmon-conversation-item__meta">
          <span id={`${idBase}-author`} className="salmon-conversation-item__author">
            {name}
          </span>
          {config.timestamps && date ? (
            <time id={`${idBase}-time`} className="salmon-conversation-item__time" dateTime={date.toISOString()}>
              {formatDate(config, date, hydrated, DEFAULT_TIME_FORMAT)}
            </time>
          ) : null}
          {message.pinned ? <span className="salmon-conversation-item__pinned">{t('pinned')}</span> : null}
        </div>
        {message.forwarded ? <div className="salmon-conversation-item__forwarded">{t('forwarded')}</div> : null}
        {preview ? (
          <button type="button" className="salmon-conversation-reply-preview" tabIndex={tabbable ? 0 : -1} disabled={!replyTarget} onClick={() => message.replyTo && instance.scrollToMessage(message.replyTo, true)}>
            <span className="salmon-conversation-reply-preview__author">{preview.author}</span>
            <span className="salmon-conversation-reply-preview__text">{preview.text}</span>
          </button>
        ) : null}
        <div className="salmon-conversation-item__bubble" dir="auto">
          {body}
        </div>
        {message.attachments && message.attachments.length > 0 ? (
          <div className="salmon-conversation-item__attachments">
            {message.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} message={message} tabbable={tabbable} config={config} />
            ))}
          </div>
        ) : null}
        {own && message.status ? (
          <div className="salmon-conversation-item__status" data-status={message.status}>
            {icon(`status-${message.status}`)}
            <span className="salmon-conversation-sr">{t(`status_${message.status}`)}</span>
            {message.status === 'error' && config.hasRetry ? (
              <button type="button" className="salmon-conversation-retry" tabIndex={tabbable ? 0 : -1} onClick={() => instance.props.onRetry?.(Object.freeze({ message }))}>
                {t('retry')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {config.itemActions !== false && !showStream ? <ConversationItemActions message={message} /> : null}
    </div>
  );
}

export interface FeedItemProps {
  readonly id: string;
  readonly index: number;
  readonly setSize: number;
}

/** One `role="article"` of the feed (APG Feed). */
export const FeedItem = memo(function FeedItem({ id, index, setSize }: FeedItemProps): ReactNode {
  const { instance } = useConversation('Conversation');
  const config = use(ConversationConfigContext) as ConversationConfig;
  const store = instance.store;
  const message = useStore(store, () => store.getMessage(id));
  const previous = useStore(store, () => store.getMessage(store.getIds()[index - 1] ?? ''));
  const tabbable = useSyncExternalStore(
    store.subscribe,
    () => {
      const f = store.getView().focusIndex;
      return f === index || (f < 0 && index === store.getIds().length - 1);
    },
    () => index === store.getIds().length - 1,
  );
  const streaming = useStreaming(store, id);
  const hydrated = useHydrated();
  if (!message) return null;
  const idBase = `${instance.baseId}-m-${message.id}`;
  const date = messageDate(message);
  const separator = config.dateSeparators && date && startsNewDay(message, previous, config.timeZone ?? (hydrated ? undefined : 'UTC'));
  const defaultItem = <ConversationItem message={message} />;
  const label = separator && date ? formatDate(config, date, hydrated, DEFAULT_DATE_FORMAT) : '';
  return (
    <article
      className="salmon-conversation-article"
      data-id={id}
      data-index={index}
      aria-posinset={index + 1}
      aria-setsize={setSize}
      aria-labelledby={`${idBase}-author${config.timestamps && date ? ` ${idBase}-time` : ''}`}
      aria-busy={streaming === 'live' ? true : undefined}
      tabIndex={tabbable ? 0 : -1}
    >
      {separator && date ? (
        <div className="salmon-conversation-date-separator">{config.renderDateSeparator ? config.renderDateSeparator({ date, label }) : <span>{label}</span>}</div>
      ) : null}
      <ItemTabbableContext value={tabbable}>{config.renderItem ? config.renderItem({ message, index, defaultItem }) : defaultItem}</ItemTabbableContext>
    </article>
  );
});
