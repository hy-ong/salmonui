import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import type { DataSourceRequest, DataSourceResult, FilterEntry, SortDescriptor } from '@salmonui/core/data';
import type { ListboxLocaleText } from './locale.js';

/** An item value: one stable, unique key per item (`getItemValue`). */
export type ListboxKey = string | number | boolean;

/** Where a change came from. */
export type ListboxEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Why the value changed. */
export type ListboxValueChangeReason = 'select' | 'deselect' | 'selectAll' | 'clear' | 'reset';

/** Second argument of `onValueChange`: frozen, read-only. */
export interface ListboxValueChangeEvent<T> {
  readonly reason: ListboxValueChangeReason;
  readonly source: ListboxEventSource;
  /** The items of the new value that are loaded (materialized on first read). */
  readonly items: readonly T[];
  readonly previousValue: ListboxKey | readonly ListboxKey[] | null;
}

/**
 * A remote list: any `@salmonui/data` source (`createJsonDataSource`,
 * `createOfflineDataSource`, ...). Reads use the search text, a `range`, and
 * `totalRowCount`.
 */
export interface ListboxDataSource<T> {
  read(request: DataSourceRequest): DataSourceResult<T> | Promise<DataSourceResult<T>>;
}

/** Base query merged into every remote read. */
export interface ListboxQuery {
  readonly filters?: readonly FilterEntry[];
  readonly sorting?: readonly SortDescriptor[];
}

/** Built-in search operators, or a predicate over the item and the search text. */
export type ListboxSearchOperator<T> = 'startsWith' | 'contains' | 'endsWith' | ((item: T, text: string) => boolean);

/** A `[start, end)` range of the label matched by the search text. */
export type ListboxMatchRange = readonly [start: number, end: number];

/** `renderItem` argument. */
export interface ListboxItemState<T> {
  readonly item: T;
  readonly value: ListboxKey;
  readonly label: string;
  readonly selected: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  /** Highlight ranges of the search text in `label` (with `highlightMatches`). */
  readonly matches: readonly ListboxMatchRange[];
}

/** Pure per-item props from `getItemProps` (rendered items only). */
export interface ListboxItemProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly title?: string;
  readonly [dataAttribute: `data-${string}`]: string | number | boolean | undefined;
}

/** Part names of `classNames` / `styles`. */
export type ListboxPart = 'root' | 'search' | 'selectAll' | 'list' | 'option' | 'group' | 'groupHeader' | 'empty';

/** `onReorder` argument: the application applies it to its `data` (`reorderItems` / `moveItems`). */
export interface ListboxReorderEvent<T> {
  readonly values: readonly ListboxKey[];
  readonly items: readonly T[];
  /** Insertion index in the current `data` (before the moved items are removed), as `moveItems` takes it. */
  readonly toIndex: number;
  /** `-1` / `1` for a keyboard step (Alt+Up / Alt+Down), as `reorderItems` takes it. */
  readonly delta: number | null;
  readonly source: ListboxEventSource;
}

