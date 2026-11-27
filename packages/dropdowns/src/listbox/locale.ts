/** A `{param}` template, or plural forms keyed by `Intl.PluralRules` category. */
export type ListboxLocaleMessage = string | { readonly [category in Intl.LDMLPluralRule]?: string };

/** Static texts of `Listbox`. Plain JSON, safe to pass from a server component. */
export interface ListboxLocaleText {
  readonly noData: ListboxLocaleMessage;
  readonly noResults: ListboxLocaleMessage;
  readonly loading: ListboxLocaleMessage;
  readonly loadError: ListboxLocaleMessage;
  readonly retry: ListboxLocaleMessage;
  readonly searchLabel: ListboxLocaleMessage;
  readonly selectAll: ListboxLocaleMessage;
  /** `{count}`: matches after a search (live region). */
  readonly resultCount: ListboxLocaleMessage;
  /** `{max}`: announced when `maxSelected` is reached. */
  readonly selectionLimit: ListboxLocaleMessage;
  /** `{label}`, `{position}`, `{count}`: announced after a keyboard reorder. */
  readonly moved: ListboxLocaleMessage;
}

export const LISTBOX_DEFAULT_LOCALE_TEXT: ListboxLocaleText = Object.freeze({
  noData: 'No items',
  noResults: 'No matches found',
  loading: 'Loading…',
  loadError: 'Failed to load items',
  retry: 'Retry',
  searchLabel: 'Search',
  selectAll: 'Select all',
  resultCount: { zero: 'No results', one: '1 result', other: '{count} results' },
  selectionLimit: 'Selection limit of {max} reached',
  moved: '{label} moved to position {position} of {count}',
});

/** Formats one message: plural form by `count`, then `{param}` substitution. */
export function formatListboxText(message: ListboxLocaleMessage, params: Readonly<Record<string, string | number>> = {}, locale?: string): string {
  let template: string;
  if (typeof message === 'string') template = message;
  else {
    const count = typeof params['count'] === 'number' ? params['count'] : 0;
    const category = count === 0 && message.zero !== undefined ? 'zero' : new Intl.PluralRules(locale).select(count);
    template = message[category] ?? message.other ?? '';
  }
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in params ? String(params[key]) : all));
}
