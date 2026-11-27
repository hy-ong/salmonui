'use client';

// Mention over a <textarea> or <input>. The field stays the user's element: listeners and
// the combobox ARIA attributes are attached to it in effects, never cloned
// into it, so the server renders exactly the children and the popup mounts
// only after typing. Transient state (session, caret offset, timers,
// composition) lives in refs; the suggestion list lives in a store read
// through useSyncExternalStore.

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { warnOnce } from '@salmonui/core/internal/dev';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { caretOffset, caretRect, type CaretOffset, type MentionField } from '../internal/caret.js';
import { useDismiss } from '@salmonui/core/internal/dismiss';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';
import { useOverlayPosition, useTopLayer } from '@salmonui/core/internal/overlay';
import type { AnchorRect } from '@salmonui/core/internal/position';
import { createCollection, defaultItemDisabled, defaultItemLabel, defaultItemValue, type Collection } from '../internal/collection/collection.js';
import { createRemoteCollection, type RemoteCollection } from '../internal/collection/remote.js';
import { createSearchIndex, matchRanges, type SearchIndex } from '../internal/collection/search.js';
import { applyRovingMove, firstEnabled as firstEnabledIndex } from '@salmonui/core/internal/roving';
import { replaceText } from '@salmonui/core/internal/text-edit';
import { findMention, insertionText } from './query.js';
import { createMentionStore, isRemote, type MentionStore } from './store.js';
import type { MentionDataSource } from './types.js';
import type {
  MentionBeforeInsertEvent,
  MentionEventSource,
  MentionItem,
  MentionLocaleText,
  MentionOpenChangeReason,
  MentionProps,
  MentionTrigger,
} from './types.js';

export const MENTION_DEFAULT_LOCALE_TEXT: MentionLocaleText = Object.freeze({
  listLabel: 'Suggestions',
  noResults: 'No results',
  loading: 'Loading…',
  loadError: 'Could not load suggestions',
});

const DEFAULT_TRIGGERS: readonly MentionTrigger<never>[] = Object.freeze([{ char: '@' }]);

const defaultLabel = defaultItemLabel;
const defaultValue = defaultItemValue;
const defaultDisabled = defaultItemDisabled;

/** Local search state per data array: the collection and its folded index (built on the first search). */
interface LocalIndex<T> {
  readonly data: readonly T[];
  readonly key: string;
  readonly getLabel: ((item: T) => string) | undefined;
  readonly collection: Collection<T>;
  readonly index: SearchIndex<T>;
}

/** The remote collection of the open mention; disposed on close or when its inputs change. */
interface RemoteState<T> {
  readonly source: MentionDataSource<T>;
  readonly key: string;
  readonly collection: RemoteCollection<T>;
  readonly unsubscribe: () => void;
}

/** The active mention: where its trigger is, the caret offset of the trigger, and whether Escape dismissed it. */
interface Session {
  trigger: number;
  start: number;
  offset: CaretOffset | null;
  dismissed: boolean;
}

/** Mutable controller state shared by the field listeners and the popup; refs only, never rendered. */
interface Controller {
  field: MentionField | null;
  /** The element the listeners and ARIA attributes are on: the field, or the editor target's element. */
  element: HTMLElement | null;
  /** Viewport rectangle the popup anchors to (the caret at the trigger). */
  anchor: () => AnchorRect | null;
  session: Session | null;
  composing: boolean;
  local: LocalIndex<unknown>[];
  remote: RemoteState<unknown> | null;
  insert: (index: number, source: MentionEventSource) => void;
  close: (reason: MentionOpenChangeReason, source: MentionEventSource) => void;
}

const EMPTY: readonly never[] = Object.freeze([]);
/** Box geometry the overlay expects (it overrides the UA `[popover]` inset and margins). */
const POPUP_BOX = Object.freeze({ position: 'fixed', top: 0, left: 0, right: 'auto', bottom: 'auto', margin: 0 } as const);

/** Editor targets receive a string or number value (a boolean or null key becomes its string). */
const mentionValue = (key: unknown): string | number => (typeof key === 'number' ? key : String(key));

const join = (...names: (string | undefined)[]): string => names.filter(Boolean).join(' ');

