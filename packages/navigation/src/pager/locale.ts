// `localeText` of the standalone `Pager`: the Data
// Grid pager strings and message format (a `{param}` template or plural
// forms chosen by `Intl.PluralRules`), without importing the grid catalog.

/** A `{param}` template, or plural forms keyed by `Intl.PluralRules` category. */
export type PagerLocaleMessage = string | { readonly [category in Intl.LDMLPluralRule]?: string };

/** User-visible strings of `Pager`. Plain JSON, safe to pass from a server component. */
export interface PagerLocaleText {
  /** Accessible name of the `<nav>` landmark. */
  readonly label: PagerLocaleMessage;
  readonly firstPage: PagerLocaleMessage;
  readonly previousPage: PagerLocaleMessage;
  readonly nextPage: PagerLocaleMessage;
  readonly lastPage: PagerLocaleMessage;
  /** The `…` button before the numeric set. */
  readonly previousPages: PagerLocaleMessage;
  /** The `…` button after the numeric set. */
  readonly nextPages: PagerLocaleMessage;
  /** `{page}`: accessible name of a numeric button. */
  readonly pageButton: PagerLocaleMessage;
  /** Visible text before each page number; empty by default. */
  readonly pageLabel: PagerLocaleMessage;
  /** `{page}` `{pageCount}`: the info text. */
  readonly pagerInfo: PagerLocaleMessage;
  /** `{page}`: the info text while the total is unknown (`totalCount={null}`). */
  readonly pagerInfoUnknown: PagerLocaleMessage;
  /** `{count}`: the item count after the info text. */
  readonly pagerItems: PagerLocaleMessage;
  /** Label of the page size control. */
  readonly pageSize: PagerLocaleMessage;
  /** The `'all'` page size option. */
  readonly allItems: PagerLocaleMessage;
}

export const PAGER_DEFAULT_LOCALE_TEXT: PagerLocaleText = Object.freeze({
  label: 'Pagination',
  firstPage: 'First page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  lastPage: 'Last page',
  previousPages: 'Previous pages',
  nextPages: 'Next pages',
  pageButton: 'Page {page}',
  pageLabel: '',
  pagerInfo: '{page} of {pageCount} pages',
  pagerInfoUnknown: 'Page {page}',
  pagerItems: { one: '(1 item)', other: '({count} items)' },
  pageSize: 'Items per page',
  allItems: 'All',
});

/** Formats one message: plural form by `count`, then `{param}` substitution. Never throws. */
export function formatPagerText(message: PagerLocaleMessage, params: Readonly<Record<string, string | number>> = {}, locale?: string): string {
  let template: string;
  if (typeof message === 'string') template = message;
  else {
    const count = typeof params['count'] === 'number' ? params['count'] : 0;
    let category: Intl.LDMLPluralRule = 'other';
    try {
      category = count === 0 && message.zero !== undefined ? 'zero' : new Intl.PluralRules(locale).select(count);
    } catch {}
    template = message[category] ?? message.other ?? '';
  }
  // Numbers use the locale's digits and grouping ("(22,095 items)").
  return template.replace(/\{(\w+)\}/g, (all, key: string) => {
    if (!(key in params)) return all;
    const value = params[key];
    if (typeof value === 'number') {
      try {
        return value.toLocaleString(locale);
      } catch {}
    }
    return String(value);
  });
}
