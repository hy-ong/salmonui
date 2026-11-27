'use client';

// Pager: first / previous / numeric / next / last buttons,
// `...` buttons for the previous and next page sets (`paging.buttonCount`
// numeric buttons at a time), an optional page size dropdown
// (`paging.pageSizeOptions`), and the "1 of 10 pages (100 items)" info.
// `role="navigation"`, `aria-current="page"`. Pager keys (ArrowLeft/Right,
// PageUp/PageDown, Home/End) resolve through the grid keymap in the `pager`
// context; Tab moves between the controls. The pager renders as the next
// sibling of `role="grid"` (a navigation landmark may not be owned by a grid),
// so it routes its own keydown through the grid's keymap. The pager model comes from the
// paging module (`engine.paging.getInfo()`) through one primitive selector.
// With the filter row, the pager also shows the filter status (`filter-status.tsx`).

import { createContext, memo, use, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { joinClass } from './Cell.js';
import { useEngineSelector, useDataGridInstance, useDataGridRender, useDataGridText } from './context.js';
import type { DataGridInstance } from './instance.js';
import { DataGridFilterStatus } from './filter-status.js';
import { customIcon, useDataGridIcons, type DataGridIconName } from './icons.js';
import { DEFAULT_PAGE_BUTTON_COUNT, DEFAULT_PAGE_SIZE_OPTIONS, filterStatusEnabled, pagingOf } from './query-config.js';
import type { DataGridPagerContext } from './query-types.js';
import type { DataGridProps } from './types.js';

/**
 * Render-time pager props (`paging`, `renderPager`): `instance.props` is
 * synced only after the render, and the memoized pager parts would not
 * re-render on a prop change. The DataGrid provides it around the pager, memoized
 * on the two props, so a new `renderPager` or `paging` re-renders the pager
 * only.
 */
export interface DataGridPagerProps {
  readonly paging: DataGridProps<unknown>['paging'];
  readonly renderPager: DataGridProps<unknown>['renderPager'];
  /** The filter status line (`filterStatusEnabled`). */
  readonly filterStatus?: boolean;
}

export const DataGridPagerPropsContext = createContext<DataGridPagerProps | null>(null);

function usePagerProps(instance: DataGridInstance<unknown>): DataGridPagerProps {
  return use(DataGridPagerPropsContext) ?? { ...(instance.props as unknown as DataGridPagerProps), filterStatus: filterStatusEnabled(instance.props.filtering) };
}

function pageSizeOptionsOf(props: DataGridPagerProps): readonly (number | 'all')[] {
  const opt = pagingOf(props as never)?.pageSizeOptions;
  if (!opt) return [];
  return opt === true ? DEFAULT_PAGE_SIZE_OPTIONS : opt;
}

interface PagerModel {
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly total: number;
}

/** `page|pageSize|pageCount|total` so the selector returns a primitive. */
function pagerKey(instance: DataGridInstance<unknown>): string {
  const info = instance.query.pageInfo();
  return info ? `${info.page}|${info.pageSize}|${info.pageCount}|${info.totalRowCount}` : '';
}

function parseKey(key: string): PagerModel {
  const [page, pageSize, pageCount, total] = key.split('|').map(Number) as [number, number, number, number];
  return { page, pageSize, pageCount, total };
}

/** First and last page of the numeric button set that contains `page`. */
export function pageSet(page: number, pageCount: number, visible: number): { start: number; end: number } {
  const size = Math.max(1, Math.floor(visible));
  const start = Math.floor((page - 1) / size) * size + 1;
  return { start, end: Math.min(pageCount, start + size - 1) };
}

/** The built-in pager UI (exported so a `renderPager` slot can wrap it). */
function DataGridDefaultPagerImpl() {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const icons = useDataGridIcons();
  const pagerProps = usePagerProps(instance);
  const query = instance.query;
  const text = render.text;
  const key = useEngineSelector(instance, () => pagerKey(instance));
  const navRef = useRef<HTMLDivElement | null>(null);
  // After a keyboard page change, focus follows the current page button.
  useLayoutEffect(() => {
    if (!query.pagerFocusPending) return;
    query.pagerFocusPending = false;
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true });
  });
  if (!key) return null;
  const { page, pageSize, pageCount, total } = parseKey(key);
  const visible = pagingOf(pagerProps as never)?.buttonCount ?? DEFAULT_PAGE_BUTTON_COUNT;
  const { start, end } = pageSet(page, pageCount, visible);
  const sizes = pageSizeOptionsOf(pagerProps);
  const onClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const button = (event.target as Element).closest<HTMLElement>('[data-page]');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    const target = Number(button.dataset['page']);
    if (target !== page) instance.dispatchFrom('pointer', { type: 'paging.goToPage', page: target });
  };
  const button = (target: number, label: string, kind: string, content: ReactNode, disabled: boolean, icon?: DataGridIconName) => (
    <button
      key={kind}
      type="button"
      className={`salmon-data-grid-pager__button salmon-data-grid-pager__${kind}`}
      data-page={target}
      aria-label={label}
      aria-disabled={disabled || undefined}
      title={label}
      data-custom-icon={icon ? customIcon(icons, icon) : undefined}
    >
      {icon ? icons?.[icon] : content}
    </button>
  );
  const numbers: ReactNode[] = [];
  for (let n = start; n <= end; n++) {
    numbers.push(
      <button
        key={n}
        type="button"
        className="salmon-data-grid-pager__button salmon-data-grid-pager__number"
        data-page={n}
        aria-label={text('pageButton', { page: n })}
        aria-current={n === page ? 'page' : undefined}
      >
        {n}
      </button>,
    );
  }
  const selected = sizes.find((v) => v !== 'all' && v === pageSize) ?? (sizes.includes('all') && pageSize >= total ? 'all' : pageSize);
  return (
    <div
      className={joinClass('salmon-data-grid-pager', render.classNames?.pager)}
      style={render.styles?.pager}
      role="navigation"
      aria-label={text('pagerLabel')}
      data-page={page}
      data-page-count={pageCount}
      dir={instance.resolvedDir(instance.props)}
      onKeyDown={instance.interaction.onKeyDown}
      onContextMenu={instance.props.contextMenu ? instance.chrome.onContextMenu : undefined}
    >
      <div className="salmon-data-grid-pager__nav" ref={navRef} onClick={onClick}>
        {button(1, text('firstPage'), 'first', null, page <= 1, 'pagerFirst')}
        {button(Math.max(1, page - 1), text('previousPage'), 'prev', null, page <= 1, 'pagerPrevious')}
        {start > 1 ? button(start - 1, text('previousPages'), 'prev-set', '…', false) : null}
        {numbers}
        {end < pageCount ? button(end + 1, text('nextPages'), 'next-set', '…', false) : null}
        {button(Math.min(pageCount, page + 1), text('nextPage'), 'next', null, page >= pageCount, 'pagerNext')}
        {button(pageCount, text('lastPage'), 'last', null, page >= pageCount, 'pagerLast')}
      </div>
      {sizes.length ? (
        <label className="salmon-data-grid-pager__size">
          <select
            className="salmon-data-grid-input"
            value={String(selected)}
            onChange={(e) => {
              const v = e.target.value;
              instance.dispatchFrom('pointer', { type: 'paging.setPageSize', pageSize: v === 'all' ? Math.max(1, total) : Number(v) });
            }}
          >
            {sizes.map((v) => (
              <option key={String(v)} value={String(v)}>
                {v === 'all' ? text('allRows') : v}
              </option>
            ))}
            {!sizes.includes(selected) ?<option value={String(selected)}>{selected}</option> : null}
          </select>
          <span className="salmon-data-grid-pager__size-label">{text('pageSize')}</span>
        </label>
      ) : null}
      <div className="salmon-data-grid-pager__info">
        <span className="salmon-data-grid-pager__pages">{text('pagerInfo', { page: page, pageCount: pageCount })}</span> <span className="salmon-data-grid-pager__items">{text('pagerItems', { count: total })}</span>
      </div>
      {pagerProps.filterStatus ? <DataGridFilterStatus /> : null}
    </div>
  );
}

