// DataGrid text and globalization props.
// Every user-visible string of the React renderer comes from the core
// `localeText` catalog (`@salmonui/data-grid/engine/locale`): a flat JSON object of
// `{param}` templates and plural forms, so a catalog serializes for SSR and
// no global registry exists. The `localeText` prop holds overrides over the
// English defaults; `locale`, `currency`, `timeZone`, and `dir` reach the
// engine through `engine.setLocale` (one column recompile per change).

import {
  createLocaleTextModule,
  DEFAULT_LOCALE_TEXT,
  formatLocaleText,
  isRtlLocale,
  resolveLocaleText,
  type LocaleMessage,
  type LocaleText,
  type LocaleTextKey,
  type LocaleTextParams,
  type LocaleTextState,
} from '@salmonui/data-grid/engine/locale';
import type { DataGridEngine, DataGridModule, DataGridSnapshot } from '@salmonui/data-grid/engine';

/** Keys of the built-in catalog (`DEFAULT_LOCALE_TEXT`). */
export type DataGridLocaleTextKey = LocaleTextKey;

/**
 * `localeText` prop: overrides over the English catalog. Values are
 * `{param}` templates (`'Page {page} of {pageCount}'`) or plural forms
 * (`{ one: '1 row selected', other: '{count} rows selected' }`). Plain JSON:
 * safe to import from a server component and pass down.
 */
export type DataGridLocaleText = { readonly [K in LocaleTextKey]?: LocaleMessage } & { readonly [key: string]: LocaleMessage | undefined };

/** Formats catalog messages in the grid locale. A new function per (catalog, locale) pair. */
export interface DataGridText {
  (key: DataGridLocaleTextKey, params?: LocaleTextParams): string;
  readonly locale: string;
  readonly catalog: LocaleText;
  /** True when the catalog has a message for `key` (custom keys included). */
  has(key: string): boolean;
  /** A custom key, or `fallback` when the catalog has none. */
  optional(key: string, params?: LocaleTextParams, fallback?: string): string;
}

export function createDataGridText(catalog: LocaleText, locale: string): DataGridText {
  const text = ((key: DataGridLocaleTextKey, params?: LocaleTextParams) => formatLocaleText(catalog, key, params, locale)) as DataGridText & { locale: string; catalog: LocaleText };
  text.locale = locale;
  text.catalog = catalog;
  text.has = (key: string) => Object.prototype.hasOwnProperty.call(catalog, key);
  text.optional = (key: string, params?: LocaleTextParams, fallback = key) => (text.has(key) ? formatLocaleText(catalog, key, params, locale) : fallback);
  return Object.freeze(text);
}

/** Text for props before the engine exists (initial engine options). */
export function propsText(props: { readonly localeText?: DataGridLocaleText; readonly locale?: string }): DataGridText {
  return createDataGridText(resolveLocaleText(localeTextOverrides(props.localeText)), props.locale ?? 'en-US');
}

/** English text in `en-US` (standalone parts rendered outside a grid). */
export const DEFAULT_GRID_TEXT: DataGridText = createDataGridText(DEFAULT_LOCALE_TEXT as LocaleText, 'en-US');

/** Catalog key of a filter operator label (`contains` → `operatorContains`). */
export function operatorTextKey(operator: string): string {
  return `operator${operator.charAt(0).toUpperCase()}${operator.slice(1)}`;
}

/** Label of a filter operator: its catalog entry, else the operator name (custom operators). */
export function operatorText(text: DataGridText, operator: string): string {
  return text.optional(operatorTextKey(operator), undefined, operator);
}

/** The resolved catalog in a snapshot (English when the module is absent). */
export function catalogOf(snapshot: DataGridSnapshot<unknown>): LocaleText {
  return (snapshot.modules['localeText'] as LocaleTextState | undefined)?.text ?? (DEFAULT_LOCALE_TEXT as LocaleText);
}

/** Adds the `localeText` module unless the app passes one. */
export function withLocaleTextModule<Row>(modules: readonly DataGridModule<Row>[]): readonly DataGridModule<Row>[] {
  return modules.some((m) => m.name === 'localeText') ? modules : [...modules, createLocaleTextModule<Row>() as unknown as DataGridModule<Row>];
}

/** `dir` prop resolved against the locale: `'auto'` follows the locale script; undefined stays inherited. */
export function resolveDir(dir: 'ltr' | 'rtl' | 'auto' | undefined, locale: string | undefined): 'ltr' | 'rtl' | undefined {
  if (dir === 'auto') return isRtlLocale(locale ?? 'en-US') ? 'rtl' : 'ltr';
  return dir;
}

function sameMessage(a: LocaleMessage | undefined, b: LocaleMessage | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/** Shallow catalog equality (inline `localeText` objects must not re-dispatch every render). */
export function sameLocaleText(a: DataGridLocaleText | undefined, b: DataGridLocaleText | undefined): boolean {
  if (a === b) return true;
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) return false;
  return ak.every((k) => sameMessage(a?.[k], b?.[k]));
}

/** The `localeText` overrides as the module command expects them (invalid entries are ignored by the module). */
export function localeTextOverrides(text: DataGridLocaleText | undefined): Record<string, LocaleMessage> {
  const out: Record<string, LocaleMessage> = {};
  if (text) for (const [k, v] of Object.entries(text)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Syncs `localeText`, `locale`, `currency`, `timeZone`, and the resolved
 * direction into the engine. Returns true when the direction changed.
 */
export function syncGlobalization<Row>(
  engine: DataGridEngine<Row>,
  prev: { localeText?: DataGridLocaleText; locale?: string; currency?: string; timeZone?: string },
  next: { localeText?: DataGridLocaleText; locale?: string; currency?: string; timeZone?: string },
  direction: 'ltr' | 'rtl' | undefined,
): void {
  if (!sameLocaleText(prev.localeText, next.localeText) && engine.hasCommand('localeText.set')) {
    engine.dispatch({ type: 'localeText.set', text: localeTextOverrides(next.localeText) });
  }
  const snap = engine.getSnapshot();
  const locale = next.locale ?? 'en-US';
  const formatChanged = locale !== snap.locale || next.currency !== prev.currency || next.timeZone !== prev.timeZone;
  const dirChanged = direction !== undefined && direction !== snap.direction;
  if (!formatChanged && !dirChanged) return;
  engine.setLocale({
    ...(formatChanged ? { locale, currency: next.currency ?? 'USD', timeZone: next.timeZone } : {}),
    ...(dirChanged ? { direction } : {}),
  });
}
