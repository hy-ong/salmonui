'use client';

// TagGroup: input chips as an APG
// Grid of one-cell rows with a roving tab stop, removable tags, optional
// single or multiple selection, form value, keyboard and pointer
// reordering. Focus and the tab stop are found in the DOM after commit, and
// clicks, focus and presses are delegated to the root: rows only render.

import { Children, createContext, isValidElement, use, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { holdInput, PRESS_EVENTS, replayInput } from '@salmonui/core/internal/held-input';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { pointerSource, pressSource } from '@salmonui/core/internal/press';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';
import type {
  TagDragEndEvent,
  TagDragEvent,
  TagDragStartEvent,
  TagDropEvent,
  TagDropTarget,
  TagEventSource,
  TagRemoveEvent,
  TagReorderEvent,
  TagSelectionEvent,
  TagSelectionMode,
  TagSize,
  TagTone,
} from './types.js';

export interface TagGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'role' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onDrop'> {
  /** `Tag` elements; map your array to them (add = append, remove = filter). */
  children?: ReactNode;
  /** Default `'none'`; selectable rows carry `aria-selected`. */
  selectionMode?: TagSelectionMode | undefined;
  /** Selected tag values (at most one in single mode). */
  value?: readonly string[] | undefined;
  defaultValue?: readonly string[] | undefined;
  onValueChange?: ((value: readonly string[], event: TagSelectionEvent) => void) | undefined;
  /** Makes tags removable: a remove button and Delete / Backspace. Remove the values from your state; not removing them vetoes. */
  onRemove?: ((values: readonly string[], event: TagRemoveEvent) => void) | undefined;
  /** Pointer drag within the group and Alt + arrow keys fire `onReorder`. */
  reorderable?: boolean | undefined;
  onReorder?: ((event: TagReorderEvent) => void) | undefined;
  /** Groups with the same `dragGroup` accept each other's tags; the receiving group fires `onTagDrop`. */
  dragGroup?: string | undefined;
  onTagDrop?: ((event: TagDropEvent) => void) | undefined;
  onTagDragStart?: ((event: TagDragStartEvent) => void) | undefined;
  onTagDrag?: ((event: TagDragEvent) => void) | undefined;
  onTagDragEnd?: ((event: TagDragEndEvent) => void) | undefined;
  /** Disables every tag; nothing is submitted while disabled. */
  disabled?: boolean | undefined;
  /** Default tone of the tags. */
  tone?: TagTone | undefined;
  size?: TagSize | undefined;
  /** Form field name: hidden inputs with the selected values (selectable), else every tag's value. */
  name?: string | undefined;
  /** Shown in a single row when there are no tags. */
  empty?: ReactNode;
  localeText?: { readonly remove?: ((label: string) => string) | undefined } | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

export interface TagProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  /** Stable identity, reported in every event and submitted with `name`. */
  value: string;
  children?: ReactNode;
  /** Plain-text label when `children` is not a string (remove button name). */
  textValue?: string | undefined;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  tone?: TagTone | undefined;
  disabled?: boolean | undefined;
  /** `false` opts this tag out of removal. Default: removable when the group has `onRemove`. */
  removable?: boolean | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

interface GroupState {
  readonly mode: TagSelectionMode;
  readonly disabled: boolean;
  readonly tone: TagTone | undefined;
  readonly removable: boolean;
  readonly tabStop: string | null;
  readonly selected: readonly string[];
  readonly draggable: boolean;
  readonly removeLabel: (label: string) => string;
}

const TagGroupContext = createContext<GroupState | null>(null);
const ROW = '[data-salmon-tag]';
const NONE: readonly string[] = Object.freeze([]);
/** Mounted groups by grid element (cross-group drops); holds no render state. */
const targets = new WeakMap<Element, TagDropTarget>();

function rowsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ROW)].filter((row) => row.closest('.salmon-tag-group') === root);
}
const valueOf = (row: Element | null | undefined): string => (row as HTMLElement | null | undefined)?.dataset['value'] as string;
const enabled = (row: HTMLElement | null | undefined): boolean => !!row && row.getAttribute('aria-disabled') !== 'true';

/**
 * A wrapping collection of tags: `.salmon-tag-group` (`role="grid"`) of
 * `Tag` rows, one tab stop, arrow keys mirrored in RTL.
 */
