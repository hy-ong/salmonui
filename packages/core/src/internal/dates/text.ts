// `localeText` for the calendar components: the Data Grid message format (`LocaleMessage`:
// a `{param}` template or plural forms chosen by `Intl.PluralRules`) and its
// merge rule (English defaults, then the override bundle). The Data Grid
// module itself is not imported: its default catalog holds every grid
// string, which would exceed the calendar bundle budget.

import type { LocaleMessage } from '@salmonui/core/format';

export type { LocaleMessage };

const plurals = new Map<string, Intl.PluralRules>();

/** Formats one message: plural form by `params.count`, then `{param}` placeholders. Never throws. */
export function formatMessage(message: LocaleMessage | undefined, params: Readonly<Record<string, string | number>> = {}, locale = 'en-US'): string {
  if (message === undefined) return '';
  let template: string;
  if (typeof message === 'string') template = message;
  else {
    const n = params['count'];
    let rules = plurals.get(locale);
    if (!rules) {
      try {
        rules = new Intl.PluralRules(locale);
      } catch {
        rules = new Intl.PluralRules('en-US');
      }
      plurals.set(locale, rules);
    }
    const forms = message as Readonly<Record<string, string | undefined>>;
    template = typeof n === 'number' ? ((n === 0 ? forms['zero'] : undefined) ?? forms[rules.select(n)] ?? message.other) : message.other;
  }
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k])));
}

/** Text of a key: the override when given, else the default. */
export function textOf<K extends string>(defaults: Readonly<Record<K, LocaleMessage>>, overrides: Partial<Readonly<Record<K, LocaleMessage>>> | undefined, key: K, params?: Readonly<Record<string, string | number>>, locale?: string): string {
  return formatMessage(overrides?.[key] ?? defaults[key], params, locale);
}
