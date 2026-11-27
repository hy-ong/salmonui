// Message formatting of the calendars `localeText` (its own module, so the
// fields and the calendar import it without the picker shell: the shell stays
// in the chunk of the parts that render it).

/** A `localeText` message: a `{param}` template or plural forms (the Data Grid `LocaleMessage` shape). */
export type PickerMessage = string | { readonly zero?: string; readonly one?: string; readonly two?: string; readonly few?: string; readonly many?: string; readonly other: string };

/**
 * Formats a message with the Data Grid `formatLocaleText` rules (plural form
 * for `count`, `{param}` placeholders) without loading the Data Grid catalog.
 */
export function formatText(message: PickerMessage, params: Readonly<Record<string, string | number>> = {}, locale = 'en-US'): string {
  let template: string;
  if (typeof message === 'string') template = message;
  else {
    const n = typeof params['count'] === 'number' ? params['count'] : undefined;
    let category = 'other';
    if (n !== undefined) {
      try {
        category = new Intl.PluralRules(locale).select(n);
      } catch {
        category = n === 1 ? 'one' : 'other';
      }
    }
    const forms = message as Readonly<Record<string, string | undefined>>;
    template = (n === 0 ? forms['zero'] : undefined) ?? forms[category] ?? message.other;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] === undefined ? match : String(params[name])));
}
