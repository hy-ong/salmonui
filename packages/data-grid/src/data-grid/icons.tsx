'use client';

// DataGrid icons. The built-in icons are SVG masks in the grid CSS
// (`currentColor`, mirrored in RTL, zero DOM nodes), so the default path
// renders no icon markup at all. The `icons` prop (or `DataGridIconsProvider`)
// replaces a built-in with any node: the host element gets
// `data-custom-icon` (which hides the CSS icon) and the node as its child.
// Icons are a component prop, not a theme input: the theme stays colors-only.
// The value is plain render data, so the server and the hydrating client
// render the same markup.

import { createContext, use, useMemo, type ReactNode } from 'react';

/** Every icon the grid renders. */
export type DataGridIconName =
  /** Header and group chip sort direction. */
  | 'sortAscending'
  | 'sortDescending'
  /** Header filter menu button. */
  | 'filter'
  /** Header marker of a filtered column without a filter button. */
  | 'filtered'
  /** Header column menu button. */
  | 'columnMenu'
  /** Header group-by toggle (`grouping.showHeaderToggle`). */
  | 'groupByColumn'
  /** Remove button of a group-by chip. */
  | 'ungroup'
  /** Group caption and detail row toggles: shown when the row is expanded / collapsed. */
  | 'expanded'
  | 'collapsed'
  /** Pager navigation buttons. */
  | 'pagerFirst'
  | 'pagerPrevious'
  | 'pagerNext'
  | 'pagerLast'
  /** Menu item with a submenu. */
  | 'submenu'
  /** Checked menu item. */
  | 'check'
  /** Close button of dialogs and sheets. */
  | 'close'
  /** Toolbar overflow button. */
  | 'overflow'
  /** Row drag handle (`rowDrag`). */
  | 'dragHandle';

/**
 * Icon overrides. A node replaces the built-in icon (it is rendered inside the
 * control, which keeps its accessible name, so make the node decorative);
 * `null` hides the icon; a missing key keeps the built-in.
 */
export type DataGridIcons = Partial<Record<DataGridIconName, ReactNode>>;

const DataGridIconsContext = createContext<DataGridIcons | undefined>(undefined);

/**
 * Supplies icon overrides to every `DataGrid` below it (for example one icon set
 * for an application). Nested providers and a grid's `icons` prop merge over
 * the outer ones, key by key.
 */
export function DataGridIconsProvider(props: { readonly icons: DataGridIcons | undefined; readonly children?: ReactNode }): ReactNode {
  const outer = use(DataGridIconsContext);
  const own = props.icons;
  const value = useMemo(() => (own && outer ? { ...outer, ...own } : (own ?? outer)), [outer, own]);
  return <DataGridIconsContext value={value}>{props.children}</DataGridIconsContext>;
}

/** The active overrides (undefined when none): read once per component, then index by name. */
export function useDataGridIcons(): DataGridIcons | undefined {
  return use(DataGridIconsContext);
}

/** `data-custom-icon` value for a host: `''` when the icon is overridden, else undefined (no attribute). */
export function customIcon(icons: DataGridIcons | undefined, name: DataGridIconName): '' | undefined {
  return icons !== undefined && icons[name] !== undefined ? '' : undefined;
}