export const DataGridDefaultPager = memo(DataGridDefaultPagerImpl);

/** The grid's pager: `renderPager` when given, else the default pager. */
function DataGridPagerImpl() {
  const instance = useDataGridInstance<unknown>();
  const enabled = useEngineSelector(instance, () => instance.query.pagerEnabled());
  const key = useEngineSelector(instance, () => pagerKey(instance));
  const text = useDataGridText();
  const pagerProps = usePagerProps(instance);
  if (!enabled || !key) return null;
  const template = pagerProps.renderPager;
  if (!template) return <DataGridDefaultPager />;
  const { page, pageSize, pageCount, total } = parseKey(key);
  const props: DataGridPagerContext = {
    page,
    pageSize,
    pageCount,
    totalRowCount: total,
    pageSizeOptions: pageSizeOptionsOf(pagerProps).map((v) => (v === 'all' ? Math.max(1, total) : v)),
    goToPage: (p) => instance.dispatchFrom('pointer', { type: 'paging.goToPage', page: p }),
    setPageSize: (n) => instance.dispatchFrom('pointer', { type: 'paging.setPageSize', pageSize: n }),
    defaultPager: <DataGridDefaultPager />,
  };
  const render = instance.props;
  return (
    <div className={joinClass('salmon-data-grid-pager', 'salmon-data-grid-pager--template', render.classNames?.pager)} style={render.styles?.pager} role="navigation" aria-label={text('pagerLabel')}>
      {template(props)}
    </div>
  );
}

export const DataGridPager = memo(DataGridPagerImpl);
