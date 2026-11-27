// SidebarMenu model: pure functions over the `items`
// array, no React and no DOM, so they run on the server and in Node tests.
// One walk builds the index (parent, level, item) that selection, expansion
// and the rail flyouts read.

import type { ReactNode } from 'react';

/** A link, an action or a submenu. */
export interface SidebarMenuItem {
  /** Stable, unique id (the selection and expansion key). */
  readonly id: string;
  readonly label: ReactNode;
  /** Plain text of `label` when it is not a string: the rail fallback icon and development messages. */
  readonly textValue?: string | undefined;
  /** Decorative icon (`aria-hidden`); in the collapsed rail it is all that shows. */
  readonly icon?: ReactNode;
  /** Renders a link (through `renderLink` when given). Ignored on an item with `children`. */
  readonly href?: string | undefined;
  /** Nested items: the item becomes a disclosure button for a submenu. */
  readonly children?: readonly SidebarMenuItem[] | undefined;
  readonly disabled?: boolean | undefined;
  /** Trailing content (a count, a status dot); part of the accessible name. */
  readonly badge?: ReactNode;
  readonly type?: 'item' | undefined;
}

/** A non-collapsible heading over a list of items. */
export interface SidebarMenuGroup {
  readonly type: 'group';
  readonly id: string;
  readonly label: ReactNode;
  readonly textValue?: string | undefined;
  readonly children: readonly SidebarMenuItem[];
}

/** An entry of `items`: groups only at the top level. */
export type SidebarMenuEntry = SidebarMenuItem | SidebarMenuGroup;

export interface SidebarMenuNode {
  readonly item: SidebarMenuItem;
  /** Nearest submenu ancestor's id (groups do not count). */
  readonly parentId: string | null;
  /** 1 for top-level items (inside a group or not), 2 for their children, ... */
  readonly level: number;
}

export interface SidebarMenuIndex {
  readonly nodes: ReadonlyMap<string, SidebarMenuNode>;
  /** Ids of every item with children, in document order. */
  readonly branches: readonly string[];
}

export const isGroup = (entry: SidebarMenuEntry): entry is SidebarMenuGroup => entry.type === 'group';

/** Walks `items` once. Duplicate ids keep the first occurrence (the component warns in development). */
export function indexSidebarMenu(items: readonly SidebarMenuEntry[]): SidebarMenuIndex & { readonly duplicates: readonly string[] } {
  const nodes = new Map<string, SidebarMenuNode>();
  const branches: string[] = [];
  const duplicates: string[] = [];
  const walk = (list: readonly SidebarMenuItem[], parentId: string | null, level: number): void => {
    for (const item of list) {
      if (nodes.has(item.id)) duplicates.push(item.id);
      else nodes.set(item.id, { item, parentId, level });
      if (item.children?.length) {
        branches.push(item.id);
        walk(item.children, item.id, level + 1);
      }
    }
  };
  for (const entry of items) {
    if (isGroup(entry)) walk(entry.children, null, 1);
    else walk([entry], null, 1);
  }
  return { nodes, branches, duplicates };
}

/** Submenu ids that contain `id`, outermost first. */
export function ancestorsOf(index: SidebarMenuIndex, id: string | null | undefined): string[] {
  const out: string[] = [];
  let node = id == null ? undefined : index.nodes.get(id);
  while (node?.parentId != null) {
    out.unshift(node.parentId);
    node = index.nodes.get(node.parentId);
  }
  return out;
}

/** The uncontrolled starting expansion: `'all'`, the given ids, or the submenus around the selected item. */
export function initialExpanded(index: SidebarMenuIndex, defaultExpanded: readonly string[] | 'all' | undefined, selected: string | null | undefined): readonly string[] {
  if (defaultExpanded === 'all') return index.branches;
  if (defaultExpanded) return defaultExpanded;
  return ancestorsOf(index, selected);
}

/** `ids` plus the submenus around `selected` (a new selection reveals itself); the same array when nothing is added. */
export function revealSelected(index: SidebarMenuIndex, ids: readonly string[], selected: string | null | undefined): readonly string[] {
  const missing = ancestorsOf(index, selected).filter((id) => !ids.includes(id));
  return missing.length ? [...ids, ...missing] : ids;
}

/** `ids` with `id` toggled to `open`. */
export function toggleExpanded(ids: readonly string[], id: string, open: boolean): readonly string[] {
  const has = ids.includes(id);
  if (open === has) return ids;
  return open ? [...ids, id] : ids.filter((x) => x !== id);
}

/** Plain text of an entry: `textValue`, else a string or number label, else ''. */
export function textOf(entry: { readonly label: ReactNode; readonly textValue?: string | undefined }): string {
  if (entry.textValue !== undefined) return entry.textValue;
  return typeof entry.label === 'string' || typeof entry.label === 'number' ? String(entry.label) : '';
}

/** The rail's fallback icon for an item without one: its first character (a whole grapheme for surrogate pairs). */
export function initialOf(text: string): string {
  const first = Array.from(text.trim())[0];
  return first ? first.toLocaleUpperCase() : '';
}

/** Index of the next focus target for a navigation key over `count` items, or -1 (no move). */
export function moveIndex(key: string, current: number, count: number): number {
  if (count === 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return Math.min(current + 1, count - 1);
    case 'ArrowUp':
      return Math.max(current - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return -1;
  }
}
