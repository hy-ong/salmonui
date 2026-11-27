// Pure pager model of the standalone `Pager`: page
// count, the clamp rules and the key table. No React, no DOM, no
// `@salmonui/data-grid/engine` (the engine's paging module stays the grid's).

/** Default page size. */
export const DEFAULT_PAGE_SIZE = 12;
/** Default number of numeric page buttons shown. */
export const DEFAULT_BUTTON_COUNT = 8;
/** `pageSizeOptions={true}`: the Data Grid defaults. */
export const DEFAULT_PAGE_SIZE_OPTIONS: readonly (number | 'all')[] = Object.freeze(['all', 5, 10, 12, 20]);
const NO_OPTIONS: readonly (number | 'all')[] = Object.freeze([]);

/** A positive integer at least `min`. */
export function isCount(value: unknown, min = 1): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

/** `ceil(totalCount / pageSize)`, at least 1 (an empty list still has page 1). */
export function pageCountOf(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** `page` clamped into `1..max` (non-integers fall back to 1). */
export function clampPage(page: number, max: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, max));
}

/**
 * The page after a page-size change (the Data Grid clamp rule): the
 * page that keeps the first row of the current page, clamped to the new page
 * count when the total is known.
 */
export function resizedPage(page: number, pageSize: number, nextPageSize: number, totalCount: number | null): number {
  const next = Math.floor(((page - 1) * pageSize) / nextPageSize) + 1;
  return clampPage(next, totalCount === null ? next : pageCountOf(totalCount, nextPageSize));
}

/** `pageSizeOptions` normalized (`true` → the defaults; `'all'` dropped while the total is unknown). */
export function pageSizeOptionsOf(options: boolean | readonly (number | 'all')[] | undefined, totalKnown: boolean): readonly (number | 'all')[] {
  const list = options === true ? DEFAULT_PAGE_SIZE_OPTIONS : options || NO_OPTIONS;
  return totalKnown ? list : list.filter((v) => v !== 'all');
}

export type PagerKeyCommand = 'first' | 'previous' | 'next' | 'last';

/**
 * The Data Grid pager keys: PageUp / ArrowLeft previous, PageDown /
 * ArrowRight next, Home or Ctrl+Alt+PageUp first, End or Ctrl+Alt+PageDown
 * last. Under `rtl` ArrowLeft goes forward and ArrowRight back;
 * PageUp / PageDown keep their meaning.
 */
export function pagerKeyCommand(key: string, mods: { readonly ctrlKey: boolean; readonly altKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean }, rtl: boolean): PagerKeyCommand | null {
  // Ctrl or Alt alone, Shift and Meta: no command.
  if (mods.shiftKey || mods.metaKey || mods.ctrlKey !== mods.altKey) return null;
  if (mods.ctrlKey) return key === 'PageUp' ? 'first' : key === 'PageDown' ? 'last' : null;
  return key === 'PageUp' || key === (rtl ? 'ArrowRight' : 'ArrowLeft')
    ? 'previous'
    : key === 'PageDown' || key === (rtl ? 'ArrowLeft' : 'ArrowRight')
      ? 'next'
      : key === 'Home'
        ? 'first'
        : key === 'End'
          ? 'last'
          : null;
}
