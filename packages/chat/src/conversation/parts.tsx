'use client';

// Conversation parts: Header, pinned bar, Suggestions, Composer, JumpButton and Footer. The
// composer's draft lives in the native <textarea> (uncontrolled by
// default); Mention is the Dropdowns component, loaded lazily on the client
// only when `mentions` is set (a composition edge to `@salmonui/dropdowns/mention`).

import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { MentionProps } from '@salmonui/dropdowns/mention';
import { assistantSlot, attachmentLabel, icon } from './Item.js';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { join, toolbarKeyDown, useConversation, useStore } from './context.js';
import type {
  ConversationDictationProps,
  ConversationAttachment,
  ConversationAttachmentOptions,
  ConversationComposerProps,
  ConversationFooterProps,
  ConversationHeaderProps,
  ConversationJumpButtonProps,
  ConversationMentionUser,
  ConversationSuggestionsProps,
} from './types.js';

/** Static marker: parts rendered before the feed. */
export const SLOT = 'salmonConversationSlot';


/** Microphone button of the composer, from the assistant chunk; disabled until recognition is available. */
export function ConversationDictation(props: ConversationDictationProps): ReactNode {
  return assistantSlot('Dictation', props);
}

// The Mention family's public entry, as a client-only lazy chunk.
const LazyMention = lazy(() => import('@salmonui/dropdowns/mention').then((m) => ({ default: m.Mention }))) as unknown as <T>(props: MentionProps<T>) => ReactNode;