export function TagGroup(props: TagGroupProps): ReactElement {
  const {
    children,
    selectionMode = 'none',
    value,
    defaultValue = NONE,
    onValueChange,
    onRemove,
    reorderable = false,
    onReorder,
    dragGroup,
    onTagDrop,
    onTagDragStart,
    onTagDrag,
    onTagDragEnd,
    disabled = false,
    tone,
    size = 'md',
    name,
    empty,
    localeText,
    className,
    onKeyDown,
    onClick,
    onFocus,
    onPointerDown,
    id,
    ref,
    ...rest
  } = props;
  const text = useLocaleText('tagGroup', localeText);
  const [selected, propose] = useControllableState<readonly string[], [TagSelectionEvent]>(value, defaultValue, onValueChange, 'TagGroup value');
  const [focusValue, setFocusValue] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const generated = useId();
  const groupId = id ?? generated;
  // Keyboard and drag transients, never state.
  const pending = useRef<{ value: string; index: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const cancelDrag = useRef<(() => void) | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      assignRef<HTMLDivElement>(ref as never, el);
    },
    [ref],
  );
  useFormReset(root, () => propose(defaultValue, Object.freeze({ source: 'api', reason: 'reset' })));

  useEffect(() => {
    const el = root.current as HTMLDivElement;
    const rows = rowsOf(el);
    const p = pending.current;
    if (p) {
      pending.current = null;
      const same = rows.find((row) => valueOf(row) === p.value);
      // A vetoed removal keeps focus; a moved tag gets it back; a removed one hands it on.
      const next = p.moved ? same : same ? null : rows[Math.min(p.index, rows.length - 1)];
      if (next) {
        if (next !== el.ownerDocument.activeElement) next.focus();
        return setFocusValue(valueOf(next));
      }
      if (!rows.length) el.focus();
    }
    if (!rows.some((row) => row.tabIndex === 0)) {
      const first = rows.find(enabled);
      if (first) setFocusValue(valueOf(first));
    }
  });

  const draggable = !disabled && (reorderable || dragGroup !== undefined);
  useEffect(() => {
    const el = root.current as HTMLDivElement;
    if (!draggable) return;
    targets.set(el, {
      id: groupId,
      group: dragGroup ?? null,
      reorderable,
      reorder: (values, toIndex) => latest.current.onReorder?.(Object.freeze({ values, toIndex, delta: null, source: 'pointer' })),
      receive: (values, fromGroup, toIndex) => latest.current.onTagDrop?.(Object.freeze({ values, fromGroup, toIndex, source: 'pointer' })),
    });
    return () => {
      targets.delete(el);
      cancelDrag.current?.();
    };
  }, [draggable, groupId, dragGroup, reorderable]);

  const selectable = selectionMode !== 'none';
  const removable = onRemove !== undefined && !disabled;
  const toggle = (item: string, source: TagEventSource) => {
    const on = selected.includes(item);
    propose(on ? selected.filter((v) => v !== item) : selectionMode === 'single' ? [item] : [...selected, item], Object.freeze({ source, reason: 'toggle' }));
  };
  /** The tag, or every selected tag when it is selected (multiple mode). */
  const withSelection = (rows: HTMLElement[], row: HTMLElement) => (selectionMode === 'multiple' && selected.includes(valueOf(row)) ? rows.filter((r) => selected.includes(valueOf(r))) : [row]);
  const rowAt = (target: EventTarget): HTMLElement | null => {
    const row = (target as Element).closest<HTMLElement>(ROW);
    return row && row.closest('.salmon-tag-group') === root.current ? row : null;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches(ROW)) return;
    const rows = rowsOf(root.current as HTMLDivElement);
    const index = rows.indexOf(target);
    const item = valueOf(target);
    const key = event.key;
    if (key === 'Delete' || key === 'Backspace') {
      if (!removable) return;
      event.preventDefault();
      const values = withSelection(rows, target)
        .filter((row) => row.hasAttribute('aria-keyshortcuts'))
        .map(valueOf);
      if (!values.length) return;
      pending.current = { value: item, index, moved: false };
      onRemove?.(values, Object.freeze({ source: 'keyboard', reason: key === 'Delete' ? 'delete' : 'backspace' }));
      return;
    }
    if (key === ' ' || key === 'Enter') {
      if (!selectable) return;
      event.preventDefault();
      if (enabled(target)) toggle(item, 'keyboard');
      return;
    }
    const move = rovingMove(key, { orientation: 'both', rtl: getComputedStyle(target).direction === 'rtl' });
    if (!move) return;
    event.preventDefault();
    if (event.altKey) {
      const delta = move === 'next' ? 1 : move === 'prev' ? -1 : 0;
      const toIndex = index + (delta > 0 ? 2 : -1);
      if (!reorderable || disabled || !delta || toIndex < 0 || toIndex > rows.length) return;
      pending.current = { value: item, index, moved: true };
      onReorder?.(Object.freeze({ values: [item], toIndex, delta, source: 'keyboard' }));
      return;
    }
    rows[applyRovingMove(move, rows.length, index, (i) => enabled(rows[i]))]?.focus();
  };

  const state: GroupState = {
    mode: selectionMode,
    disabled,
    tone,
    removable,
    tabStop: focusValue ?? selected[0] ?? null,
    selected,
    draggable,
    removeLabel: text?.remove ?? ((label) => `Remove ${label}`),
  };

  return (
    <div
      role="grid"
      aria-multiselectable={selectionMode === 'multiple' || undefined}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      {...rest}
      id={id}
      ref={setRef}
      className={className ? `salmon-tag-group ${className}` : 'salmon-tag-group'}
      data-size={size}
      data-selection-mode={selectionMode}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented) handleKeyDown(event);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        const row = rowAt(event.target);
        if (row && row === event.target) setFocusValue(valueOf(row));
      }}
      onClick={(event) => {
        onClick?.(event);
        const row = rowAt(event.target);
        if (event.defaultPrevented || !enabled(row)) return;
        const source = pressSource(event);
        if ((event.target as Element).closest('.salmon-tag-remove')) {
          if (!removable) return;
          pending.current = { value: valueOf(row), index: rowsOf(root.current as HTMLDivElement).indexOf(row as HTMLElement), moved: false };
          onRemove?.([valueOf(row)], Object.freeze({ source, reason: 'button' }));
        } else if (selectable && !suppressClick.current) toggle(valueOf(row), source);
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        const row = rowAt(event.target);
        const el = root.current as HTMLDivElement;
        const from = targets.get(el);
        if (event.defaultPrevented || !row || !from || event.button !== 0 || !enabled(row) || (event.target as Element).closest('button')) return;
        const values = withSelection(rowsOf(el), row).map(valueOf);
        const { pointerId, clientX: x, clientY: y } = event;
        const source = pointerSource(event.pointerType);
        // The rest of the press may arrive before the chunk: held, then replayed to its window listeners.
        const view = el.ownerDocument.defaultView as Window;
        const held = holdInput(view, PRESS_EVENTS);
        void import('./drag.js').then((m) => {
          cancelDrag.current?.();
          cancelDrag.current = m.armDrag(row, from, (node) => targets.get(node), {
            values,
            pointerId,
            source,
            x,
            y,
            start: (e) => {
              latest.current.onTagDragStart?.(e);
              suppressClick.current = !e.defaultPrevented;
            },
            drag: (e) => latest.current.onTagDrag?.(e),
            end: (dropped) => {
              cancelDrag.current = null;
              setTimeout(() => {
                suppressClick.current = false;
              });
              latest.current.onTagDragEnd?.(Object.freeze({ values, dropped }));
            },
          });
          replayInput(held(), () => view);
        }, held);
      }}
    >
      <TagGroupContext value={state}>{children}</TagGroupContext>
      {empty != null && Children.count(children) === 0 ? (
        <div role="row" className="salmon-tag-group-empty">
          <div role="gridcell">{empty}</div>
        </div>
      ) : null}
      {name && !disabled
        ? (selectable ? selected : Children.toArray(children).flatMap((child) => (isValidElement<TagProps>(child) && typeof child.props.value === 'string' ? [child.props.value] : []))).map((item) => (
            <input key={item} type="hidden" name={name} value={item} />
          ))
        : null}
    </div>
  );
}

