// Default static texts of the dropdowns. Plural forms come from
// `Intl.PluralRules` of the `locale` prop.

import type { DropdownLocaleText } from './types.js';

export const DROPDOWN_DEFAULT_LOCALE_TEXT: DropdownLocaleText = Object.freeze({
  noResults: 'No results found',
  noData: 'No options',
  loading: 'Loading…',
  loadError: 'Request failed',
  retry: 'Retry',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  clear: 'Clear',
  removeValue: (label: string) => `Remove ${label}`,
  selectedCount: (count: number, plural: Intl.LDMLPluralRule) => `${count} ${plural === 'one' ? 'item' : 'items'} selected`,
  moreValues: (count: number) => `+${count}`,
  resultCount: (count: number, plural: Intl.LDMLPluralRule) => (count === 0 ? 'No results' : `${count} ${plural === 'one' ? 'result' : 'results'}`),
  limitReached: (max: number) => `Selection limit of ${max} reached`,
  search: 'Search',
  close: 'Close',
  toggle: 'Show options',
  selectedValues: 'Selected values',
  create: (text: string) => `Add “${text}”`,
});