export function Mention<T = MentionItem>(props: MentionProps<T>): ReactNode {
  const { children, className, style, classNames, styles, ref } = props;
  const baseId = useId();
  const popupId = `${baseId}-popup`;
  const [store] = useState(() => createMentionStore<T>());
  const [ctl] = useState<Controller>(() => ({ field: null, element: null, anchor: () => null, session: null, composing: false, local: [], remote: null, insert: () => {}, close: () => {} }));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });
  const open = useSyncExternalStore(store.subscribe, () => store.get().open, () => false);
  const container = useSyncExternalStore(store.subscribe, () => store.get().container, () => null);

  const target = props.target;
  const editorProp = props.editor;
  useEffect(() => {
    // `editor={null}`: the host has not created its target yet (it needs the mounted element).
    if (editorProp === null) return;
    const editor = editorProp ?? null;
    // an editor target (contenteditable or the rich text engine) replaces the field.
    const field = editor ? null : (target?.current ?? (rootRef.current?.querySelector('textarea, input') as MentionField | null | undefined) ?? null);
    if (!editor && !field) {
      warnOnce('mention-no-field', 'Mention: no <textarea> or <input> found; pass one as the child or through `target`.');
      return;
    }
    const el: HTMLElement = editor ? editor.element : field!;
    ctl.field = field;
    ctl.element = el;
    const doc = el.ownerDocument;
    /** The text up to the collapsed caret, or null (selection, not editable). */
    const read = (): { readonly value: string; readonly caret: number } | null => {
      if (editor) {
        const text = editor.getTextBeforeCaret();
        return text === null ? null : { value: text, caret: text.length };
      }
      const caret = field!.selectionStart;
      return caret === null || caret !== field!.selectionEnd ? null : { value: field!.value, caret };
    };
    ctl.anchor = () => {
      const session = ctl.session;
      if (!session) return null;
      if (editor) {
        const rect = editor.getCaretRect(session.start);
        return rect ? { left: rect.left, top: rect.top, width: 0, height: Math.max(0, rect.bottom - rect.top) } : null;
      }
      return session.offset ? caretRect(field!, session.offset) : null;
    };
    const p = () => propsRef.current;
    const triggersOf = (): readonly MentionTrigger<T>[] => p().triggers ?? (DEFAULT_TRIGGERS as readonly MentionTrigger<T>[]);
    const labelOf = (item: T): string => (p().getItemLabel ?? defaultLabel)(item);
    const disabledOf = (item: T): boolean => (p().isItemDisabled ?? defaultDisabled)(item);

    const setOpen = (next: boolean, reason: MentionOpenChangeReason, source: MentionEventSource): void => {
      if (store.get().open === next) return;
      store.set(next ? { open: true, container: p().container ?? portalScopeOf(el), dir: doc.defaultView?.getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr' } : { open: false });
      // The field keeps its own role (textbox), on which aria-expanded is not allowed; the
      // list is announced through aria-controls and aria-activedescendant.
      if (next) {
        el.setAttribute('aria-autocomplete', 'list');
        el.setAttribute('aria-controls', popupId);
      } else {
        el.removeAttribute('aria-autocomplete');
        el.removeAttribute('aria-controls');
        el.removeAttribute('aria-activedescendant');
      }
      p().onOpenChange?.(next, Object.freeze({ source, reason }));
    };
    const cancelRemote = (): void => {
      const remote = ctl.remote;
      if (!remote) return;
      ctl.remote = null;
      remote.unsubscribe();
      remote.collection.dispose();
    };
    const close = (reason: MentionOpenChangeReason, source: MentionEventSource): void => {
      cancelRemote();
      setOpen(false, reason, source);
      store.set({ items: EMPTY, active: -1, status: 'idle', error: null });
    };
    ctl.close = close;

    const firstEnabled = (items: readonly T[]): number => firstEnabledIndex(items.length, (i) => !disabledOf(items[i]!));
    const show = (items: readonly T[], text: string): void => {
      // A multi-word search that stopped matching after a space is ordinary text again.
      if (items.length === 0 && /\s/.test(text)) {
        close('caret', 'keyboard');
        return;
      }
      store.set({ items, active: firstEnabled(items), status: 'idle', error: null });
      setOpen(true, 'trigger', 'keyboard');
    };

    /** The collection and search index of a data array, kept while its data and options stay the same. */
    const localIndex = (data: readonly T[]): LocalIndex<T> => {
      const props = p();
      const key = `${props.matchCase === true}|${props.ignoreAccents === true}`;
      const cache = ctl.local as LocalIndex<T>[];
      const hit = cache.find((e) => e.data === data);
      if (hit && hit.key === key && hit.getLabel === props.getItemLabel) return hit;
      const collection = createCollection(data, { getItemLabel: props.getItemLabel, getItemValue: props.getItemValue, isItemDisabled: props.isItemDisabled });
      const entry: LocalIndex<T> = { data, key, getLabel: props.getItemLabel, collection, index: createSearchIndex(collection, { matchCase: props.matchCase, ignoreAccents: props.ignoreAccents }) };
      // One entry per trigger data array at most.
      ctl.local = [...cache.filter((e) => e.data !== data), entry].slice(-8) as LocalIndex<unknown>[];
      return entry;
    };

    const searchRemote = (source: MentionDataSource<T>, text: string): void => {
      const props = p();
      const maxResults = props.maxResults ?? 25;
      const operator = props.searchOperator ?? 'contains';
      const key = [typeof operator === 'function' ? 'contains' : operator, props.matchCase === true, props.ignoreAccents === true, maxResults, props.debounce ?? 300, (props.searchFields ?? []).join(',')].join('|');
      let remote = ctl.remote as RemoteState<T> | null;
      if (remote && (remote.source !== source || remote.key !== key)) {
        cancelRemote();
        remote = null;
      }
      if (!remote) {
        const collection = createRemoteCollection<T>(source, {
          operator: typeof operator === 'function' ? 'contains' : operator,
          matchCase: props.matchCase,
          ignoreAccents: props.ignoreAccents,
          searchFields: props.searchFields,
          maxResults,
          blockSize: Math.max(1, maxResults),
          debounce: props.debounce ?? 300,
        });
        let reported: unknown = null;
        const onChange = (): void => {
          if (ctl.remote?.collection !== collection) return;
          const snap = collection.getSnapshot();
          if (snap.error !== null) {
            store.set({ items: EMPTY, active: -1, status: 'error', error: snap.error });
            if (reported !== snap.error) {
              reported = snap.error;
              p().onLoadError?.(snap.error);
            }
            return;
          }
          if (snap.loading || snap.total < 0) {
            store.set({ status: 'loading', error: null });
            return;
          }
          const rows: T[] = [];
          for (let i = 0; i < snap.total; i++) {
            const row = snap.item(i);
            if (row !== undefined) rows.push(row);
          }
          // A local predicate still applies to remote rows.
          show(typeof operator === 'function' ? rows.filter((row) => operator(row, snap.search)) : rows, store.get().text);
        };
        remote = { source, key, collection, unsubscribe: collection.subscribe(onChange) };
        ctl.remote = remote as RemoteState<unknown>;
        store.set({ status: 'loading', error: null });
        setOpen(true, 'trigger', 'keyboard');
        // The first read runs now for the bare trigger; a search text waits for the debounce.
        if (text === '') collection.ensure(0, Math.max(1, maxResults));
        else collection.setSearch(text);
        return;
      }
      remote.collection.setSearch(text);
    };

    const search = (triggerIndex: number, text: string): void => {
      const props = p();
      const trigger = triggersOf()[triggerIndex]!;
      const data = trigger.data ?? props.data ?? EMPTY;
      const maxResults = props.maxResults ?? 25;
      if (store.get().text !== text || store.get().trigger !== triggerIndex) {
        store.set({ text, trigger: triggerIndex });
        props.onSearchChange?.(Object.freeze({ text, trigger: trigger.char }));
      }
      if (isRemote<T>(data)) {
        searchRemote(data, text);
        return;
      }
      cancelRemote();
      const { index } = localIndex(data);
      const hits = index.search(text, props.searchOperator ?? 'contains');
      const count = Math.min(Math.max(0, maxResults), hits ? hits.length : data.length);
      const items: T[] = new Array<T>(count);
      for (let i = 0; i < count; i++) items[i] = data[hits ? hits[i]! : i]!;
      show(items, text);
    };

    const update = (): void => {
      if (ctl.composing || (field && (field.disabled || field.readOnly))) return;
      const at = read();
      if (!at) {
        close('caret', 'keyboard');
        return;
      }
      const props = p();
      const triggers = triggersOf();
      const match = findMention(at.value, at.caret, triggers, { requireLeadingSpace: props.requireLeadingSpace ?? true, multiWord: props.multiWord ?? false });
      if (!match) {
        ctl.session = null;
        close('caret', 'keyboard');
        return;
      }
      let session = ctl.session;
      if (!session || session.start !== match.start || session.trigger !== match.trigger) {
        session = { trigger: match.trigger, start: match.start, offset: null, dismissed: false };
        ctl.session = session;
      }
      if (session.dismissed || match.text.length < (props.minSearchLength ?? 0)) {
        close('caret', 'keyboard');
        return;
      }
      if (field && !session.offset) session.offset = caretOffset(field, match.start);
      // An editor reports every selection change (late `selectionchange` included): the
      // same open search keeps its list and active option.
      if (!field && store.get().open && store.get().text === match.text && store.get().trigger === match.trigger) return;
      search(match.trigger, match.text);
    };

    const setActive = (index: number): void => store.set({ active: index });
    // aria-activedescendant follows the active option while the list is open.
    const unsubscribeActive = store.subscribe(() => {
      const { open: isOpen, active } = store.get();
      if (!isOpen) return;
      const id = active >= 0 ? `${baseId}-option-${active}` : null;
      if (id === el.getAttribute('aria-activedescendant')) return;
      if (id) el.setAttribute('aria-activedescendant', id);
      else el.removeAttribute('aria-activedescendant');
    });

    ctl.insert = (index: number, source: MentionEventSource): void => {
      const session = ctl.session;
      const item = store.get().items[index];
      if (!session || item === undefined || disabledOf(item)) return;
      const props = p();
      const trigger = triggersOf()[session.trigger]!;
      const text = insertionText(trigger.char, trigger.keepChar ?? false, props.getInsertText ? props.getInsertText(item, trigger) : labelOf(item), trigger.suffix ?? '');
      let prevented = false;
      if (props.onBeforeInsert) {
        const event: MentionBeforeInsertEvent<T> = {
          item,
          text,
          trigger: trigger.char,
          source,
          preventDefault: () => {
            prevented = true;
          },
          get defaultPrevented() {
            return prevented;
          },
        };
        props.onBeforeInsert(event);
        if (prevented) return;
      }
      const start = session.start;
      // The insertion fires `input`; the dismissed session keeps it from reopening the list.
      session.dismissed = true;
      if (!field) {
        const end = read()?.caret ?? start;
        close('insert', source);
        if (doc.activeElement !== el && !el.contains(doc.activeElement)) el.focus();
        editor!.insertMention(Object.freeze({ start, end: Math.max(start, end), text, suffix: trigger.suffix ?? '', trigger: trigger.char, value: mentionValue((props.getItemValue ?? defaultValue)(item)), label: labelOf(item), item }));
        props.onInsert?.(Object.freeze({ item, text, trigger: trigger.char, source }));
        return;
      }
      const end = field.selectionStart ?? start;
      close('insert', source);
      // execCommand keeps the native undo stack; setRangeText is the fallback.
      replaceText(field, start, end, text);
      props.onInsert?.(Object.freeze({ item, text, trigger: trigger.char, source }));
    };

    const onInput = (event: Event): void => {
      if ((event as InputEvent).isComposing || !event.composedPath().includes(el)) return;
      update();
    };
    const onCompositionStart = (): void => {
      ctl.composing = true;
    };
    const onCompositionEnd = (): void => {
      ctl.composing = false;
      update();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.keyCode === 229 || !store.get().open) return;
      const { items, active } = store.get();
      const move = (delta: 1 | -1): void => {
        event.preventDefault();
        if (!field) event.stopImmediatePropagation();
        setActive(applyRovingMove(delta > 0 ? 'next' : 'prev', items.length, active, (i) => !disabledOf(items[i]!)));
      };
      switch (event.key) {
        case 'ArrowDown':
          move(1);
          break;
        case 'ArrowUp':
          move(-1);
          break;
        case 'Enter':
        case 'Tab':
          if (active >= 0 && !event.shiftKey) {
            event.preventDefault();
            if (!field) event.stopImmediatePropagation();
            ctl.insert(active, 'keyboard');
          } else {
            if (ctl.session) ctl.session.dismissed = true;
            close(event.key === 'Tab' ? 'tab' : 'escape', 'keyboard');
          }
          break;
        case 'Escape':
          event.preventDefault();
          if (!field) event.stopImmediatePropagation();
          event.stopPropagation();
          if (ctl.session) ctl.session.dismissed = true;
          close('escape', 'keyboard');
          break;
        default:
      }
    };
    const onCaretMove = (event: Event): void => {
      if (event.type === 'keyup') {
        const key = (event as KeyboardEvent).key;
        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End' && key !== 'PageUp' && key !== 'PageDown') return;
        if (store.get().open && (key === 'PageUp' || key === 'PageDown')) return;
      }
      update();
    };
    const onBlur = (): void => close('blur', 'pointer');
    // A trigger typed before this effect ran (a host that loads Mention lazily, like
    // RichTextEditor, mounts it after the editor is already in use) opens the list now
    // instead of waiting for the next keystroke. Only a focused target: existing text
    // with a trigger before the caret does not open the list on page load.
    if (el.contains(doc.activeElement)) update();

    if (!field) {
      // Editor target: the editor reports changes after it applied them; keys are taken
      // in the capture phase so the editor never sees the ones the open list handles.
      const unsubscribe = editor!.subscribe(update);
      el.addEventListener('keydown', onKeyDown, true);
      el.addEventListener('compositionstart', onCompositionStart);
      el.addEventListener('compositionend', onCompositionEnd);
      el.addEventListener('focusout', onBlur);
      return () => {
        unsubscribe();
        el.removeEventListener('keydown', onKeyDown, true);
        el.removeEventListener('compositionstart', onCompositionStart);
        el.removeEventListener('compositionend', onCompositionEnd);
        el.removeEventListener('focusout', onBlur);
        unsubscribeActive();
        close('blur', 'api');
        ctl.field = null;
        ctl.element = null;
        ctl.session = null;
      };
    }
    // `input` is read on the document, after React's root listener: a listener on the field
    // runs first, and the microtask checkpoint after it would flush a re-render that the
    // callbacks below (onOpenChange, onSearchChange) schedule in the host before React saw
    // the typed text, so a controlled field (Salmon's TextArea) would be reset to its old value.
    doc.addEventListener('input', onInput);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('keyup', onCaretMove);
    el.addEventListener('click', onCaretMove);
    el.addEventListener('blur', onBlur);
    return () => {
      doc.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onCaretMove);
      el.removeEventListener('click', onCaretMove);
      el.removeEventListener('blur', onBlur);
      unsubscribeActive();
      close('blur', 'api');
      ctl.field = null;
      ctl.element = null;
      ctl.session = null;
    };
  }, [target, editorProp, store, ctl, baseId, popupId]);

  const popup = open && container ? createPortal(<MentionPopup store={store} ctl={ctl} props={props} baseId={baseId} popupId={popupId} />, container as Element) : null;
  if (children === undefined) return popup;
  return (
    <div ref={(el) => setRefs(el, rootRef, ref)} className={join('salmon-mention', classNames?.root, className)} style={style || styles?.root ? { ...styles?.root, ...style } : undefined}>
      {children}
      {popup}
    </div>
  );
}