/** One tag: `.salmon-tag` row with a single cell (label, icons, remove button). */
export function Tag(props: TagProps): ReactElement {
  const group = use(TagGroupContext);
  const { value, children, textValue, iconStart, iconEnd, tone, disabled, removable, className, ref, ...rest } = props;
  const off = disabled === true || group?.disabled === true;
  const canRemove = (removable ?? true) && group?.removable === true;
  const selectable = group !== null && group.mode !== 'none';
  const on = selectable && group.selected.includes(value);
  const icon = (node: ReactNode) =>
    node != null ? (
      <span className="salmon-tag-icon" aria-hidden="true">
        {node}
      </span>
    ) : null;
  return (
    <div
      role="row"
      tabIndex={group?.tabStop === value ? 0 : -1}
      aria-selected={selectable ? on : undefined}
      aria-disabled={off || undefined}
      aria-keyshortcuts={canRemove && !off ? 'Delete Backspace' : undefined}
      {...rest}
      ref={ref}
      className={className ? `salmon-tag ${className}` : 'salmon-tag'}
      data-salmon-tag=""
      data-value={value}
      data-tone={tone ?? group?.tone}
      data-selected={on ? '' : undefined}
      data-draggable={group?.draggable && !off ? '' : undefined}
    >
      <div role="gridcell" className="salmon-tag-cell">
        {icon(iconStart)}
        <span className="salmon-tag-label">{children}</span>
        {icon(iconEnd)}
        {canRemove ? (
          <button type="button" className="salmon-tag-remove" tabIndex={-1} disabled={off} aria-label={group.removeLabel(textValue ?? (typeof children === 'string' ? children : value))}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
