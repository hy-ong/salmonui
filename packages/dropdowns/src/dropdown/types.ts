// Public prop types shared by Select and Combobox. Each component re-exports them under its own
// prefix (`SelectProps`, `ComboboxProps`).

import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import type { CollectionKey } from '../internal/collection/collection.js';
import type { RemoteQuery, RemoteSource as SharedRemoteSource } from '../internal/collection/remote.js';

/** A selectable value: what `getItemValue` returns and what `value` holds. */
export type DropdownValue = CollectionKey;

/** A named operator or a predicate over the item and the raw search text. */
export type SearchOperator<Item = unknown> = 'startsWith' | 'contains' | 'endsWith' | ((item: Item, text: string) => boolean);

/** Base query merged into every remote read (filters and sort of the `@salmonui/data` query model). */
export type DropdownQuery = RemoteQuery;

/** A remote `data`: any `@salmonui/data` source (the structural `read` of `DataSource`). */
export type RemoteSource<Item> = SharedRemoteSource<Item>;

/** How a change was made. */
export type DropdownEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

export type DropdownValueChangeReason = 'select' | 'deselect' | 'clear' | 'remove' | 'add' | 'create' | 'selectAll' | 'reset';

export type DropdownOpenChangeReason = 'trigger' | 'keyboard' | 'type' | 'select' | 'escape' | 'outside' | 'tab' | 'blur';

/** Second argument of `onValueChange`: frozen, read-only. `items` is materialized on first read. */
export interface DropdownValueChangeEvent<Item> {
  readonly source: DropdownEventSource;
  readonly reason: DropdownValueChangeReason;
  readonly previousValue: readonly DropdownValue[];
  /** Items of the new value (loaded data, `selectedItems` or created items); computed on first read. */
  readonly items: readonly Item[];
}

export interface DropdownOpenChangeEvent {
  readonly source: DropdownEventSource;
  readonly reason: DropdownOpenChangeReason;
}

export interface DropdownSearchChangeEvent {
  readonly source: DropdownEventSource;
}

export interface DropdownItemRenderProps<Item> {
  readonly item: Item;
  readonly label: string;
  readonly selected: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  /** `[start, end)` offsets of the matched text in `label` (with `highlightMatches` or a search). */
  readonly matches: readonly (readonly [number, number])[];
}

export interface DropdownChipRenderProps<Item> {
  readonly item: Item;
  readonly label: string;
  readonly remove: () => void;
  readonly disabled: boolean;
}

/** Pure per-item props merged onto the rendered option or chip (rendered items only). */
export interface DropdownPartProps {
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly [data: `data-${string}`]: string | number | boolean | undefined;
}

export type DropdownPart = 'root' | 'trigger' | 'input' | 'value' | 'popup' | 'list' | 'option' | 'group' | 'chip' | 'search';

/** Static texts; every value has an exported default (`SELECT_DEFAULT_LOCALE_TEXT`). */
export interface DropdownLocaleText {
  readonly noResults: string;
  readonly noData: string;
  readonly loading: string;
  readonly loadError: string;
  readonly retry: string;
  readonly selectAll: string;
  readonly deselectAll: string;
  readonly clear: string;
  readonly removeValue: (label: string) => string;
  readonly selectedCount: (count: number, plural: Intl.LDMLPluralRule) => string;
  readonly moreValues: (count: number) => string;
  readonly resultCount: (count: number, plural: Intl.LDMLPluralRule) => string;
  readonly limitReached: (max: number) => string;
  readonly search: string;
  readonly close: string;
  readonly toggle: string;
  readonly selectedValues: string;
  readonly create: (text: string) => string;
}