function setRefs(el: HTMLDivElement | null, own: { current: HTMLDivElement | null }, user: MentionProps['ref']): (() => void) | undefined {
  own.current = el;
  if (typeof user === 'function') {
    const cleanup = user(el);
    return () => {
      own.current = null;
      if (typeof cleanup === 'function') cleanup();
      else user(null);
    };
  }
  if (user) user.current = el;
  return () => {
    own.current = null;
    if (user && typeof user !== 'function') user.current = null;
  };
}

interface PopupProps<T> {
  readonly store: MentionStore<T>;
  readonly ctl: Controller;
  readonly props: MentionProps<T>;
  readonly baseId: string;
  readonly popupId: string;
}

function MentionPopup<T>({ store, ctl, props, baseId, popupId }: PopupProps<T>): ReactNode {
  const items = useSyncExternalStore(store.subscribe, () => store.get().items);
  const status = useSyncExternalStore(store.subscribe, () => store.get().status);
  const error = useSyncExternalStore(store.subscribe, () => store.get().error);
  const text = useSyncExternalStore(store.subscribe, () => store.get().text);
  const triggerIndex = useSyncExternalStore(store.subscribe, () => store.get().trigger);
  const dir = useSyncExternalStore(store.subscribe, () => store.get().dir);
  const ref = useRef<HTMLDivElement | null>(null);
  const locale = { ...MENTION_DEFAULT_LOCALE_TEXT, ...useLocaleText('mention', props.localeText) };
  const triggerChar = (props.triggers ?? DEFAULT_TRIGGERS)[triggerIndex]?.char ?? '';

  // Shared overlay primitives: top layer, placement at the caret (one read, one write;
  // re-placed on scroll, resize and content changes) and a dismiss layer, so a press in the
  // list counts as inside for any layer below (a dialog that holds the field).
  const anchor = (): AnchorRect | null => ctl.anchor();
  useTopLayer(ref);
  const place = useOverlayPosition(ref, anchor, { placement: 'bottom-start', offset: 2, rtl: dir === 'rtl' });
  useLayoutEffect(() => {
    place();
  }, [place, items, status]);
  const fieldRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    fieldRef.current = ctl.element;
  });
  // Escape is handled on the field (it calls preventDefault, so no layer below closes).
  useDismiss(ref, { onDismiss: () => ctl.close('outside', 'pointer'), insideRefs: [fieldRef], escape: false });

  const { classNames, styles } = props;
  let body: ReactNode;
  if (status === 'loading') body = <div className="salmon-mention-status" role="status">{props.renderLoading ? props.renderLoading() : locale.loading}</div>;
  else if (status === 'error') body = <div className="salmon-mention-status" role="alert" data-error="">{props.renderError ? props.renderError({ error }) : locale.loadError}</div>;
  else if (items.length === 0) body = <div className="salmon-mention-status" role="status">{props.renderEmpty ? props.renderEmpty() : locale.noResults}</div>;
  else
    body = (
      <ul role="listbox" id={`${baseId}-list`} aria-label={locale.listLabel} className={join('salmon-mention-list', classNames?.list)} style={styles?.list}>
        {items.map((item, index) => (
          <MentionOption key={String((props.getItemValue ?? defaultValue)(item))} item={item} index={index} store={store} ctl={ctl} props={props} baseId={baseId} text={text} trigger={triggerChar} />
        ))}
      </ul>
    );
  return (
    <div
      ref={ref}
      id={popupId}
      className={join('salmon-mention-popup', classNames?.popup)}
      // Viewport coordinates are physical; the transform written after measuring places the box.
      style={{ ...POPUP_BOX, ...styles?.popup }}
      dir={dir}
      data-salmon-mention-popup=""
      aria-busy={status === 'loading' || undefined}
    >
      {body}
    </div>
  );
}

