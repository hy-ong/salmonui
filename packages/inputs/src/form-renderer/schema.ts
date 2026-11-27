// Schema interpretation of FormRenderer: widgets, layout rows, validation rules and typed submit
// data. Pure functions, unit-tested without a DOM.
import type { FieldValidation } from '@salmonui/core/validation';
import type { ReactNode } from 'react';
import type { ButtonTone, ButtonVariant } from '@salmonui/buttons/button';

export type FormSchemaType = 'string' | 'number' | 'integer' | 'boolean';
export type FormSchemaValue = string | number | boolean;

/** One property of the JSON Schema subset. Other keywords are ignored. */
export interface FormSchemaProperty {
  readonly type: FormSchemaType;
  /** Field label; default the property name. */
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly default?: FormSchemaValue | undefined;
  /** Allowed values: a `Select` (or `RadioGroup`) of these. */
  readonly enum?: readonly (string | number)[] | undefined;
  /** `true` on a boolean: the box must be checked (a required checkbox). */
  readonly const?: FormSchemaValue | undefined;
  /** `'email'` (email input and rule), `'uri'` (url input and rule). */
  readonly format?: 'email' | 'uri' | (string & {}) | undefined;
  readonly minLength?: number | undefined;
  readonly maxLength?: number | undefined;
  readonly minimum?: number | undefined;
  readonly maximum?: number | undefined;
  /** A regular expression source (unanchored, as in JSON Schema). */
  readonly pattern?: string | undefined;
}

/** The JSON Schema subset `FormRenderer` renders: an object of scalar properties. */
export interface FormSchema {
  readonly type: 'object';
  /** The form's accessible name when no `aria-label` / `aria-labelledby` is given. */
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly properties: Readonly<Record<string, FormSchemaProperty>>;
  readonly required?: readonly string[] | undefined;
}

export type FormUiWidget = 'text' | 'password' | 'textarea' | 'number' | 'checkbox' | 'switch' | 'select' | 'radio';

/** Per-property UI choices. */
export interface FormUiField {
  readonly widget?: FormUiWidget | undefined;
  /** Overrides `title`. */
  readonly label?: ReactNode;
  /** Overrides `description`. */
  readonly description?: ReactNode;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly autoComplete?: string | undefined;
  /** Option labels of an `enum`, in `enum` order. */
  readonly enumLabels?: readonly string[] | undefined;
}

/** Layout and widget choices. */
export interface FormUiSchema {
  /** Ordered rows: a property name, or names shown side by side as equal columns. Unlisted properties follow in schema order. */
  readonly layout?: readonly (string | readonly string[])[] | undefined;
  readonly fields?: Readonly<Record<string, FormUiField>> | undefined;
  /** The submit `Button`; `false` hides it. */
  readonly submit?: false | { readonly label?: ReactNode; readonly tone?: ButtonTone | undefined; readonly variant?: ButtonVariant | undefined } | undefined;
}

/** Submitted data, typed by the schema. */
export type FormRendererData = Record<string, FormSchemaValue | null>;

/** The widget a property renders, or null for an unsupported type. */
export function widgetOf(property: FormSchemaProperty, ui: FormUiField | undefined): FormUiWidget | null {
  const w = ui?.widget;
  if (property.enum) return w === 'radio' ? 'radio' : 'select';
  switch (property.type) {
    case 'string':
      return w === 'password' || w === 'textarea' ? w : 'text';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return w === 'switch' ? 'switch' : 'checkbox';
    default:
      return null;
  }
}

/** JSON Schema keywords as Form rules, or undefined when there are none. */
export function rulesOf(property: FormSchemaProperty, required: boolean): FieldValidation | undefined {
  const rules: { -readonly [K in keyof FieldValidation]?: FieldValidation[K] } = {};
  let any = false;
  const put = <K extends keyof FieldValidation>(key: K, value: FieldValidation[K] | undefined): void => {
    if (value === undefined) return;
    rules[key] = value;
    any = true;
  };
  // A boolean is always present; JSON Schema asks for a checked box with `const: true`.
  if (property.type === 'boolean') put('required', property.const === true ? true : undefined);
  else if (required) put('required', true);
  put('minLength', property.minLength);
  put('maxLength', property.maxLength);
  put('min', property.minimum);
  put('max', property.maximum);
  put('pattern', property.pattern);
  if (property.format === 'email') put('email', true);
  else if (property.format === 'uri') put('url', true);
  return any ? rules : undefined;
}

/** Rows of property names: `layout` first, then every unlisted property in schema order. */
export function rowsOf(schema: FormSchema, ui: FormUiSchema | undefined): readonly (readonly string[])[] {
  const names = Object.keys(schema.properties);
  const placed = new Set<string>();
  const rows: string[][] = [];
  for (const row of ui?.layout ?? []) {
    const cells = (typeof row === 'string' ? [row] : row).filter((n) => names.includes(n) && !placed.has(n));
    for (const n of cells) placed.add(n);
    if (cells.length) rows.push(cells);
  }
  for (const n of names) if (!placed.has(n)) rows.push([n]);
  return rows;
}

const enumValue = (property: FormSchemaProperty, raw: string): FormSchemaValue | null => property.enum!.find((v) => String(v) === raw) ?? null;

/** Typed data of a submitted form: numbers or null, booleans, enum values in their schema type, strings. */
export function dataOf(form: FormData, schema: FormSchema): FormRendererData {
  const data: FormRendererData = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    const raw = form.get(name);
    const text = typeof raw === 'string' ? raw : null;
    if (property.type === 'boolean') data[name] = text !== null;
    else if (property.enum) data[name] = text === null || text === '' ? null : enumValue(property, text);
    else if (property.type === 'number' || property.type === 'integer') data[name] = text === null || text.trim() === '' || Number.isNaN(Number(text)) ? null : Number(text);
    else data[name] = text ?? '';
  }
  return data;
}
