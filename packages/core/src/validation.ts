// `@salmonui/core/validation`: validation rules shared by the Data Grid
// columns, form fields, InlineEdit and QueryBuilder. Rules use the
// HTML constraint-validation names (`pattern`) and `validate(value, row)` for
// custom rules (column `validation`); each rule value is either the rule
// argument or `[argument, message]`. Rules compile once per compiled column
// into one closure; a keystroke runs only the closures of that column, and
// built-in rules allocate nothing on success (they return a shared empty
// array).

import type { RowId } from './data.js';

/** A rule argument, or `[argument, message]` to override the message. */
export type RuleValue<T> = T | readonly [T, string];

/** Context passed to custom validators; `Column` is the host's column (the Data Grid passes its compiled column). */
export interface ValidatorContext<Row, Column = unknown> {
  readonly rowId: RowId;
  readonly columnId: string;
  readonly column: Column;
  /** True for a row added in this edit session (not yet saved). */
  readonly isNew: boolean;
}

/**
 * Context of a form field's custom validators (`@salmonui/inputs/form` `Field`). It is passed as both the `row` and the
 * `ctx` argument, so `validate(value, { formData })` reads other fields.
 */
export interface FieldValidatorContext {
  /** The field's `name` (`''` without one). */
  readonly name: string;
  /** The owning form's data at validation time; `null` outside a form. */
  readonly formData: FormDataLike | null;
  readonly isNew: false;
}

/** The read side of `FormData` (core has no DOM types). */
export interface FormDataLike {
  get(name: string): unknown;
  getAll(name: string): unknown[];
  has(name: string): boolean;
}

/**
 * Custom validator: returns an error message, or null / undefined / true when
 * the value is valid (false uses the rule message). May return a promise
 * (async validation): commit waits for it.
 */
export type CustomValidator<Row = unknown, Ctx = ValidatorContext<Row>> = (
  value: unknown,
  row: Row,
  ctx: Ctx,
) => string | boolean | null | undefined | PromiseLike<string | boolean | null | undefined>;

export interface ColumnValidation<Row = unknown, Ctx = ValidatorContext<Row>> {
  readonly required?: RuleValue<boolean>;
  readonly min?: RuleValue<number | string>;
  readonly max?: RuleValue<number | string>;
  readonly range?: RuleValue<readonly [number | string, number | string]>;
  readonly minLength?: RuleValue<number>;
  readonly maxLength?: RuleValue<number>;
  readonly rangeLength?: RuleValue<readonly [number, number]>;
  readonly number?: RuleValue<boolean>;
  readonly digits?: RuleValue<boolean>;
  readonly email?: RuleValue<boolean>;
  readonly url?: RuleValue<boolean>;
  readonly date?: RuleValue<boolean>;
  readonly dateIso?: RuleValue<boolean>;
  readonly creditcard?: RuleValue<boolean>;
  readonly tel?: RuleValue<boolean>;
  /**
   * A pattern string or a RegExp, tested as a search: a partial match
   * passes, so anchor the pattern (`^[A-Z]{3}$`) to require the whole value.
   */
  readonly pattern?: RuleValue<string | RegExp>;
  /** One custom validator, `[validator, message]`, or several. */
  readonly validate?: CustomValidator<Row, Ctx> | readonly [CustomValidator<Row, Ctx>, string] | readonly CustomValidator<Row, Ctx>[];
  /** Message overrides of this column, keyed by rule name; they win over `edit.messages`. */
  readonly messages?: Partial<ValidationMessages>;
}

/** Rules of a form field: the column vocabulary with the field context. */
export type FieldValidation = ColumnValidation<FieldValidatorContext, FieldValidatorContext>;

/** Message templates; `{0}` and `{1}` are the rule arguments. */
export interface ValidationMessages {
  readonly required: string;
  readonly min: string;
  readonly max: string;
  readonly range: string;
  readonly minLength: string;
  readonly maxLength: string;
  readonly rangeLength: string;
  readonly number: string;
  readonly digits: string;
  readonly email: string;
  readonly url: string;
  readonly date: string;
  readonly dateIso: string;
  readonly creditcard: string;
  readonly tel: string;
  readonly pattern: string;
  readonly validate: string;
}

