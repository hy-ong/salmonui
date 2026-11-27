'use client';

// Shared parts of the axis bar and the field list: one field item (a chip
// button or a listbox option) with its keyboard model (Enter or
// Alt+ArrowDown opens the field menu with "Move to", Alt+ArrowUp / ArrowDown
// reorders, Delete removes) and HTML drag and drop between axes. Drag
// transients (the drop index) live on the DOM, never in React state.

import { lazy, Suspense, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { PivotAggregate, PivotModel } from '@salmonui/pivot-table/engine';
import type { PivotController } from './controller.js';
import type { PivotText } from './locale.js';
import { AGGREGATE_LABELS, aggregateOptionsFor, VALUES_FIELD } from './model-ops.js';
import type { PivotAxis, PivotEventSource } from './types.js';

const FieldMenu = lazy(() => import('./field-menu.js'));

const DRAG_TYPE = 'application/x-salmon-pivot-field';

export interface FieldItemOptions {
  readonly pivot: PivotController<unknown>;
  readonly text: PivotText;
  readonly draft: boolean;
  readonly aggregateOptions: readonly PivotAggregate[] | undefined;
  readonly show: { readonly sort?: boolean | undefined; readonly filter?: boolean | undefined; readonly remove?: boolean | undefined; readonly aggregate?: boolean | undefined; readonly drag?: boolean | undefined };
}

/** Display caption of an axis item (value fields as `Sum of Amount`). */
export function itemCaption(model: PivotModel, field: string, axis: PivotAxis | null, caption: string, text: PivotText): string {
  if (field === VALUES_FIELD) return text('valuesItem');
  if (axis !== 'values') return caption;
  const value = model.values.find((v) => v.field === field);
  if (!value) return caption;
  if (value.caption) return value.caption;
  if (model.calculatedFields.some((c) => c.name === field)) return caption;
  return text('aggregateOf', { aggregate: AGGREGATE_LABELS[value.aggregate], field: caption });
}

/** What `useFieldItem()` returns (declared, so the emitted types name no `any`). */
export interface FieldItemState {
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly labelId: string;
  readonly menuOpen: boolean;
  readonly openMenu: (source: PivotEventSource) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly dragProps: { readonly draggable?: boolean; readonly onDragStart?: (event: DragEvent<HTMLElement>) => void };
  readonly menuElement: ReactNode;
}

/** Handlers and the lazy menu of one field item. */
export function useFieldItem(field: string, axis: PivotAxis | null, options: FieldItemOptions): FieldItemState {
  const { pivot, draft } = options;
  const triggerRef = useRef<HTMLElement | null>(null);
  const labelId = useId();
  const [menu, setMenu] = useState<{ aggregates: readonly PivotAggregate[] | null } | null>(null);
  const info = pivot.getSnapshot().fields.find((f) => f.field === field);
  const draggable = options.show.drag !== false && info?.draggable !== false;
  // The pending deferred focus of this item; a new menu or close cancels it. It outlives an
  // unmount on purpose: a move re-mounts the item on another axis, where the request finds it.
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refocus = (): void => {
    clearTimeout(focusTimer.current);
    focusTimer.current = requestFocus(triggerRef.current, field);
  };

  const openMenu = (source: PivotEventSource): void => {
    clearTimeout(focusTimer.current);
    let aggregates: readonly PivotAggregate[] | null = null;
    if (axis === 'values') {
      const state = pivot.getSnapshot();
      const model = draft ? (state.draft ?? state.model) : state.model;
      const index = model.values.findIndex((v) => v.field === field);
      aggregates = index >= 0 ? pivot.aggregateMenuItems(field, index, aggregateOptionsFor(info, options.aggregateOptions), source) : null;
    }
    setMenu({ aggregates });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const opts = { source: 'keyboard' as const, draft };
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.altKey && axis) {
      // Alt+ArrowDown opens the menu on a chip with no reorder room only via Enter; Alt+Arrow reorders.
      event.preventDefault();
      pivot.stepField(field, axis, event.key === 'ArrowUp' ? -1 : 1, opts);
      refocus();
    } else if (event.key === 'Enter' || (event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      openMenu('keyboard');
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && axis && field !== VALUES_FIELD && info?.removable !== false && options.show.remove !== false) {
      event.preventDefault();
      pivot.moveField(field, null, -1, opts);
    }
  };

  const dragProps = draggable
    ? {
        draggable: true,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          event.dataTransfer.setData(DRAG_TYPE, field);
          event.dataTransfer.setData('text/plain', field);
          event.dataTransfer.effectAllowed = 'move';
        },
      }
    : {};

  const menuElement: ReactNode = menu ? (
    <Suspense fallback={null}>
      <FieldMenu
        pivot={pivot}
        field={field}
        axis={axis}
        text={options.text}
        triggerRef={triggerRef}
        labelledBy={labelId}
        draft={draft}
        aggregates={menu.aggregates}
        show={options.show}
        onClose={(returnFocus) => {
          clearTimeout(focusTimer.current);
          setMenu(null);
          if (!returnFocus) return;
          // Focus the trigger now, before a dialog the action opened mounts, so the
          // dialog's focus scope takes focus and later returns it here; the deferred
          // request finds the item again after a move re-rendered it.
          if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
          refocus();
        }}
      />
    </Suspense>
  ) : null;

  return { triggerRef, labelId, menuOpen: menu !== null, openMenu, onKeyDown, dragProps, menuElement };
}