/** `onItemDragStart` argument; `preventDefault()` cancels the drag. */
export interface ListboxDragStartEvent<T> {
  readonly values: readonly ListboxKey[];
  readonly items: readonly T[];
  readonly source: ListboxEventSource;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** `onItemDrag` argument, at most once per animation frame. */
export interface ListboxDragEvent {
  readonly values: readonly ListboxKey[];
  readonly clientX: number;
  readonly clientY: number;
  /** `dragGroup` of the list under the pointer, or null outside any accepting list. */
  readonly overGroup: string | null;
  readonly toIndex: number | null;
}

/** `onItemDrop` argument, fired on the receiving list. */
export interface ListboxDropEvent<T> {
  readonly values: readonly ListboxKey[];
  /** The dragged items, from the source list's `data`. */
  readonly items: readonly T[];
  /** `id` of the source list (the `id` prop, or a generated id). */
  readonly fromList: string;
  readonly dragGroup: string;
  /** Insertion index in this list's `data`. */
  readonly toIndex: number;
  readonly source: ListboxEventSource;
}

type ListboxDomProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'children' | 'className' | 'style' | 'role' | 'onDrag' | 'onDrop' | 'onDragStart'>;

/** Props shared by single and multiple `Listbox`. */
export interface ListboxBaseProps<T> extends ListboxDomProps {
  /** Items (an array, never copied), or a remote `@salmonui/data` source. */
  readonly data: readonly T[] | ListboxDataSource<T>;
  /** Default: a primitive is its own value; objects read `value`. Keep accessors stable (module scope or `useCallback`). */
  readonly getItemValue?: (item: T) => ListboxKey;
  /** Default: a primitive is its own label; objects read `label`. */
  readonly getItemLabel?: (item: T) => string;
  /** Default: objects read `group`. Items of one group must be contiguous. */
  readonly getItemGroup?: (item: T) => string | null | undefined;
  readonly getItemIcon?: (item: T) => ReactNode;
  /** Default: objects read `disabled`. Evaluated on render (reactive). */
  readonly isItemDisabled?: (item: T) => boolean;
  /**
   * `'grid'`: the APG Grid pattern (`role="grid"`, rows of `columns` cells)
   * for items holding their own controls, and tile galleries. Tab and the
   * arrow keys reach the active cell's controls; selection does not follow
   * focus. No group headers or reordering. Default `'list'`.
   */
  readonly layout?: 'list' | 'grid';
  /** Items per row with `layout="grid"`. Default 1. */
  readonly columns?: number;
  /** Marker of selected options. Default `'check'`. */
  readonly indicator?: 'check' | 'checkbox';
  /** Side of the marker: `'start'` (default) or `'end'`, logical so it mirrors in RTL. */
  readonly indicatorPosition?: 'start' | 'end';
  /** Tri-state "select all" checkbox above the list (`multiple`). */
  readonly showSelectAll?: boolean;
  /** Most values `multiple` may hold; further options become unavailable. */
  readonly maxSelected?: number;
  /** A search field above the list filters it. */
  readonly searchable?: boolean;
  /** Default `'startsWith'`. */
  readonly searchOperator?: ListboxSearchOperator<T>;
  readonly matchCase?: boolean;
  readonly ignoreAccents?: boolean;
  readonly searchPlaceholder?: string;
  /** Fires when the search text changes. */
  readonly onSearchChange?: (event: { readonly text: string }) => void;
  /** Remote search debounce in ms. Default 300; local data filters on every keystroke. */
  readonly debounce?: number;
  /** Remote: searches shorter than this send no request. */
  readonly minSearchLength?: number;
  /** Caps the number of listed items. */
  readonly maxResults?: number;
  /** Remote: base filters and sort merged into every read. */
  readonly query?: ListboxQuery;
  /** Remote: fields the search text runs over. Default `['label']`. */
  readonly searchFields?: readonly string[];
  /** Virtual list (fixed item height). Default: on above 100 items. */
  readonly virtualization?: boolean;
  /** List height in items. Default 8. */
  readonly maxVisibleItems?: number;
  /** Mark the search text in labels (`<mark>`). */
  readonly highlightMatches?: boolean;
  readonly renderItem?: (state: ListboxItemState<T>) => ReactNode;
  readonly renderGroupHeader?: (state: { readonly group: string }) => ReactNode;
  readonly renderEmpty?: (state: { readonly reason: 'noData' | 'noMatch' }) => ReactNode;
  readonly renderError?: (state: { readonly error: unknown; readonly retry: () => void }) => ReactNode;
  readonly renderLoading?: () => ReactNode;
  readonly getItemProps?: (item: T, state: { readonly selected: boolean; readonly disabled: boolean }) => ListboxItemProps | undefined;
  /** Remote: called when a read fails. */
  readonly onLoadError?: (error: unknown) => void;
  /** Forces the busy state (`aria-busy`); set automatically while a remote read is pending. */
  readonly loading?: boolean;
  /** Form field name: renders a hidden native `<select>` that submits the value. */
  readonly name?: string;
  readonly required?: boolean;
  readonly form?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  /** Alt+Up / Alt+Down and drag within the list fire `onReorder`. */
  readonly reorderable?: boolean;
  readonly onReorder?: (event: ListboxReorderEvent<T>) => void;
  /** Lists with the same group accept each other's items by drag and drop. */
  readonly dragGroup?: string;
  readonly onItemDragStart?: (event: ListboxDragStartEvent<T>) => void;
  readonly onItemDrag?: (event: ListboxDragEvent) => void;
  readonly onItemDrop?: (event: ListboxDropEvent<T>) => void;
  readonly localeText?: Partial<ListboxLocaleText>;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly classNames?: Partial<Record<ListboxPart, string>>;
  readonly styles?: Partial<Record<ListboxPart, CSSProperties>>;
  /** The focusable `role="listbox"` (or `role="grid"` with `layout="grid"`) element. */
  readonly ref?: Ref<HTMLDivElement>;
}

/** Single selection (default). */
export interface ListboxSingleProps<T> extends ListboxBaseProps<T> {
  readonly multiple?: false;
  readonly value?: ListboxKey | null;
  readonly defaultValue?: ListboxKey | null;
  readonly onValueChange?: (value: ListboxKey | null, event: ListboxValueChangeEvent<T>) => void;
}

/** Multiple selection. */
export interface ListboxMultipleProps<T> extends ListboxBaseProps<T> {
  readonly multiple: true;
  readonly value?: readonly ListboxKey[];
  readonly defaultValue?: readonly ListboxKey[];
  readonly onValueChange?: (value: readonly ListboxKey[], event: ListboxValueChangeEvent<T>) => void;
}

export type ListboxProps<T> = ListboxSingleProps<T> | ListboxMultipleProps<T>;