export function ConversationHeader({ title, icon, children, toolbarLabel, className, style }: ConversationHeaderProps): ReactNode {
  const { instance } = useConversation('Conversation.Header');
  const toolbar = useRef<HTMLDivElement | null>(null);
  const titleId = `${instance.baseId}-title`;
  // One tab stop in the toolbar: the first item (DOM attributes, the items are application elements).
  useEffect(() => {
    const el = toolbar.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [role="button"]')];
    items.forEach((item, i) => {
      item.tabIndex = i === 0 ? 0 : -1;
    });
  });
  return (
    <div className={join('salmon-conversation-header', className)} style={style}>
      {icon !== undefined ? (
        <span className="salmon-conversation-header__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {title !== undefined ? (
        <div id={titleId} className="salmon-conversation-header__title">
          {title}
        </div>
      ) : null}
      {children !== undefined ? (
        <div ref={toolbar} role="toolbar" className="salmon-conversation-header__toolbar" {...(toolbarLabel ? { 'aria-label': toolbarLabel } : title !== undefined ? { 'aria-labelledby': titleId } : null)} onKeyDown={toolbarKeyDown}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
(ConversationHeader as unknown as Record<string, string>)[SLOT] = 'start';

/** The latest pinned message with a jump to it. */
export function ConversationPinnedBar(): ReactNode {
  const { instance, config } = useConversation('Conversation');
  const store = instance.store;
  const pinned = useStore(store, () => findPinned(store.getMessages()));
  if (!pinned) return null;
  const name = config.users.get(pinned.author)?.name ?? pinned.author;
  return (
    <div className="salmon-conversation-pinned-bar">
      <button type="button" className="salmon-conversation-pinned-bar__button" onClick={() => instance.scrollToMessage(pinned.id, true)}>
        <span className="salmon-conversation-pinned-bar__label">{config.text('pinned')}</span>
        <span className="salmon-conversation-pinned-bar__author">{name}</span>
        <span className="salmon-conversation-pinned-bar__text" dir="auto">
          {pinned.text}
        </span>
      </button>
    </div>
  );
}

function findPinned<T extends { readonly pinned?: boolean }>(messages: readonly T[]): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.pinned) return messages[i];
  return undefined;
}

/** Quick replies: a labelled group of buttons, each sends its text. */
export function ConversationSuggestions({ items, heading, renderItem, className, style }: ConversationSuggestionsProps): ReactNode {
  const { instance, config } = useConversation('Conversation.Suggestions');
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <div role="group" className={join('salmon-conversation-suggestions', className)} style={style} {...(heading !== undefined ? { 'aria-labelledby': headingId } : { 'aria-label': config.text('suggestionsLabel') })}>
      {heading !== undefined ? (
        <div id={headingId} className="salmon-conversation-suggestions__heading">
          {heading}
        </div>
      ) : null}
      {items.map((item, index) => (
        <button key={`${index}:${item}`} type="button" className="salmon-conversation-suggestion" onClick={() => instance.send(item)}>
          {renderItem ? renderItem({ item, index }) : item}
        </button>
      ))}
    </div>
  );
}

/** Jump to the latest message, with the unread count. Hidden at the bottom. */
export function ConversationJumpButton({ children, className, style }: ConversationJumpButtonProps): ReactNode {
  const { instance, config } = useConversation('Conversation.JumpButton');
  const store = instance.store;
  const atBottom = useSyncExternalStore(store.subscribe, () => store.getView().atBottom, () => true);
  const unread = useSyncExternalStore(store.subscribe, () => store.getView().unread, () => 0);
  if (atBottom) return null;
  const label = unread > 0 ? `${config.text('jumpToLatest')}, ${config.text('unread', { count: unread })}` : config.text('jumpToLatest');
  return (
    <button type="button" className={join('salmon-conversation-jump', className)} style={style} aria-label={label} onClick={() => instance.scrollToBottom('smooth')}>
      {children ?? icon('jump')}
      {unread > 0 ? (
        <span className="salmon-conversation-jump__count" aria-hidden="true">
          {unread}
        </span>
      ) : null}
    </button>
  );
}

export function ConversationFooter({ children, className, style }: ConversationFooterProps): ReactNode {
  return (
    <div className={join('salmon-conversation-footer', className)} style={style}>
      {children}
    </div>
  );
}

interface PendingAttachment {
  readonly attachment: ConversationAttachment;
  readonly progress: number | null;
  readonly error: unknown;
  readonly uploading: boolean;
}

const matchesAccept = (file: File, accept: string | undefined): boolean => {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.split(',').some((raw) => {
    const a = raw.trim().toLowerCase();
    if (a === '') return false;
    if (a.startsWith('.')) return name.endsWith(a);
    if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
};

export function ConversationComposer(props: ConversationComposerProps): ReactNode {
  const { placeholder, value, defaultValue, disabled = false, clearable, rows = 1, mentions, toolbar, className, style } = props;
  const { instance, config } = useConversation('Conversation.Composer');
  const store = instance.store;
  const hydrated = useHydrated();
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  const mentioned = useRef(new Map<string, string>());
  const uploads = useRef(new Map<string, AbortController>());
  const [pending, setPending] = useState<readonly PendingAttachment[]>([]);
  const pendingRef = useRef(pending);
  const replyTo = useSyncExternalStore(store.subscribe, () => store.getView().replyTo, () => null);
  // `replyTo` is null on the server, so the one getter serves both snapshots.
  const replyTarget = useStore(store, () => (replyTo ? store.getMessage(replyTo) : undefined));
  const responding = useSyncExternalStore(store.subscribe, () => store.getView().responding, () => false);
  const options: ConversationAttachmentOptions | null = props.attachments === true ? {} : props.attachments || null;
  const t = config.text;
  const inputId = useId();
  useLayoutEffect(() => {
    propsRef.current = props;
    pendingRef.current = pending;
  });
  // `data-empty` on the composer root hides the clear button.
  const markEmpty = (value: string): void => void root.current?.toggleAttribute('data-empty', value.trim() === '');
  useEffect(() => {
    const el = textarea.current;
    instance.composer = el;
    if (el) markEmpty(el.value);
    return () => {
      if (instance.composer === el) instance.composer = null;
    };
  }, [instance]);
  useEffect(() => {
    const map = uploads.current;
    return () => {
      for (const c of map.values()) c.abort();
    };
  }, []);

  const setDraft = (next: string): void => {
    const el = textarea.current;
    if (!el) return;
    if (propsRef.current.value === undefined) el.value = next;
    propsRef.current.onValueChange?.(next);
    markEmpty(next);
  };

  const send = (): void => {
    const el = textarea.current;
    if (!el || disabled) return;
    const current = pendingRef.current;
    if (current.some((p) => p.uploading)) return;
    const text = propsRef.current.value ?? el.value;
    const ids = [...mentioned.current].filter(([, label]) => text.includes(label)).map(([id]) => id);
    const sent = instance.send(text, { attachments: current.filter((p) => !p.error).map((p) => p.attachment), mentions: ids });
    if (!sent) return;
    mentioned.current.clear();
    setPending([]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.defaultPrevented) return; // the mention list consumed the key
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      send();
    } else if (event.key === 'Escape' && store.getView().replyTo) {
      event.preventDefault();
      store.setView({ replyTo: null });
    }
  };

  const onInput = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const next = event.currentTarget.value;
    markEmpty(next);
    propsRef.current.onValueChange?.(next);
    instance.typed();
  };

  const addFiles = (files: readonly File[]): void => {
    if (!options || files.length === 0) return;
    const p = propsRef.current;
    let prevented = false;
    p.onBeforeAttach?.({
      files,
      preventDefault: () => {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    });
    if (prevented) return;
    const accepted: ConversationAttachment[] = [];
    let count = pendingRef.current.length;
    for (const file of files) {
      const reason = !matchesAccept(file, options.accept) ? 'type' : options.maxSize !== undefined && file.size > options.maxSize ? 'size' : options.maxCount !== undefined && count >= options.maxCount ? 'count' : null;
      if (reason) {
        p.onAttachmentError?.(Object.freeze({ file, reason }));
        continue;
      }
      count++;
      accepted.push({ id: `${instance.baseId}-a-${Date.now().toString(36)}-${count}`, name: file.name, size: file.size, type: file.type, file });
    }
    if (accepted.length === 0) return;
    const upload = options.upload;
    setPending((prev) => [...prev, ...accepted.map((attachment) => ({ attachment, progress: upload ? 0 : null, error: null, uploading: !!upload }))]);
    p.onAttach?.(Object.freeze({ attachments: accepted }));
    if (!upload) return;
    for (const attachment of accepted) {
      const controller = new AbortController();
      uploads.current.set(attachment.id, controller);
      const update = (patch: Partial<PendingAttachment>): void => setPending((prev) => prev.map((x) => (x.attachment.id === attachment.id ? { ...x, ...patch } : x)));
      upload(attachment.file as File, {
        signal: controller.signal,
        onProgress: (loaded, total) => {
          if (!controller.signal.aborted) update({ progress: total > 0 ? loaded / total : null });
        },
      }).then(
        (stored) => {
          uploads.current.delete(attachment.id);
          if (controller.signal.aborted) return;
          const { file: _file, ...rest } = attachment;
          update({ attachment: { ...rest, ...(stored ?? null) }, progress: 1, uploading: false });
        },
        (error: unknown) => {
          uploads.current.delete(attachment.id);
          if (controller.signal.aborted) return;
          update({ error, uploading: false });
          propsRef.current.onAttachmentError?.(Object.freeze({ file: attachment.file as File, reason: 'upload', error }));
        },
      );
    }
  };

  const remove = (attachment: ConversationAttachment): void => {
    uploads.current.get(attachment.id)?.abort();
    uploads.current.delete(attachment.id);
    setPending((prev) => prev.filter((x) => x.attachment.id !== attachment.id));
    propsRef.current.onAttachmentRemove?.(Object.freeze({ attachment, message: null }));
  };

  const dropTarget = options?.dropTarget ?? 'composer';
  const dragHandlers =
    options && dropTarget === 'composer'
      ? {
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.currentTarget.setAttribute('data-dragging', '');
          },
          onDragLeave: (event: DragEvent<HTMLDivElement>) => event.currentTarget.removeAttribute('data-dragging'),
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            event.currentTarget.removeAttribute('data-dragging');
            if (event.dataTransfer.files.length === 0) return;
            event.preventDefault();
            addFiles([...event.dataTransfer.files]);
          },
        }
      : null;
  // `dropTarget: 'conversation'`: the whole root accepts files (DOM listeners, client only).
  useEffect(() => {
    const host = instance.root;
    if (!host || !options || dropTarget !== 'conversation') return;
    const over = (event: globalThis.DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      host.setAttribute('data-dragging', '');
    };
    const leave = (): void => host.removeAttribute('data-dragging');
    const drop = (event: globalThis.DragEvent): void => {
      leave();
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      addFiles([...files]);
    };
    host.addEventListener('dragover', over);
    host.addEventListener('dragleave', leave);
    host.addEventListener('drop', drop);
    return () => {
      host.removeEventListener('dragover', over);
      host.removeEventListener('dragleave', leave);
      host.removeEventListener('drop', drop);
    };
  });

  const triggers = mentions?.map((m) => ({ char: m.trigger ?? '@', data: m.items, keepChar: true, suffix: ' ' }));
  const replyName = replyTarget ? (config.users.get(replyTarget.author)?.name ?? replyTarget.author) : '';

  return (
    <div ref={root} className={join('salmon-conversation-composer', className)} style={style} data-disabled={disabled ? '' : undefined} {...dragHandlers}>
      {replyTarget ? (
        <div className="salmon-conversation-composer__reply">
          <span className="salmon-conversation-composer__reply-label">{t('replyingTo', { author: replyName })}</span>
          <span className="salmon-conversation-composer__reply-text" dir="auto">
            {replyTarget.text}
          </span>
          <button type="button" className="salmon-conversation-composer__reply-cancel" aria-label={t('cancelReply')} onClick={() => store.setView({ replyTo: null })}>
            {icon('close')}
          </button>
        </div>
      ) : null}
      {pending.length > 0 ? (
        <div className="salmon-conversation-composer__attachments">
          {pending.map(({ attachment: a, progress, error, uploading }) =>
            options?.renderPreview ? (
              <span key={a.id}>{options.renderPreview({ attachment: a, progress, error, remove: () => remove(a) })}</span>
            ) : (
              <span key={a.id} className="salmon-conversation-attachment" data-uploading={uploading ? '' : undefined} data-error={error ? '' : undefined}>
                <button type="button" className="salmon-conversation-attachment__open" onClick={() => instance.props.onAttachmentClick?.(Object.freeze({ attachment: a, message: null }))}>
                  {attachmentLabel(a, config.locale)}
                </button>
                {uploading && progress !== null ? <progress className="salmon-conversation-attachment__progress" max={1} value={progress} aria-label={a.name} /> : null}
                <button type="button" className="salmon-conversation-attachment__remove" aria-label={t('removeAttachment', { name: a.name })} onClick={() => remove(a)}>
                  {icon('close')}
                </button>
              </span>
            ),
          )}
        </div>
      ) : null}
      <div className="salmon-conversation-composer__row">
        {options ? (
          <>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple={options.maxCount !== 1}
              {...(options.accept ? { accept: options.accept } : null)}
              onChange={(event) => {
                addFiles([...(event.currentTarget.files ?? [])]);
                event.currentTarget.value = '';
              }}
            />
            <button type="button" className="salmon-conversation-composer__attach" aria-label={t('attach')} disabled={disabled} onClick={() => fileInput.current?.click()}>
              {icon('attach')}
            </button>
          </>
        ) : null}
        <textarea
          ref={textarea}
          id={inputId}
          className="salmon-conversation-composer__input"
          aria-label={t('composerLabel')}
          aria-multiline="true"
          placeholder={placeholder ?? t('placeholder')}
          rows={rows}
          disabled={disabled}
          dir="auto"
          {...(value !== undefined ? { value } : { defaultValue })}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onBlur={() => instance.stopTyping()}
        />
        {clearable
          ? assistantSlot('ClearButton', {
              disabled,
              clear: () => {
                setDraft('');
                textarea.current?.focus();
              },
            })
          : null}
        {toolbar}
        {responding && instance.props.adapter ? (
          <button type="button" className="salmon-conversation-composer__stop" aria-label={t('stop')} onClick={() => (instance.stop(), instance.focusComposer())}>
            {icon('stop')}
          </button>
        ) : (
          <button type="button" className="salmon-conversation-composer__send" aria-label={t('send')} disabled={disabled} onClick={send}>
            {icon('send')}
          </button>
        )}
      </div>
      {hydrated && triggers && triggers.length > 0 ? (
        <Suspense fallback={null}>
          <LazyMention<ConversationMentionUser>
            target={textarea}
            triggers={triggers}
            getItemLabel={(u) => u.name}
            getItemValue={(u) => u.id}
            onBeforeInsert={(event) => {
              const p = propsRef.current;
              if (!p.onBeforeMentionSelect) return;
              p.onBeforeMentionSelect({
                user: event.item,
                trigger: event.trigger,
                preventDefault: () => event.preventDefault(),
                get defaultPrevented() {
                  return event.defaultPrevented;
                },
              });
            }}
            onInsert={(event) => {
              mentioned.current.set(event.item.id, event.text.trim());
              propsRef.current.onMentionSelect?.(Object.freeze({ user: event.item, trigger: event.trigger }));
              // The Mention inserted through the native input path; mirror it to a controlled owner.
              const el = textarea.current;
              if (el) {
                markEmpty(el.value);
                if (propsRef.current.value !== undefined) propsRef.current.onValueChange?.(el.value);
              }
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
