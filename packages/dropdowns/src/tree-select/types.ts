// Public prop types of TreeSelect: the Select props for the trigger, value and popup plus the
// TreeView data and expansion props.

import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import type { DropdownEventSource, DropdownLocaleText, DropdownOpenChangeEvent, DropdownPartProps, DropdownValueChangeEvent } from '../dropdown/types.js';

/** A node value (what `getItemValue` returns): a string or a number. */
export type TreeSelectValue = string | number;
type DropdownValue = TreeSelectValue;

export type TreeSelectPart = 'root' | 'trigger' | 'value' | 'chip' | 'popup' | 'tree' | 'item' | 'search';

/** Static texts (`TREE_SELECT_DEFAULT_LOCALE_TEXT` holds the defaults). */
export interface TreeSelectLocaleText extends DropdownLocaleText {
  /** Status text of a node whose children are loading. */
  readonly loadingChildren: string;
}

export interface TreeSelectItemRenderProps<Item> {
  readonly item: Item;
  readonly label: string;
  readonly level: number;
  readonly selected: boolean;
  /** `true`, `false` or `'mixed'` with `indicator="checkbox"`. */
  readonly checked: boolean | 'mixed';
  readonly expanded: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  /** `[start, end)` offsets of the matched text in `label` while searching. */
  readonly matches: readonly (readonly [number, number])[];
}

export interface TreeSelectExpandedChangeEvent<Item> {
  /** The node that was expanded or collapsed, or `null` for several at once. */
  readonly id: DropdownValue | null;
  readonly item: Item | undefined;
  readonly source: DropdownEventSource;
}

/** `'auto'`: a click on a non-selectable parent toggles it; `'click'`: a click on any parent toggles it (Enter or Space selects); `'doubleClick'`: double-click toggles; `'none'`: only the twisty and the arrow keys. */
export type TreeSelectExpandOn = 'auto' | 'click' | 'doubleClick' | 'none';

interface TreeSelectOwnProps<Item> extends Omit<HTMLAttributes<HTMLElement>, 'defaultValue' | 'onChange' | 'children' | 'className' | 'style' | 'id' | 'role' | 'placeholder' | 'autoFocus'> {
  /** Items: nested (`getChildren`) or flat (`getParentId`). */
  readonly data: readonly Item[];
  /** Default: `item.value`, or `item.id` when there is no `value` field. */
  readonly getItemValue?: (item: Item) => DropdownValue;
  /** Default: `item.label`, else `item.text`, else the value. */
  readonly getItemLabel?: (item: Item) => string;
  /** Nested data: the children of an item. Default `item.children`. */
  readonly getChildren?: (item: Item) => readonly Item[] | null | undefined;
  /** Flat (self-referential) data: the parent value of an item; replaces `getChildren`. */
  readonly getParentId?: (item: Item) => DropdownValue | null | undefined;
  /** Shows an expand twisty before the children are known; expanding then calls `loadChildren`. */
  readonly hasChildren?: (item: Item) => boolean;
  /** Load on demand: the children of `item` (aborted through `signal` when stale). */
  readonly loadChildren?: (item: Item, options: { readonly signal: AbortSignal }) => Promise<readonly Item[]>;
  readonly onLoadError?: (error: unknown, item: Item) => void;
  /** Default: `item.disabled === true`. A disabled parent disables its subtree. */
  readonly isItemDisabled?: (item: Item) => boolean;
  /** Nodes that cannot be chosen still expand (default: every enabled node). */
  readonly isItemSelectable?: (item: Item) => boolean;
  readonly getItemIcon?: (item: Item) => ReactNode;
  /** Pure per-item props merged onto the rendered `treeitem` (`title`, `data-*`, `className`, `style`). */
  readonly getItemProps?: (item: Item) => (DropdownPartProps & { readonly title?: string | undefined }) | undefined;
  /** Items of the current value that are not in loaded `data` (lazily loaded nodes): their labels. */
  readonly selectedItems?: readonly Item[];

