// Contract between a mounted Listbox and the lazy drag chunk (drag.ts).
// Drop targets register their list element in effects; the WeakMap holds no
// render state and never keeps an unmounted list alive.

import type { ListboxKey } from './types.js';

/** A list that can receive a drop. */
export interface ListboxDropTarget {
  readonly id: string;
  /** `dragGroup`, or null for a list that only reorders. */
  readonly group: string | null;
  readonly reorderable: boolean;
  /** Insertion index in `data` for a pointer at `clientY`, and the indicator offset in px inside the item container. */
  dropAt(clientY: number): { readonly index: number; readonly offset: number };
  /** Same-list drop. */
  reorder(values: readonly ListboxKey[], toIndex: number): void;
  /** Drop from another list. */
  receive(values: readonly ListboxKey[], items: readonly unknown[], fromList: string, toIndex: number): void;
}

/** Internal. */
export interface ListboxDragSession {
  readonly values: readonly ListboxKey[];
  readonly items: readonly unknown[];
  readonly pointerId: number;
  readonly pointerType: string;
  readonly startX: number;
  readonly startY: number;
  readonly label: string;
  /** Fires `onItemDragStart`; the event's `preventDefault()` cancels. */
  onDragStart(event: { values: readonly ListboxKey[]; items: readonly unknown[]; source: 'pointer' | 'touch'; preventDefault(): void; readonly defaultPrevented: boolean }): void;
  /** The drag passed the threshold and was not cancelled. */
  onStart(): void;
  /** Rate-limited by the drag chunk to one call per frame. */
  onDrag(event: { values: readonly ListboxKey[]; clientX: number; clientY: number; overGroup: string | null; toIndex: number | null }): void;
  /** Called once when the drag ends (dropped or cancelled). */
  onEnd(): void;
}

/** Registered drop targets by list element. */
export const dropTargets: WeakMap<Element, ListboxDropTarget> = new WeakMap();
