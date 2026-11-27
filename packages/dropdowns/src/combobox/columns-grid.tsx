'use client';

// The `Combobox columns` popup (MultiColumn ComboBox): a lightweight
// `role="grid"` table on the shared fixed-height virtual window, not an
// embedded DataGrid. Rows are the navigable
// unit (`aria-activedescendant` on the row, no cell navigation);
// `aria-rowcount` / `aria-rowindex` describe the virtualized rows. Loaded as a lazy chunk on first open of a `columns` Combobox.

import { useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { SortDescriptor } from '@salmonui/core/data';
import { preventFocusLoss, type DropdownController } from '../dropdown/core.js';
import { useWindow } from '../dropdown/popup.js';
import { fieldValue, nextSort, type ComboboxColumn } from './columns.js';

export interface ColumnsGridProps<Item> {
  readonly ctl: DropdownController<Item>;
  readonly columns: readonly ComboboxColumn<Item>[];
  readonly rowHeight?: number | undefined;
  readonly gridLines: 'default' | 'both' | 'none' | 'horizontal' | 'vertical';
  readonly striped: boolean;
  readonly sortBy: readonly SortDescriptor[];
  readonly sortable: boolean;
  readonly multiSort: boolean;
  readonly onSort: (sortBy: readonly SortDescriptor[]) => void;
  readonly onChoose: (row: number, event: ReactMouseEvent) => void;
  readonly labelledBy?: string | undefined;
  readonly label?: string | undefined;
}

const DEFAULT_ROW = 32;

function track(width: ComboboxColumn<unknown>['width']): string {
  if (width === undefined) return 'minmax(6rem, 1fr)';
  return typeof width === 'number' ? `${width}px` : width;
}

/**
 * Smallest row width at which every column keeps its declared size: the
 * pixel widths plus 6rem per flexible column, divided by what the
 * percentage columns leave (`W >= fixed + p * W`). Below it the grid
 * scrolls horizontally instead of cutting off the last columns (a 390px
 * phone). Other CSS lengths count as 0. `undefined` when nothing is fixed.
 */
function minRowWidth(columns: readonly ComboboxColumn<unknown>[]): string | undefined {
  let px = 0;
  let flex = 0;
  let pct = 0;
  for (const c of columns) {
    const w = c.width;
    if (w === undefined) flex++;
    else if (typeof w === 'number') px += w;
    else if (/^\d+(\.\d+)?%$/.test(w.trim())) pct += parseFloat(w) / 100;
  }
  if ((px === 0 && flex === 0) || pct >= 1) return undefined;
  const fixed = flex ? `(${px}px + ${flex * 6}rem)` : `${px}px`;
  return pct > 0 ? `calc(${fixed} / ${1 - pct})` : `calc(${fixed})`;
}

/** Cell text: the column `format` (Intl options by value type, or a formatter), else `String(value)`. */
function cellText<Item>(column: ComboboxColumn<Item>, value: unknown, item: Item, locale: string): string {
  const f = column.format;
  if (value == null) return '';
  if (typeof f === 'function') return f(value, item);
  if (f && typeof value === 'number') return new Intl.NumberFormat(locale, f as Intl.NumberFormatOptions).format(value);
  if (f && value instanceof Date) return new Intl.DateTimeFormat(locale, f as Intl.DateTimeFormatOptions).format(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export default function ColumnsGrid<Item>(props: ColumnsGridProps<Item>) {
  const { ctl, columns } = props;
  const { store, count, virtual, maxVisible, listRef } = ctl;
  const { first, last, h } = useWindow(ctl, props.rowHeight);
  const start = virtual ? first : 0;
  const end = virtual ? last : count;
  const template: CSSProperties = { gridTemplateColumns: columns.map((c) => track(c.width)).join(' '), minInlineSize: minRowWidth(columns as readonly ComboboxColumn<unknown>[]) };
  const locale = ctl.locale ?? 'en-US';
  const rows: ReactNode[] = [];
  for (let r = start; r < end; r++) {
    const info = ctl.rowInfo(r);
    if (info.kind === 'group') continue;
    rows.push(<GridRow key={r} ctl={ctl} row={r} item={info.item} columns={columns} template={template} locale={locale} rowHeight={props.rowHeight} onChoose={props.onChoose} />);
  }
  const onScroll = (): void => {
    const el = listRef.current;
    if (!el || !virtual) return;
    ctl.scrolled(el.scrollTop);
  };
  return (
    <div
      id={ctl.listId}
      role="grid"
      aria-rowcount={count + 1}
      aria-multiselectable={ctl.multiple ? true : undefined}
      aria-labelledby={props.labelledBy}
      aria-label={props.labelledBy ? undefined : props.label}
      aria-busy={ctl.loading ? true : undefined}
      ref={listRef}
      className="salmon-combobox-grid salmon-dropdown-list"
      // The grid is the scroll container (header row sticky): the scrollable region is the composite widget.
      style={{ maxBlockSize: (maxVisible + 1) * h }}
      data-grid-lines={props.gridLines}
      data-striped={props.striped ? '' : undefined}
      data-virtual={virtual ? '' : undefined}
      onScroll={virtual ? onScroll : undefined}
      onPointerDown={preventFocusLoss}
    >
      <div role="rowgroup" className="salmon-combobox-grid-head" data-sticky-head="">
        <div role="row" aria-rowindex={1} className="salmon-combobox-grid-row" style={template}>
          {columns.map((column, index) => {
            const sort = props.sortBy.find((s) => s.columnId === column.field);
            const sortable = props.sortable && column.sortable !== false;
            const content = column.renderHeader ? column.renderHeader({ column }) : (column.header ?? column.field);
            return (
              <div
                // Two columns may show the same field (one formatted): the position keeps keys unique.
                key={`${column.field}:${index}`}
                role="columnheader"
                aria-sort={sort ? (sort.direction === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
                className="salmon-combobox-grid-header"
                data-align={column.align}
              >
                {sortable ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="salmon-combobox-grid-sort"
                    onPointerDown={preventFocusLoss}
                    onClick={(event) => props.onSort(nextSort(props.sortBy, column.field, props.multiSort && (event.ctrlKey || event.metaKey)))}
                  >
                    <span className="salmon-combobox-grid-header-text">{content}</span>
                    <span className="salmon-combobox-grid-sort-icon" aria-hidden="true" data-direction={sort?.direction}>
                      {sort ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                ) : (
                  <span className="salmon-combobox-grid-header-text">{content}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div role="rowgroup" className="salmon-combobox-grid-body">
        {virtual ? (
          <div className="salmon-dropdown-sizer" style={{ blockSize: count * h }}>
            <div className="salmon-dropdown-window" style={{ transform: `translateY(${start * h}px)` }}>
              {rows}
            </div>
          </div>
        ) : (
          rows
        )}
      </div>
    </div>
  );
}

interface GridRowProps<Item> {
  readonly ctl: DropdownController<Item>;
  readonly row: number;
  readonly item: Item | undefined;
  readonly columns: readonly ComboboxColumn<Item>[];
  readonly template: CSSProperties;
  readonly locale: string;
  readonly rowHeight: number | undefined;
  readonly onChoose: (row: number, event: ReactMouseEvent) => void;
}

function GridRow<Item>({ ctl, row, item, columns, template, locale, rowHeight, onChoose }: GridRowProps<Item>) {
  const active = useSyncExternalStore(ctl.store.subscribe, () => ctl.store.getState().active === row, () => false);
  const style = rowHeight !== undefined ? { ...template, blockSize: rowHeight } : template;
  if (item === undefined) {
    return (
      <div id={ctl.optionId(row)} role="row" aria-rowindex={row + 2} aria-selected={false} aria-disabled={true} data-row={row} data-pending="" className="salmon-combobox-grid-row salmon-dropdown-option" style={style}>
        <div role="gridcell" className="salmon-combobox-grid-cell">
          <span className="salmon-dropdown-skeleton" aria-hidden="true" />
        </div>
      </div>
    );
  }
  const value = ctl.valueOf(item);
  const selected = ctl.selected.has(value);
  const disabled = ctl.isDisabled(item) || (ctl.limitReached && !selected);
  return (
    <div
      id={ctl.optionId(row)}
      role="row"
      aria-rowindex={row + 2}
      aria-selected={selected}
      aria-disabled={disabled ? true : undefined}
      data-row={row}
      data-active={active ? '' : undefined}
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-odd={row % 2 === 1 ? '' : undefined}
      className="salmon-combobox-grid-row salmon-dropdown-option"
      style={style}
      onClick={disabled ? undefined : (event) => onChoose(row, event)}
      onPointerMove={disabled || active ? undefined : () => ctl.store.set({ active: row })}
    >
      {columns.map((column, index) => {
        const v = fieldValue(item, column.field);
        const text = cellText(column, v, item, locale);
        const extra = typeof column.cellProps === 'function' ? column.cellProps(item) : column.cellProps;
        const { className: extraClass, style: extraStyle, ...dataProps } = (extra ?? {}) as { className?: string; style?: CSSProperties };
        return (
          <div
            {...dataProps}
            key={`${column.field}:${index}`}
            role="gridcell"
            className={extraClass ? `salmon-combobox-grid-cell ${extraClass}` : 'salmon-combobox-grid-cell'}
            style={extraStyle}
            data-align={column.align}
            title={column.renderCell || column.displayAsCheckbox ? undefined : text}
          >
            {column.renderCell ? (
              column.renderCell({ item, value: v, text })
            ) : column.displayAsCheckbox ? (
              <span className="salmon-dropdown-checkbox" data-state={v ? 'checked' : 'unchecked'} role="img" aria-label={String(Boolean(v))} />
            ) : (
              text
            )}
          </div>
        );
      })}
    </div>
  );
}