/**
 * Focuses the item of `field` after a re-render moved it (same container, found by data
 * attribute). It gives up when focus went elsewhere meanwhile (another item's menu, a dialog):
 * only focus still on the scheduling element or dropped to the body is restored.
 */
function requestFocus(current: HTMLElement | null, field: string): ReturnType<typeof setTimeout> | undefined {
  if (!current) return undefined;
  const doc = current.ownerDocument;
  const root = current.closest('[data-pivot-fields]');
  const before = doc.activeElement;
  return setTimeout(() => {
    const now = doc.activeElement;
    if (now && now !== before && now !== doc.body) return;
    // The item on an axis first (a field list also lists the field in its Fields listbox, which comes first in the DOM).
    const selector = `[data-pivot-field="${CSS.escape(field)}"]`;
    const target = root?.querySelector<HTMLElement>(`${selector}[data-axis]`) ?? root?.querySelector<HTMLElement>(selector);
    target?.focus({ preventScroll: true });
  }, 0);
}

/** Drop target handlers of an axis list: the drop index comes from the pointer position over the items. */
export function dropTargetProps(axis: PivotAxis, pivot: PivotController<unknown>, draft: boolean) {
  const indexAt = (container: HTMLElement, event: DragEvent<HTMLElement>): number => {
    const items = [...container.querySelectorAll<HTMLElement>('[data-pivot-field]')];
    const vertical = container.dataset.orientation === 'vertical';
    for (let i = 0; i < items.length; i++) {
      const rect = (items[i] as HTMLElement).getBoundingClientRect();
      const mid = vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
      const pos = vertical ? event.clientY : event.clientX;
      const rtl = !vertical && getComputedStyle(container).direction === 'rtl';
      if (rtl ? pos > mid : pos < mid) return i;
    }
    return items.length;
  };
  return {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      event.currentTarget.dataset.dropIndex = String(indexAt(event.currentTarget, event));
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) delete event.currentTarget.dataset.dropIndex;
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const field = event.dataTransfer.getData(DRAG_TYPE);
      delete event.currentTarget.dataset.dropIndex;
      if (!field) return;
      event.preventDefault();
      let index = indexAt(event.currentTarget, event);
      // Dropping after itself inside the same axis: the item is removed first.
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-pivot-field]')].map((el) => el.dataset.pivotField);
      const from = items.indexOf(field);
      if (from >= 0 && from < index) index--;
      pivot.moveField(field, axis, index, { source: 'pointer', draft });
    },
  };
}