interface OptionProps<T> {
  readonly item: T;
  readonly index: number;
  readonly store: MentionStore<T>;
  readonly ctl: Controller;
  readonly props: MentionProps<T>;
  readonly baseId: string;
  readonly text: string;
  readonly trigger: string;
}

function MentionOption<T>({ item, index, store, ctl, props, baseId, text, trigger }: OptionProps<T>): ReactNode {
  const active = useSyncExternalStore(store.subscribe, () => store.get().active === index);
  const label = (props.getItemLabel ?? defaultLabel)(item);
  const disabled = (props.isItemDisabled ?? defaultDisabled)(item);
  const operator = props.searchOperator ?? 'contains';
  const matches = props.highlightMatches && typeof operator !== 'function' ? (matchRanges(label, text, operator, { matchCase: props.matchCase, ignoreAccents: props.ignoreAccents })[0] ?? null) : null;
  const ref = useRef<HTMLLIElement | null>(null);
  useLayoutEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  let content: ReactNode;
  if (props.renderItem) content = props.renderItem({ item, label, active, disabled, matches, trigger });
  // One text box: the option is a flex row, so loose text and the mark would each be a flex item with a gap between them.
  else if (matches)
    content = (
      <span className="salmon-mention-label">
        {label.slice(0, matches[0])}
        <mark className="salmon-mention-mark">{label.slice(matches[0], matches[1])}</mark>
        {label.slice(matches[1])}
      </span>
    );
  else content = <span className="salmon-mention-label">{label}</span>;
  return (
    <li
      ref={ref}
      id={`${baseId}-option-${index}`}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      data-active={active ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={join('salmon-mention-option', props.classNames?.option)}
      style={props.styles?.option}
      onPointerDown={(event) => event.preventDefault()}
      onPointerMove={() => {
        if (!disabled && !active) store.set({ active: index });
      }}
      onClick={(event) => {
        const pointerType = (event.nativeEvent as PointerEvent).pointerType;
        ctl.insert(index, pointerType === 'touch' ? 'touch' : event.detail === 0 ? 'keyboard' : 'pointer');
      }}
    >
      {content}
    </li>
  );
}