  readonly expanded?: readonly DropdownValue[];
  readonly defaultExpanded?: readonly DropdownValue[];
  readonly onExpandedChange?: (expanded: readonly DropdownValue[], event: TreeSelectExpandedChangeEvent<Item>) => void;
  readonly expandOn?: TreeSelectExpandOn;

  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean, event: DropdownOpenChangeEvent) => void;
  /** `'popover'` (default), `'sheet'` (full-screen dialog) or `'auto'` (the sheet on coarse-pointer phones, decided at open time). */
  readonly popupMode?: 'popover' | 'sheet' | 'auto';

  /** A search field in the popup; matches keep their ancestors visible. */
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly searchOperator?: 'startsWith' | 'contains' | 'endsWith' | ((item: Item, text: string) => boolean);
  readonly matchCase?: boolean;
  readonly ignoreAccents?: boolean;
  readonly onSearchChange?: (text: string, event: { readonly source: DropdownEventSource }) => void;

  /** `'checkbox'` (with `multiple`): tri-state checks; the value is every checked node. */
  readonly indicator?: 'check' | 'checkbox';
  /** Checks of a parent and its descendants follow each other (default `'cascade'`). */
  readonly checkPropagation?: 'cascade' | 'none';
  readonly showSelectAll?: boolean;
  readonly closeOnSelect?: boolean;
  readonly valueDisplay?: 'text' | 'chips' | 'count';
  readonly maxVisibleValues?: number;
  readonly valueSeparator?: string;
  readonly showTrigger?: boolean;
  readonly clearable?: boolean;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly name?: string;
  readonly required?: boolean;
  readonly form?: string;
  readonly id?: string;
  readonly autoFocus?: boolean;
  /** Popup height in rows. Default 8. */
  readonly maxVisibleItems?: number;
  /** Windowed tree; on by default above 100 visible rows. */
  readonly virtualization?: boolean;
  readonly locale?: string;

  readonly renderItem?: (props: TreeSelectItemRenderProps<Item>) => ReactNode;
  readonly renderValue?: (props: { readonly items: readonly Item[]; readonly labels: readonly string[] }) => ReactNode;
  readonly renderEmpty?: (props: { readonly reason: 'noData' | 'noMatch' }) => ReactNode;
  readonly renderError?: (props: { readonly error: unknown; readonly item: Item; readonly retry: () => void }) => ReactNode;
  readonly renderLoading?: (props: { readonly item: Item }) => ReactNode;
  readonly popupHeader?: ReactNode;
  readonly popupFooter?: ReactNode;
  readonly highlightMatches?: boolean;

  /** Control size: `'sm'` 24px, `'md'` 32px (default), `'lg'` 40px tall. */
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly localeText?: Partial<TreeSelectLocaleText>;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: Partial<Record<TreeSelectPart, string>>;
  readonly styles?: Partial<Record<TreeSelectPart, CSSProperties>>;
  /** The trigger `<button role="combobox">`. */
  readonly ref?: Ref<HTMLButtonElement>;
}

export interface TreeSelectSingleProps<Item> extends TreeSelectOwnProps<Item> {
  readonly multiple?: false;
  readonly value?: DropdownValue | null;
  readonly defaultValue?: DropdownValue | null;
  readonly onValueChange?: (value: DropdownValue | null, event: DropdownValueChangeEvent<Item>) => void;
}

export interface TreeSelectMultipleProps<Item> extends TreeSelectOwnProps<Item> {
  readonly multiple: true;
  readonly value?: readonly DropdownValue[];
  readonly defaultValue?: readonly DropdownValue[];
  readonly onValueChange?: (value: readonly DropdownValue[], event: DropdownValueChangeEvent<Item>) => void;
}

export type TreeSelectProps<Item = unknown> = TreeSelectSingleProps<Item> | TreeSelectMultipleProps<Item>;
