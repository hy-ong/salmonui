// Column model of the `Combobox columns` popup (MultiColumn ComboBox): the Data Grid column vocabulary, a small subset of
// it. Kept out of the lazy grid chunk because sorting runs in the
// collection view (initial chunk) while the table rendering is lazy.

import type { CSSProperties, ReactNode } from 'react';
import type { SortDescriptor } from '@salmonui/core/data';

export interface ComboboxColumn<Item> {
  /** Item field shown in the column; also the sort key and `searchFields` name. */
  readonly field: string;
  readonly header?: string;
  /** Pixels or a percentage string (`'40%'`). */
  readonly width?: number | `${number}%`;
  readonly align?: 'start' | 'end' | 'center';
  /** `Intl` options (numbers, dates) or a formatter. */
  readonly format?: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions | ((value: unknown, item: Item) => string);
  readonly renderCell?: (props: { readonly item: Item; readonly value: unknown; readonly text: string }) => ReactNode;
  readonly renderHeader?: (props: { readonly column: ComboboxColumn<Item> }) => ReactNode;
  /** Shows a boolean value as a checkbox mark. */
  readonly displayAsCheckbox?: boolean;
  /** Extra props for every cell of the column. */
  readonly cellProps?: { readonly className?: string | undefined; readonly style?: CSSProperties | undefined; readonly [data: `data-${string}`]: string | number | boolean | undefined } | ((item: Item) => { readonly className?: string | undefined; readonly style?: CSSProperties | undefined } | undefined);
  /** Header click sorting for this column. Default `true`. */
  readonly sortable?: boolean;
}

export interface ComboboxSort {
  /** Ctrl / Cmd + click adds a sort level. */
  readonly multiple?: boolean;
  /** Initial and reactive sort. `columnId` is the column `field`. */
  readonly sortBy?: readonly SortDescriptor[];
}

export function fieldValue<Item>(item: Item, field: string): unknown {
  return item == null ? undefined : (item as Record<string, unknown>)[field];
}

/** Comparator for the sort levels: numbers and dates numerically, text with `Intl.Collator`. */
export function compareBy<Item>(sortBy: readonly SortDescriptor[], columns: readonly ComboboxColumn<Item>[]): (a: Item, b: Item) => number {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const levels = sortBy.filter((s) => columns.some((c) => c.field === s.columnId));
  return (a, b) => {
    for (const s of levels) {
      const x = fieldValue(a, s.columnId);
      const y = fieldValue(b, s.columnId);
      let r: number;
      if (x == null || y == null) r = x == null ? (y == null ? 0 : -1) : 1;
      else if (typeof x === 'number' && typeof y === 'number') r = x - y;
      else if (x instanceof Date && y instanceof Date) r = x.getTime() - y.getTime();
      else if (typeof x === 'boolean' && typeof y === 'boolean') r = Number(x) - Number(y);
      else r = collator.compare(String(x), String(y));
      if (r !== 0) return s.direction === 'desc' ? -r : r;
    }
    return 0;
  };
}

/** Next sort list after a header click: ascending, descending, none; `add` keeps the other levels. */
export function nextSort(sortBy: readonly SortDescriptor[], field: string, add: boolean): SortDescriptor[] {
  const current = sortBy.find((s) => s.columnId === field);
  const rest = add ? sortBy.filter((s) => s.columnId !== field) : [];
  if (!current) return [...rest, { columnId: field, direction: 'asc' }];
  if (current.direction === 'asc') return add ? sortBy.map((s) => (s.columnId === field ? { columnId: field, direction: 'desc' as const } : s)) : [{ columnId: field, direction: 'desc' }];
  return rest;
}
