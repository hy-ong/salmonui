// Smart paste field discovery and filling. DOM only, no React:
// `describeFields` reads the
// native controls under a root, `fillFields` writes values through the
// prototype setters and fires `input` / `change` (checkboxes and radios are
// clicked), so React-controlled inputs and form libraries see the change.
// Nothing here runs at import time or on the server.

/** What the adapter learns about one field. */
export interface SmartPasteField {
  /** The field's `name` (or `id` when it has no name); the key of the adapter's answer. */
  readonly name: string;
  /** Text of the associated `<label>`, `aria-labelledby`, `aria-label` or group `<legend>`. */
  readonly label?: string;
  /** `data-salmon-paste-description`, else the `aria-describedby` text (the Field description). */
  readonly description?: string;
  /** Input `type`, or `'textarea'`, `'select'`, `'checkbox'`, `'radio'`, or the custom field's type. */
  readonly type: string;
  /** Allowed values: `<option>` values, radio values, or the values of a checkbox group. */
  readonly options?: readonly string[];
  /** A multiple `<select>` or a checkbox group: the answer is an array. */
  readonly multiple?: boolean;
}

/** A field the hook cannot reach as a native control (for example a Salmon `Select`): described and filled by the application. */
export interface SmartPasteCustomField extends SmartPasteField {
  /** Applies the adapter's value; return `false` when it does not fit, so the field is reported as skipped. */
  readonly fill: (value: unknown) => boolean | void;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SKIPPED_TYPES = ['password', 'file', 'hidden', 'submit', 'reset', 'button', 'image'];
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function idsText(root: Element, ids: string | null): string {
  const doc = root.ownerDocument;
  return (ids ?? '').split(/\s+/).filter(Boolean).map((id) => text(doc.getElementById(id))).filter(Boolean).join(' ');
}

/** A label's own text: the control it wraps (a `<select>` with its option texts) is left out. */
function labelText(label: HTMLLabelElement | undefined, el: Control): string {
  return label?.childNodes ? [...label.childNodes].filter((n) => !n.contains(el)).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : text(label);
}

function labelOf(el: Control, group: boolean): string {
  if (group) {
    const set = el.closest('fieldset, [role="radiogroup"], [role="group"]');
    if (set) return text(set.querySelector('legend')) || idsText(el, set.getAttribute('aria-labelledby')) || (set.getAttribute('aria-label') ?? '');
  }
  return labelText(el.labels?.[0], el) || idsText(el, el.getAttribute('aria-labelledby')) || (el.getAttribute('aria-label') ?? '');
}

function descriptionOf(el: Control): string {
  const own = el.closest('[data-salmon-paste-description]')?.getAttribute('data-salmon-paste-description');
  return own ?? idsText(el, el.getAttribute('aria-describedby'));
}

function kindOf(el: Control): string {
  const tag = el.tagName.toLowerCase();
  return tag === 'input' ? ((el as HTMLInputElement).type || 'text').toLowerCase() : tag;
}

/** The controls a paste may describe and fill, grouped by name (radio and checkbox groups share one). */
export function collectControls(root: ParentNode): Map<string, Control[]> {
  const groups = new Map<string, Control[]>();
  for (const el of root.querySelectorAll<Control>('input, textarea, select')) {
    const name = el.name || el.id;
    if (!name || el.disabled || (el as HTMLInputElement).readOnly || SKIPPED_TYPES.includes(kindOf(el))) continue;
    // Opted out, or a hidden mirror of a custom field (aria-hidden, out of the tab order).
    if (el.closest('[data-salmon-paste="off"]') || (el.getAttribute('aria-hidden') === 'true' && el.tabIndex < 0)) continue;
    const list = groups.get(name);
    if (list) list.push(el);
    else groups.set(name, [el]);
  }
  return groups;
}

/** Field descriptors for the adapter. */
export function describeFields(groups: Map<string, Control[]>): SmartPasteField[] {
  const out: SmartPasteField[] = [];
  for (const [name, list] of groups) {
    const el = list[0]!;
    const type = kindOf(el);
    const group = (type === 'radio' || type === 'checkbox') && list.length > 1;
    const field: { -readonly [K in keyof SmartPasteField]: SmartPasteField[K] } = { name, type };
    const label = labelOf(el, group);
    if (label) field.label = label;
    const description = descriptionOf(el);
    if (description) field.description = description;
    if (type === 'select') {
      field.options = [...(el as HTMLSelectElement).options].map((o) => o.value).filter(Boolean);
      if ((el as HTMLSelectElement).multiple) field.multiple = true;
    } else if (group || type === 'radio') {
      field.options = list.map((r) => (r as HTMLInputElement).value);
      if (type === 'checkbox') field.multiple = true;
    }
    out.push(field);
  }
  return out;
}

/** The adapter's answer as a record: an object, or JSON text (code fences and prose around the object are ignored). */
export function parseAnswer(answer: unknown): Record<string, unknown> {
  if (typeof answer === 'string') {
    const start = answer.indexOf('{');
    const end = answer.lastIndexOf('}');
    if (start < 0 || end < start) return {};
    try {
      answer = JSON.parse(answer.slice(start, end + 1));
    } catch {
      return {};
    }
  }
  return answer !== null && typeof answer === 'object' && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};
}

