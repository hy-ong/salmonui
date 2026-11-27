import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react';
import type { TreeViewLocaleText } from './locale.js';

/** An item id (`getItemId`). */
export type TreeViewKey = string | number;

/** What caused an action. */
export type TreeViewEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Where a moved item lands relative to the target. */
export type TreeViewDropPosition = 'before' | 'after' | 'into';

/** A cancellable `onBefore*` event: `preventDefault()` cancels the action. */
export interface TreeViewCancelableEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
  readonly source: TreeViewEventSource;
}

export interface TreeViewBeforeExpandedChangeEvent<T> extends TreeViewCancelableEvent {
  readonly id: TreeViewKey;
  readonly item: T;
  /** The proposed state. */
  readonly expanded: boolean;
}

export interface TreeViewExpandedChangeEvent<T> {
  /** Every expanded id after the change. */
  readonly expanded: readonly TreeViewKey[];
  /** The toggled item; null for `expandAll` / `collapseAll` and `*`. */
  readonly id: TreeViewKey | null;
  readonly item: T | undefined;
  readonly source: TreeViewEventSource;
}

export interface TreeViewBeforeSelectedChangeEvent<T> extends TreeViewCancelableEvent {
  /** The proposed selection. */
  readonly selected: readonly TreeViewKey[];
  /** The item the action started on (null for select all). */
  readonly id: TreeViewKey | null;
  readonly item: T | undefined;
}

export interface TreeViewSelectedChangeEvent<T> {
  readonly selected: readonly TreeViewKey[];
  readonly id: TreeViewKey | null;
  readonly item: T | undefined;
  readonly source: TreeViewEventSource;
}

export interface TreeViewBeforeCheckedChangeEvent<T> extends TreeViewCancelableEvent {
  readonly id: TreeViewKey;
  readonly item: T;
  /** The proposed state of the item (the cascade follows). */
  readonly checked: boolean;
}

export interface TreeViewCheckedChangeEvent<T> {
  /** Every checked id after the change (fully checked parents included, mixed ones not); computed on first read. */
  readonly checked: readonly TreeViewKey[];
  /** The toggled item; null for `checkAll` / `uncheckAll`. */
  readonly id: TreeViewKey | null;
  readonly item: T | undefined;
  readonly source: TreeViewEventSource;
}

export interface TreeViewBeforeRenameEvent<T> extends TreeViewCancelableEvent {
  readonly id: TreeViewKey;
  readonly item: T;
  readonly label: string;
  readonly previousLabel: string;
}

export interface TreeViewRenameEvent<T> {
  readonly id: TreeViewKey;
  readonly item: T;
  readonly label: string;
  readonly previousLabel: string;
  readonly source: TreeViewEventSource;
}

export interface TreeViewBeforeMoveEvent<T> extends TreeViewCancelableEvent {
  readonly ids: readonly TreeViewKey[];
  readonly items: readonly T[];
  readonly targetId: TreeViewKey;
  readonly position: TreeViewDropPosition;
  /** The `id` of the tree the items come from when it is another tree of the same `dragGroup`. */
  readonly sourceTreeId: string | undefined;
}

export interface TreeViewMoveEvent<T> {
  readonly ids: readonly TreeViewKey[];
  /** The moved items (from the source tree). */
  readonly items: readonly T[];
  readonly targetId: TreeViewKey;
  readonly position: TreeViewDropPosition;
  readonly sourceTreeId: string | undefined;
  readonly source: TreeViewEventSource;
}

export interface TreeViewItemClickEvent<T> {
  readonly id: TreeViewKey;
  readonly item: T;
  readonly source: TreeViewEventSource;
}

/** `renderItem` context: the rendered item and its state. */
export interface TreeViewItemContext<T> {
  readonly item: T;
  readonly id: TreeViewKey;
  /** 1-based depth (`aria-level`). */
  readonly level: number;
  readonly label: string;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly checked: boolean | 'mixed';
  readonly disabled: boolean;
  readonly loading: boolean;
  /** The rejection of `loadChildren` for this item, or undefined. */
  readonly error: unknown;
  /** Loads the children again after an error. */
  retry(): void;
}

