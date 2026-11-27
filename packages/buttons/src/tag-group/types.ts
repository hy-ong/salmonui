// Public types of `@salmonui/buttons/tag-group`,
// plus the type-only contract between a mounted group and the
// lazy drag chunk.

import type { PressSource } from '@salmonui/core/internal/press';

/** Color role of a tag (the Button tones). */
export type TagTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
/** One of three fixed metric sets (the Button sizes). */
export type TagSize = 'sm' | 'md' | 'lg';
export type TagSelectionMode = 'none' | 'single' | 'multiple';
export type TagEventSource = PressSource | 'api';

/** `onValueChange` event: `reason` is `'toggle'` or `'reset'` (form reset). */
export interface TagSelectionEvent {
  readonly source: TagEventSource;
  readonly reason: 'toggle' | 'reset';
}

/** `onRemove` event: the remove button, or Delete / Backspace on the focused tag. */
export interface TagRemoveEvent {
  readonly source: TagEventSource;
  readonly reason: 'button' | 'delete' | 'backspace';
}

/** `onReorder` event; apply it with `moveTags(list, values, toIndex)`. */
export interface TagReorderEvent {
  readonly values: readonly string[];
  /** Insertion index in the current order (before the moved tags are removed). */
  readonly toIndex: number;
  /** `-1` / `1` for a keyboard step (Alt + arrow), null for a drop. */
  readonly delta: number | null;
  readonly source: TagEventSource;
}

/** `onTagDragStart` event; `preventDefault()` cancels the drag. */
export interface TagDragStartEvent {
  readonly values: readonly string[];
  readonly source: TagEventSource;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** `onTagDrag` event, at most once per animation frame. */
export interface TagDragEvent {
  readonly values: readonly string[];
  readonly clientX: number;
  readonly clientY: number;
  /** Insertion index in the group under the pointer, or null outside any accepting group. */
  readonly toIndex: number | null;
  /** `dragGroup` of the group under the pointer (null outside, or a group without one). */
  readonly overGroup: string | null;
}

/** `onTagDragEnd` event on the source group. */
export interface TagDragEndEvent {
  readonly values: readonly string[];
  readonly dropped: boolean;
}

/** `onTagDrop` event, fired on the receiving group of a cross-group drop. */
export interface TagDropEvent {
  readonly values: readonly string[];
  /** `id` of the source group (its `id` prop, or a generated id). */
  readonly fromGroup: string;
  readonly toIndex: number;
  readonly source: TagEventSource;
}

/** Internal: a mounted group as a drop target. */
export interface TagDropTarget {
  readonly id: string;
  readonly group: string | null;
  readonly reorderable: boolean;
  reorder(values: readonly string[], toIndex: number): void;
  receive(values: readonly string[], fromGroup: string, toIndex: number): void;
}

/** Internal: callbacks of one drag session. */
export interface TagDragSession {
  readonly values: readonly string[];
  readonly pointerId: number;
  readonly source: TagEventSource;
  readonly x: number;
  readonly y: number;
  start(event: TagDragStartEvent): void;
  drag(event: TagDragEvent): void;
  end(dropped: boolean): void;
}