const TRUE = ['true', 'yes', 'on', '1', 'checked', 'y'];
const truthy = (value: unknown): boolean => value === true || value === 1 || (typeof value === 'string' && TRUE.includes(value.trim().toLowerCase()));
const fold = (s: string): string => s.trim().toLowerCase();
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value]);

/** Sets `value` or `checked` through the element's prototype setter, so React's value tracker reports the change. */
function setNative(el: Control, prop: 'value', next: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), prop)?.set;
  if (setter) setter.call(el, next);
  else el[prop] = next;
}

function fire(el: Control): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Clicks a checkbox or radio into the wanted state (React listens to `click` for these). */
function check(el: HTMLInputElement, on: boolean): void {
  if (el.checked !== on) el.click();
}

/** The matching option or radio value: exact, then case-insensitive on value or label text. */
function pick<T extends { value: string; text?: string; labels?: NodeListOf<HTMLLabelElement> | null }>(items: readonly T[], value: unknown): T | undefined {
  const s = String(value);
  return items.find((i) => i.value === s) ?? items.find((i) => fold(i.value) === fold(s) || fold(i.text ?? text(i.labels?.[0])) === fold(s));
}

/** Fills one field; false when the value does not fit it. */
export function fillControls(list: Control[], value: unknown): boolean {
  const el = list[0]!;
  const type = kindOf(el);
  if (type === 'checkbox') {
    if (list.length === 1) {
      check(el as HTMLInputElement, truthy(value));
      return true;
    }
    const wanted = listOf(value).map((v) => pick(list as HTMLInputElement[], v)).filter(Boolean);
    for (const box of list as HTMLInputElement[]) check(box, wanted.includes(box));
    return wanted.length > 0;
  }
  if (type === 'radio') {
    const radio = pick(list as HTMLInputElement[], value);
    if (radio) check(radio, true);
    return radio !== undefined;
  }
  if (type === 'select') {
    const select = el as HTMLSelectElement;
    const options = [...select.options];
    if (select.multiple) {
      const wanted = listOf(value).map((v) => pick(options, v)).filter(Boolean);
      for (const o of options) o.selected = wanted.includes(o);
      fire(select);
      return wanted.length > 0;
    }
    const option = pick(options, value);
    if (!option) return false;
    setNative(select, 'value', option.value);
    fire(select);
    return true;
  }
  setNative(el, 'value', Array.isArray(value) ? value.join(', ') : String(value));
  fire(el);
  return true;
}