/** Props shared by `Select` and `Combobox`. */
export interface DropdownCommonProps<Item> {
  /** Items (objects or primitives) or an `@salmonui/data` source. */
  readonly data: readonly Item[] | RemoteSource<Item>;
  readonly getItemValue?: (item: Item) => DropdownValue;
  readonly getItemLabel?: (item: Item) => string;
  readonly getItemGroup?: (item: Item) => string | null | undefined;
  readonly getItemIcon?: (item: Item) => ReactNode;
  readonly isItemDisabled?: (item: Item) => boolean;
  /** Items of the current value that are not in loaded `data` (remote data, server labels). */
  readonly selectedItems?: readonly Item[];

  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean, event: DropdownOpenChangeEvent) => void;

  readonly searchOperator?: SearchOperator<Item>;
  /** Case-sensitive search. Default `false`. */
  readonly matchCase?: boolean;
  /** Diacritics-insensitive search. Default `false`. */
  readonly ignoreAccents?: boolean;
  /** Remote search delay in ms (local data filters on every keystroke). Default 300. */
  readonly debounce?: number;
  readonly minSearchLength?: number;
  readonly maxResults?: number;
  /** Fields searched by a remote source (`query.search.columnIds`); default every field. */
  readonly searchFields?: readonly string[];
  /** Base query merged into every remote read. */
  readonly query?: DropdownQuery;

  /** Windowed list; `true` by default above 100 items. */
  readonly virtualization?: boolean;
  /** Popup height in items. Default 8. */
  readonly maxVisibleItems?: number;
  /** `'popover'` (default) anchors the popup; `'sheet'` is a full-screen dialog; `'auto'` picks the sheet on coarse-pointer phones at open time. */
  readonly popupMode?: 'popover' | 'sheet' | 'auto';

  readonly clearable?: boolean;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly name?: string;
  readonly required?: boolean;
  readonly form?: string;
  readonly id?: string;
  readonly autoFocus?: boolean;

  readonly indicator?: 'check' | 'checkbox';
  readonly showSelectAll?: boolean;
  readonly maxSelected?: number;
  readonly groupSelection?: boolean;
  readonly hideSelected?: boolean;
  readonly closeOnSelect?: boolean;
  readonly maxVisibleValues?: number;
  /** Separator of `valueDisplay="text"`; default `Intl.ListFormat` of `locale`. */
  readonly valueSeparator?: string;
  /** BCP 47 locale for list and plural formatting. Default `'en-US'` (identical on server and client). */
  readonly locale?: string;

  readonly renderItem?: (props: DropdownItemRenderProps<Item>) => ReactNode;
  readonly renderValue?: (props: { readonly items: readonly Item[]; readonly labels: readonly string[] }) => ReactNode;
  readonly renderChip?: (props: DropdownChipRenderProps<Item>) => ReactNode;
  readonly renderGroupHeader?: (props: { readonly group: string }) => ReactNode;
  readonly renderEmpty?: (props: { readonly reason: 'noData' | 'noMatch' }) => ReactNode;
  readonly renderError?: (props: { readonly error: unknown; readonly retry: () => void }) => ReactNode;
  readonly renderLoading?: () => ReactNode;
  readonly popupHeader?: ReactNode;
  readonly popupFooter?: ReactNode;
  readonly getItemProps?: (item: Item) => DropdownPartProps | undefined;
  readonly getChipProps?: (item: Item) => DropdownPartProps | undefined;
  /** Marks the matched characters with `<mark>`. */
  readonly highlightMatches?: boolean;

  /** Forces the loading state (set automatically while a remote read is pending). */
  readonly loading?: boolean;
  readonly onLoadError?: (error: unknown) => void;

  /** Control size: `'sm'` 24px, `'md'` 32px (default), `'lg'` 40px tall. */
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly localeText?: Partial<DropdownLocaleText>;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: Partial<Record<DropdownPart, string>>;
  readonly styles?: Partial<Record<DropdownPart, CSSProperties>>;
}

/**
 * Field parts of `Select` and `Combobox` (the `TextField` names): a visible
 * label, a description and an error message around the control, wired with
 * `aria-labelledby` / `aria-describedby` / `aria-errormessage`. Without any
 * of them the markup is the bare control.
 */
export interface DropdownFieldProps {
  /** Visible label above the control; names it through `aria-labelledby` (an explicit `aria-labelledby` prop wins). */
  readonly label?: ReactNode;
  /** Help text below the control, referenced by `aria-describedby`. */
  readonly description?: ReactNode;
  /** Error text below the control, shown while `invalid`. */
  readonly errorMessage?: ReactNode;
  /** Marks the control invalid: `aria-invalid`, `data-invalid` and the visible `errorMessage`. */
  readonly invalid?: boolean | undefined;
}

/** DOM props forwarded to the focusable element. */
export type DropdownDomProps = Omit<HTMLAttributes<HTMLElement>, 'defaultValue' | 'onChange' | 'children' | 'className' | 'style' | 'id' | 'role' | 'placeholder' | 'autoFocus'>;

export type DropdownRef = Ref<HTMLElement>;