/** Props a link item passes to `renderLink` (spread them on the link element). */
export interface TreeViewLinkProps {
  readonly href: string;
  readonly className: string;
  readonly tabIndex: -1;
  readonly children: ReactNode;
}

/** `api.getItem(id)`. */
export interface TreeViewItemInfo<T> {
  readonly item: T;
  readonly id: TreeViewKey;
  readonly level: number;
  readonly parentId: TreeViewKey | null;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly checked: boolean | 'mixed';
  readonly disabled: boolean;
  readonly visible: boolean;
}

/** Commands props cannot express (`ref`). */
export interface TreeViewApi<T = unknown> {
  /** Expands the ancestors and scrolls the item into view. */
  scrollToItem(id: TreeViewKey): void;
  /** Scrolls to the item and moves keyboard focus to it. */
  focusItem(id: TreeViewKey): void;
  getItem(id: TreeViewKey): TreeViewItemInfo<T> | undefined;
  /** Expands every item (or `ids`), down to `level` (1-based) when given; one flatten. */
  expandAll(options?: { readonly ids?: readonly TreeViewKey[]; readonly level?: number }): void;
  /** Collapses every item (or `ids`), or the items at `level` and deeper. */
  collapseAll(options?: { readonly ids?: readonly TreeViewKey[]; readonly level?: number }): void;
  checkAll(ids?: readonly TreeViewKey[]): void;
  uncheckAll(ids?: readonly TreeViewKey[]): void;
  getCheckedIds(): TreeViewKey[];
  getSelectedIds(): TreeViewKey[];
  getExpandedIds(): TreeViewKey[];
  /** Opens the inline editor (`renamable`). */
  startRename(id: TreeViewKey): void;
}

type NativeProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'defaultChecked' | 'onSelect' | 'onChange' | 'dir'>;

export interface TreeViewProps<T> extends NativeProps {
  /** Root items. Nested with `getChildren`, or flat with `getParentId`. Application owned: moves and renames are reported, never applied. */
  readonly data: readonly T[];
  /** Stable, unique id of an item (duplicates log a development warning). */
  readonly getItemId: (item: T) => TreeViewKey;
  /** Accessible name, typeahead and sort text. Default: `String(id)`. */
  readonly getItemLabel?: ((item: T) => string) | undefined;
  readonly getChildren?: ((item: T) => readonly T[] | null | undefined) | undefined;
  /** Flat data: the parent id (null or an unknown id makes a root). */
  readonly getParentId?: ((item: T) => TreeViewKey | null | undefined) | undefined;
  /** Shows the expand twisty before children are known; expanding then calls `loadChildren`. */
  readonly hasChildren?: ((item: T) => boolean) | undefined;
  /** Loads the children of an item on its first expand. Reject to show the error state. */
  readonly loadChildren?: ((item: T, options: { readonly signal: AbortSignal }) => Promise<readonly T[]>) | undefined;
  readonly onLoadError?: ((error: unknown, item: T, id: TreeViewKey) => void) | undefined;
  readonly isItemDisabled?: ((item: T) => boolean) | undefined;
  readonly getItemIcon?: ((item: T) => ReactNode) | undefined;
  /** The label renders as a link; a click anywhere on the row follows it. */
  readonly getItemHref?: ((item: T) => string | undefined) | undefined;
  /** Renders link items with another element (a router link); spread the props. */
  readonly renderLink?: ((props: TreeViewLinkProps, item: T) => ReactNode) | undefined;
  /** Extra props for a rendered row (`title`, `className`, `data-*`). Pure; called for rendered rows only. */
  readonly getItemProps?: ((item: T, context: TreeViewItemContext<T>) => (HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>) | undefined) | undefined;
  /** Replaces the label content of a rendered row (inside the link with `getItemHref`); `undefined` keeps the label. Pure; called for rendered rows only. */
  readonly renderItem?: ((context: TreeViewItemContext<T>) => ReactNode) | undefined;