/** English defaults. Override with `edit.messages` / `editing.messages`. */
export const DEFAULT_VALIDATION_MESSAGES: ValidationMessages = Object.freeze({
  required: 'This field is required.',
  min: 'Please enter a value greater than or equal to {0}.',
  max: 'Please enter a value less than or equal to {0}.',
  range: 'Please enter a value between {0} and {1}.',
  minLength: 'Please enter at least {0} characters.',
  maxLength: 'Please enter no more than {0} characters.',
  rangeLength: 'Please enter a value between {0} and {1} characters long.',
  number: 'Please enter a valid number.',
  digits: 'Please enter only digits.',
  email: 'Please enter a valid email address.',
  url: 'Please enter a valid URL.',
  date: 'Please enter a valid date.',
  dateIso: 'Please enter a valid date (ISO).',
  creditcard: 'Please enter a valid credit card number.',
  tel: 'Please enter a valid phone number.',
  pattern: 'Please enter a correct value.',
  validate: 'Please enter a correct value.',
});

export const NO_ERRORS: readonly string[] = Object.freeze([]);

type Check = (value: unknown, row: unknown) => string | null;
type AsyncCheck = (value: unknown, row: unknown, ctx: unknown) => string | PromiseLike<string | null> | null;

/** One column's compiled rules. */
export interface CompiledValidator {
  /** True when a `required` rule (or an implicit primary-key requirement) applies. */
  readonly required: boolean;
  /** Synchronous built-in rules: the first failing message, as a one-element array, or `NO_ERRORS`. */
  validate(value: unknown, row: unknown): readonly string[];
  /** Custom validators: a message, null, or a promise of either. Null when the column has no custom rule. */
  readonly custom: AsyncCheck | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
const DIGITS = /^\d+$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const TEL = /^\+?[\d\s().-]{6,20}$/;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value));
}

function argOf<T>(rule: RuleValue<T>, pair: boolean): { arg: T; message: string | null } {
  if (!Array.isArray(rule)) return { arg: rule as T, message: null };
  // Pair rules (`range`, `rangeLength`): `[lo, hi]` or `[[lo, hi], message]`.
  if (pair && !Array.isArray(rule[0])) return { arg: rule as unknown as T, message: null };
  return { arg: rule[0] as T, message: typeof rule[1] === 'string' ? rule[1] : null };
}

