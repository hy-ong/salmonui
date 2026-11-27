'use client';

// Standalone Pager: first / previous / `…` / numeric / `…` / next /
// last buttons, an optional page size control and the "1 of 10 pages
// (100 items)" info inside a `<nav>` landmark. The Data Grid pager's
// behaviour (page sets, keys, container-query layout,
// clamp) without `@salmonui/data-grid/engine`: the page count is
// `ceil(totalCount / pageSize)`. State is two scalars in React state when
// uncontrolled.

import { useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { pageSet } from '../internal/page-set.js';
import { pressSource, type PressSource } from '@salmonui/core/internal/press';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { DEV } from '@salmonui/core/internal/dev';
import { formatPagerText, PAGER_DEFAULT_LOCALE_TEXT, type PagerLocaleText } from './locale.js';
import { clampPage, DEFAULT_BUTTON_COUNT, DEFAULT_PAGE_SIZE, isCount, pageCountOf, pagerKeyCommand, pageSizeOptionsOf, resizedPage } from './model.js';

/** Input that caused a change; `'api'` is a call of the render context's `goToPage` / `setPageSize`. */
export type PagerSource = PressSource | 'api';

/** `onPageChange` event (frozen). `reason: 'pageSize'` when a page-size change clamped the page. */
export interface PagerPageChangeEvent {
  readonly page: number;
  readonly previousPage: number;
  readonly source: PagerSource;
  readonly reason: 'navigate' | 'pageSize';
}

/** `onBeforePageChange` event: `preventDefault()` keeps the current page. */
export interface PagerBeforePageChangeEvent extends PagerPageChangeEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `onPageSizeChange` event (frozen); `page` is the page after the clamp. */
export interface PagerPageSizeChangeEvent {
  readonly pageSize: number;
  readonly previousPageSize: number;
  readonly page: number;
  readonly previousPage: number;
  readonly source: PagerSource;
}

/** `onBeforePageSizeChange` event: `preventDefault()` keeps the page size and page. */
export interface PagerBeforePageSizeChangeEvent extends PagerPageSizeChangeEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Context of `renderPager` and `renderInfo` (the Data Grid context). */
export interface PagerRenderContext {
  readonly page: number;
  readonly pageSize: number;
  /** `null` while the total is unknown (`totalCount={null}`). */
  readonly pageCount: number | null;
  readonly totalCount: number | null;
  readonly hasNextPage: boolean;
  /** Goes to a page (clamped) through the same before / after events, `source: 'api'`. */
  goToPage(page: number): void;
  /** Sets the page size (`'all'` = the total) through the same events, `source: 'api'`. */
  setPageSize(pageSize: number | 'all'): void;
}

/** `renderPager` context: the render context plus the built-in pager content. */
export interface PagerTemplateContext extends PagerRenderContext {
  readonly defaultPager: ReactElement;
}

export interface PagerPageSizeOption {
  readonly value: number | 'all';
  readonly label: string;
}

/** `renderPageSize` context: everything a custom control (for example a `Select`) needs. */
export interface PagerPageSizeContext {
  /** The selected option (`'all'` when the page shows every item and `'all'` is offered). */
  readonly value: number | 'all';
  readonly options: readonly PagerPageSizeOption[];
  /** `localeText.pageSize`, for the control's accessible name. */
  readonly label: string;
  setPageSize(pageSize: number | 'all'): void;
}

/** Icons for the first / previous / next / last buttons; a missing entry keeps the built-in (mirrored in RTL) icon. */
export interface PagerIcons {
  readonly first?: ReactNode;
  readonly previous?: ReactNode;
  readonly next?: ReactNode;
  readonly last?: ReactNode;
}

export interface PagerProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'defaultValue'> {
  /** Button metrics: `'md'` (default) follows the control height, `'sm'` is a 24px button. */
  readonly size?: 'sm' | 'md' | undefined;
  /** Current page button: `'solid'` (default) primary fill, `'outline'` a primary border on a tinted fill. */
  readonly variant?: 'solid' | 'outline' | undefined;
  /** Current page, 1-based (controlled). */
  readonly page?: number;
  /** Initial page when uncontrolled. Default 1. */
  readonly defaultPage?: number;
  /** Cancellable; fires before every user page change. */
  readonly onBeforePageChange?: (event: PagerBeforePageChangeEvent) => void;
  readonly onPageChange?: (event: PagerPageChangeEvent) => void;
  /** Items per page (controlled). */
  readonly pageSize?: number;
  /** Initial page size when uncontrolled. Default 12. */
  readonly defaultPageSize?: number;
  readonly onBeforePageSizeChange?: (event: PagerBeforePageSizeChangeEvent) => void;
  readonly onPageSizeChange?: (event: PagerPageSizeChangeEvent) => void;
  /** Page size options; `true` = `['all', 5, 10, 12, 20]`. Default none (no control). */
  readonly pageSizeOptions?: boolean | readonly (number | 'all')[];
  /** Numeric buttons shown at a time. Default 8. */
  readonly buttonCount?: number;
  /** Total items; `null` when unknown (then `hasNextPage` enables Next). */
  readonly totalCount: number | null;
  /** With `totalCount={null}`: whether a page after the current one exists. */
  readonly hasNextPage?: boolean;
  /** Shows the info text. Default `true`. */
  readonly showInfo?: boolean;
  /** Replaces the info text. */
  readonly renderInfo?: (context: PagerRenderContext) => ReactNode;
  /** Replaces the whole pager content inside the `<nav>`. */
  readonly renderPager?: (context: PagerTemplateContext) => ReactNode;
  /** Replaces the native page size `<select>` (for example with `Select` from `@salmonui/dropdowns/select`). */
  readonly renderPageSize?: (context: PagerPageSizeContext) => ReactNode;
  readonly localeText?: Partial<PagerLocaleText>;
  /** BCP 47 locale for plural rules of `localeText` messages. */
  readonly locale?: string;
  readonly icons?: PagerIcons;
  /** Content after the info text. */
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLElement>;
}

/** Calls an `onBefore*` handler with a cancellable copy of `fields`; true when it called `preventDefault()`. */
function vetoed<T extends object>(handler: ((event: T & { readonly defaultPrevented: boolean; preventDefault(): void }) => void) | undefined, fields: T): boolean {
  let prevented = false;
  handler?.(
    Object.freeze({
      ...fields,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    }),
  );
  return prevented;
}

type ButtonPart = 'first' | 'previous' | 'next' | 'last';

/** variant="outline": the current page button's colors (inline, so the stylesheet stays within its budget). */
const OUTLINE: CSSProperties = { color: 'var(--salmon-color-primary-text)', borderColor: 'currentColor', background: 'var(--salmon-color-primary-subtle)' };

/** The standalone pager. `ref` is the `<nav>` element. */
export function Pager(props: PagerProps): ReactNode {
  const {
    page: pageProp,
    defaultPage = 1,
    onBeforePageChange,
    onPageChange,
    pageSize: pageSizeProp,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    onBeforePageSizeChange,
    onPageSizeChange,
    pageSizeOptions,
    buttonCount = DEFAULT_BUTTON_COUNT,
    totalCount,
    hasNextPage = false,
    showInfo = true,
    renderInfo,
    renderPager,
    renderPageSize,
    localeText: ownText,
    locale: ownLocale,
    icons,
    size,
    variant,
    children,
    className,
    style,
    onKeyDown,
    ref,
    ...rest
  } = props;
  const [rawPage, setPage] = useControllableState<number, [PagerPageChangeEvent | undefined]>(pageProp, defaultPage, onPageChange && ((_, event) => onPageChange(event!)), DEV ? 'Pager page' : undefined);
  const [rawSize, setSize] = useControllableState<number, [PagerPageSizeChangeEvent | undefined]>(pageSizeProp, defaultPageSize, onPageSizeChange && ((_, event) => onPageSizeChange(event!)), DEV ? 'Pager pageSize' : undefined);
  const localeText = useLocaleText('pager', ownText);
  const locale = useLocale(ownLocale);
  const buttonsRef = useRef<HTMLDivElement | null>(null);
  // Page whose button takes focus after a keyboard change; 0 = none. A ref, never state.
  const focusPage = useRef(0);

  const pageSize = isCount(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  const total = isCount(totalCount, 0) ? totalCount : null;
  const pageCount = total === null ? null : pageCountOf(total, pageSize);
  // The rendered page is clamped; with an unknown total any page is accepted.
  const page = clampPage(rawPage, pageCount ?? rawPage);
  const reachable = pageCount ?? page + (hasNextPage ? 1 : 0);

  useLayoutEffect(() => {
    if (focusPage.current !== page) return;
    focusPage.current = 0;
    buttonsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true });
  });

  const text = (key: keyof PagerLocaleText, params?: Record<string, string | number>): string => formatPagerText(localeText?.[key] ?? PAGER_DEFAULT_LOCALE_TEXT[key], params, locale);

  const goToPage = (target: number, source: PagerSource): void => {
    const next = clampPage(target, reachable);
    focusPage.current = 0;
    if (next === page) return;
    const fields = { page: next, previousPage: page, source, reason: 'navigate' as const };
    if (vetoed(onBeforePageChange, fields)) return;
    if (source === 'keyboard') focusPage.current = next;
    setPage(next, onPageChange && Object.freeze(fields));
  };

  const setPageSize = (value: number | 'all', source: PagerSource): void => {
    const next = value === 'all' ? Math.max(1, total ?? pageSize) : value;
    if (!isCount(next) || next === pageSize) return;
    const nextPage = resizedPage(page, pageSize, next, total);
    const fields = { pageSize: next, previousPageSize: pageSize, page: nextPage, previousPage: page, source };
    if (vetoed(onBeforePageSizeChange, fields)) return;
    setSize(next, onPageSizeChange && Object.freeze(fields));
    if (nextPage !== page) setPage(nextPage, onPageChange && Object.freeze({ page: nextPage, previousPage: page, source, reason: 'pageSize' as const }));
  };

  const context: PagerRenderContext = {
    page,
    pageSize,
    pageCount,
    totalCount: total,
    hasNextPage: pageCount === null ? hasNextPage : page < pageCount,
    goToPage: (p) => goToPage(p, 'api'),
    setPageSize: (n) => setPageSize(n, 'api'),
  };

  const onButtonsClick = (event: MouseEvent<HTMLDivElement>): void => {
    const button = (event.target as Element).closest<HTMLElement>('[data-page]');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    goToPage(Number(button.dataset['page']), pressSource(event));
  };

  const onNavKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !buttonsRef.current?.contains(event.target as Node)) return;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const command = pagerKeyCommand(event.key, event, rtl);
    if (!command) return;
    const target = command === 'first' ? 1 : command === 'previous' ? page - 1 : command === 'next' ? page + 1 : pageCount;
    if (target === null) return;
    event.preventDefault();
    goToPage(target, 'keyboard');
  };

  // One shape for the edge buttons (an icon slot) and the `…` set buttons (`mark`).
  const edge = (part: ButtonPart | 'previous-set' | 'next-set', target: number, label: string, disabled?: boolean, mark?: string): ReactElement => (
    <button key={part} type="button" className="salmon-pager-button" data-part={part} data-page={target} aria-label={label} title={label} aria-disabled={disabled || undefined}>
      <span className={mark ? undefined : 'salmon-pager-icon'} aria-hidden="true">
        {mark ?? icons?.[part as ButtonPart]}
      </span>
    </button>
  );

  const { start, end } = pageSet(page, reachable, buttonCount);
  const pageLabel = text('pageLabel');
  const numbers: ReactElement[] = [];
  for (let n = start; n <= end; n++) {
    numbers.push(
      <button key={n} type="button" className="salmon-pager-button" data-part="number" data-page={n} aria-label={text('pageButton', { page: n })} aria-current={n === page ? 'page' : undefined} style={n === page && variant === 'outline' ? OUTLINE : undefined}>
        {pageLabel ? <span className="salmon-pager-page-label">{`${pageLabel} `}</span> : null}
        {n}
      </button>,
    );
  }

  const sizes = pageSizeOptionsOf(pageSizeOptions, total !== null);
  let sizeControl: ReactNode = null;
  if (sizes.length) {
    const value: number | 'all' = sizes.includes(pageSize) ? pageSize : sizes.includes('all') && total !== null && pageSize >= total ? 'all' : pageSize;
    const options: PagerPageSizeOption[] = sizes.map((v) => ({ value: v, label: v === 'all' ? text('allItems') : String(v) }));
    if (!sizes.includes(value)) options.push({ value, label: String(value) });
    const label = text('pageSize');
    sizeControl = renderPageSize ? (
      <div className="salmon-pager-size">{renderPageSize({ value, options, label, setPageSize: (n) => setPageSize(n, 'pointer') })}</div>
    ) : (
      <label className="salmon-pager-size">
        <select className="salmon-pager-size-select" value={String(value)} onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value), 'pointer')}>
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="salmon-pager-icon" aria-hidden="true" />
        <span className="salmon-pager-size-label">{label}</span>
      </label>
    );
  }

  const info = showInfo ? (
    <div className="salmon-pager-info">
      {renderInfo ? (
        renderInfo(context)
      ) : pageCount === null ? (
        <span className="salmon-pager-pages">{text('pagerInfoUnknown', { page })}</span>
      ) : (
        <>
          <span className="salmon-pager-pages">{text('pagerInfo', { page, pageCount })}</span> <span className="salmon-pager-items">{text('pagerItems', { count: total! })}</span>
        </>
      )}
    </div>
  ) : null;

  const content = (
    <>
      <div className="salmon-pager-buttons" ref={buttonsRef} onClick={onButtonsClick}>
        {edge('first', 1, text('firstPage'), page <= 1)}
        {edge('previous', Math.max(1, page - 1), text('previousPage'), page <= 1)}
        {start > 1 ? edge('previous-set', start - 1, text('previousPages'), false, '…') : null}
        {numbers}
        {end < reachable ? edge('next-set', end + 1, text('nextPages'), false, '…') : null}
        {edge('next', Math.min(reachable, page + 1), text('nextPage'), page >= reachable)}
        {pageCount !== null ? edge('last', pageCount, text('lastPage'), page >= pageCount) : null}
      </div>
      {sizeControl}
      {info}
      {children != null ? <div className="salmon-pager-message">{children}</div> : null}
    </>
  );

  return (
    <nav
      aria-label={text('label')}
      {...rest}
      ref={ref}
      className={className ? `salmon-pager ${className}` : 'salmon-pager'}
      // size="sm": the buttons and the size select read the control metrics (inline, so the stylesheet stays small).
      style={size === 'sm' ? ({ '--salmon-control-height-md': '24px', '--salmon-control-padding-md': '6px', ...style } as CSSProperties) : style}
      data-page={page}
      data-page-count={pageCount ?? undefined}
      data-template={renderPager ? '' : undefined}
      data-size={size === 'sm' ? size : undefined}
      data-variant={variant === 'outline' ? variant : undefined}
      onKeyDown={onNavKeyDown}
    >
      {renderPager ? renderPager({ ...context, defaultPager: content }) : content}
    </nav>
  );
}