  /** Default `'single'`. */
  readonly selection?: 'none' | 'single' | 'multiple' | undefined;
  /** Selected ids (reactive: applied when the array identity changes). */
  readonly selected?: readonly TreeViewKey[] | undefined;
  readonly onBeforeSelectedChange?: ((event: TreeViewBeforeSelectedChangeEvent<T>) => void) | undefined;
  readonly onSelectedChange?: ((event: TreeViewSelectedChangeEvent<T>) => void) | undefined;
  /** Expanded ids (reactive). */
  readonly expanded?: readonly TreeViewKey[] | undefined;
  readonly onBeforeExpandedChange?: ((event: TreeViewBeforeExpandedChangeEvent<T>) => void) | undefined;
  readonly onExpandedChange?: ((event: TreeViewExpandedChangeEvent<T>) => void) | undefined;
  /** What toggles a parent besides its twisty. `'auto'` (default): double-click with a mouse, tap on touch. */
  readonly expandOn?: 'auto' | 'click' | 'doubleClick' | 'none' | undefined;

  /** Shows tri-state checkboxes (`aria-checked`). */
  readonly checkable?: boolean | undefined;
  /** Checked ids (reactive). */
  readonly checked?: readonly TreeViewKey[] | undefined;
  /** Initial checked ids when `checked` is not given; also the form reset value. */
  readonly defaultChecked?: readonly TreeViewKey[] | undefined;
  readonly onBeforeCheckedChange?: ((event: TreeViewBeforeCheckedChangeEvent<T>) => void) | undefined;
  readonly onCheckedChange?: ((event: TreeViewCheckedChangeEvent<T>) => void) | undefined;
  /** Default `'cascade'`: parents and children follow each other, parents show mixed. */
  readonly checkPropagation?: 'cascade' | 'none' | undefined;
  /** Default true: a cascade also changes disabled descendants. */
  readonly cascadeToDisabled?: boolean | undefined;
  /** A click on the row toggles its check. */
  readonly checkOnClick?: boolean | undefined;
  /** Form field name: one hidden input per checked id. */
  readonly name?: string | undefined;
  /** Associates the hidden inputs with a form by id. */
  readonly form?: string | undefined;

  /** F2 or `api.startRename` opens an inline editor (lazy chunk). */
  readonly renamable?: boolean | undefined;
  readonly onBeforeRename?: ((event: TreeViewBeforeRenameEvent<T>) => void) | undefined;
  readonly onRename?: ((event: TreeViewRenameEvent<T>) => void) | undefined;

  /** Pointer drag and drop (lazy chunk) and keyboard moves (Alt + arrows). */
  readonly draggable?: boolean | undefined;
  /** Trees with the same group exchange items. */
  readonly dragGroup?: string | undefined;
  readonly onBeforeMove?: ((event: TreeViewBeforeMoveEvent<T>) => void) | undefined;
  readonly onMove?: ((event: TreeViewMoveEvent<T>) => void) | undefined;

  readonly onItemClick?: ((event: TreeViewItemClickEvent<T>) => void) | undefined;
  /** Runs before the built-in keys; `event.preventDefault()` skips them. */
  readonly onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;

  /** Siblings sorted by `getItemLabel` with the locale's collator. Default: data order. */
  readonly sort?: 'asc' | 'desc' | null | undefined;
  /** Collator and plural locale. Default: the document language. */
  readonly locale?: string | undefined;
  /** Height of the scroll box (px or CSS length). The server renders the rows that fit a number. */
  readonly height?: number | string | undefined;
  /** Default true: only the rows in view are rendered. */
  readonly virtualize?: boolean | undefined;
  /** Labels wrap; row heights are measured. */
  readonly textWrap?: boolean | undefined;
  /** Default `'full'`: the whole row shows hover and selection. */
  readonly rowHighlight?: 'full' | 'label' | undefined;
  readonly disabled?: boolean | undefined;
  readonly localeText?: Partial<TreeViewLocaleText> | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly ref?: Ref<TreeViewApi<T>> | undefined;
}