/** @internal Fills `{0}` and `{1}` of a message template (form fields reuse it). */
export function formatValidationMessage(template: string, a?: unknown, b?: unknown): string {
  return template.replace('{0}', String(a)).replace('{1}', String(b));
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/** A bound for min/max/range: numbers as is, dates (ISO strings or Date) as epoch ms when the value is a date. */
function boundOf(bound: unknown, value: unknown): number {
  if (value instanceof Date) {
    if (bound instanceof Date) return bound.getTime();
    if (typeof bound === 'string') return new Date(bound).getTime();
  }
  return asNumber(bound);
}

function lengthOf(value: unknown): number {
  return typeof value === 'string' ? value.length : String(value).length;
}

function luhn(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function toPattern(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return new RegExp(pattern.source, pattern.flags.replace('g', '').replace('y', ''));
  return new RegExp(pattern);
}

/**
 * Compiles `rules` into one validator. `implicitRequired` adds a required
 * check without a rule (primary keys of new rows).
 */
export function compileValidationRules<Row = unknown, Ctx = ValidatorContext<Row>>(
  rules: ColumnValidation<Row, Ctx> | undefined,
  baseMessages: ValidationMessages = DEFAULT_VALIDATION_MESSAGES,
  implicitRequired = false,
): CompiledValidator {
  const messages: ValidationMessages = rules?.messages ? { ...baseMessages, ...rules.messages } : baseMessages;
  const checks: Check[] = [];
  let required = implicitRequired;
  let requiredMessage = messages.required;
  if (rules?.required !== undefined) {
    const { arg, message } = argOf(rules.required, false);
    required = arg === true || implicitRequired;
    if (message) requiredMessage = message;
  }
  const add = <T>(rule: RuleValue<T> | undefined, pair: boolean, build: (arg: T, message: string | null) => Check | null): void => {
    if (rule === undefined) return;
    const { arg, message } = argOf(rule, pair);
    const check = build(arg, message);
    if (check) checks.push(check);
  };
  const flag = (rule: RuleValue<boolean> | undefined, test: (value: unknown) => boolean, fallback: string): void =>
    add(rule, false, (on: boolean, message) => (on ? (v) => (test(v) ? null : (message ?? fallback)) : null));

  if (rules) {
    flag(rules.number, (v) => typeof v === 'number' ? Number.isFinite(v) : !Number.isNaN(asNumber(v)), messages.number);
    flag(rules.digits, (v) => DIGITS.test(String(v)), messages.digits);
    flag(rules.email, (v) => EMAIL.test(String(v)), messages.email);
    flag(rules.url, (v) => URL_PATTERN.test(String(v)), messages.url);
    flag(rules.date, (v) => (v instanceof Date ? !Number.isNaN(v.getTime()) : !Number.isNaN(new Date(String(v)).getTime())), messages.date);
    flag(rules.dateIso, (v) => (v instanceof Date ? !Number.isNaN(v.getTime()) : DATE_ISO.test(String(v))), messages.dateIso);
    flag(rules.creditcard, (v) => luhn(String(v)), messages.creditcard);
    flag(rules.tel, (v) => TEL.test(String(v)), messages.tel);
    add(rules.min, false, (min: number | string, message) => (v) => (asNumber(v) >= boundOf(min, v) ? null : formatValidationMessage(message ?? messages.min, min)));
    add(rules.max, false, (max: number | string, message) => (v) => (asNumber(v) <= boundOf(max, v) ? null : formatValidationMessage(message ?? messages.max, max)));
    add<readonly [number | string, number | string]>(rules.range, true, ([lo, hi], message) => (v) => {
      const n = asNumber(v);
      return n >= boundOf(lo, v) && n <= boundOf(hi, v) ? null : formatValidationMessage(message ?? messages.range, lo, hi);
    });
    add(rules.minLength, false, (min: number, message) => (v) => (lengthOf(v) >= min ? null : formatValidationMessage(message ?? messages.minLength, min)));
    add(rules.maxLength, false, (max: number, message) => (v) => (lengthOf(v) <= max ? null : formatValidationMessage(message ?? messages.maxLength, max)));
    add<readonly [number, number]>(rules.rangeLength, true, ([lo, hi], message) => (v) => {
      const n = lengthOf(v);
      return n >= lo && n <= hi ? null : formatValidationMessage(message ?? messages.rangeLength, lo, hi);
    });
    add(rules.pattern, false, (pattern: string | RegExp, message) => {
      const re = toPattern(pattern);
      return (v) => (re.test(v instanceof Date ? v.toISOString() : String(v)) ? null : (message ?? messages.pattern));
    });
  }

  const customs: { fn: CustomValidator<Row, Ctx>; message: string }[] = [];
  const custom = rules?.validate;
  if (typeof custom === 'function') customs.push({ fn: custom, message: messages.validate });
  else if (Array.isArray(custom)) {
    if (custom.length === 2 && typeof custom[0] === 'function' && typeof custom[1] === 'string') customs.push({ fn: custom[0] as CustomValidator<Row, Ctx>, message: custom[1] as string });
    else for (const fn of custom as readonly CustomValidator<Row, Ctx>[]) if (typeof fn === 'function') customs.push({ fn, message: messages.validate });
  }

  const sync = checks;
  const needed = required;
  const reqMessage = requiredMessage;
  const required1: readonly string[] = Object.freeze([reqMessage]);
  const validate = (value: unknown, row: unknown): readonly string[] => {
    if (isEmpty(value)) return needed ? required1 : NO_ERRORS;
    for (let i = 0; i < sync.length; i++) {
      const message = (sync[i] as Check)(value, row);
      if (message !== null) return Object.freeze([message]);
    }
    return NO_ERRORS;
  };

  const resolveCustom = (out: string | boolean | null | undefined, message: string): string | null =>
    out === null || out === undefined || out === true || out === '' ? null : out === false ? message : out;

  const customCheck: AsyncCheck | null = customs.length
    ? (value, row, ctx) => {
        for (let i = 0; i < customs.length; i++) {
          const { fn, message } = customs[i] as { fn: CustomValidator<Row, Ctx>; message: string };
          const out = fn(value, row as Row, ctx as Ctx);
          if (out !== null && typeof out === 'object' && typeof (out as PromiseLike<unknown>).then === 'function') {
            // Async: the remaining validators run after this one resolves.
            const rest = customs.slice(i + 1);
            return Promise.resolve(out as PromiseLike<string | boolean | null | undefined>).then(async (first) => {
              const r = resolveCustom(first, message);
              if (r !== null) return r;
              for (const next of rest) {
                const v = resolveCustom(await next.fn(value, row as Row, ctx as Ctx), next.message);
                if (v !== null) return v;
              }
              return null;
            });
          }
          const r = resolveCustom(out as string | boolean | null | undefined, message);
          if (r !== null) return r;
        }
        return null;
      }
    : null;

  return Object.freeze({ required: needed, validate, custom: customCheck });
}
