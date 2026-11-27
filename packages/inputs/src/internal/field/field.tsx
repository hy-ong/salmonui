'use client';

// Field primitive. Every field component calls `useField`:
//
//   const field = useField({ value, inputRef, name, label, description,
//     errorMessage, invalid, validation, validateOn, required, disabled,
//     localeText, extraError, focusRef });
//   <div {...field.rootProps} className="salmon-field salmon-x">
//     <FieldLabel field={field}>{label}</FieldLabel>
//     <input {...field.inputProps} onBlur={field.onBlur} ref={inputRef} />
//     <FieldHelp field={field} description={description} errorMessage={errorMessage} />
//   </div>
//
// - Rules are the Data Grid vocabulary compiled by
//   `@salmonui/core/validation` once per `validation` identity;
//   built-in rules allocate nothing on success.
// - Native constraints (`required`, `minLength`, `pattern`, `type`, `min`,
//   `max`, `step`) are read from `inputRef.current.validity` and mapped to the
//   same messages; the first error is written back with `setCustomValidity`,
//   so `reportValidity()`, `requestSubmit()` and `:invalid` agree.
// - Errors are computed on every value change but shown only after the
//   first blur (`validateOn: 'blur'`), change or submit; a keystroke
//   re-renders only its own field, and only when the shown errors change.
// - Custom (`validate`) rules run when errors are shown and on submit; async
//   ones set `validating` (`data-validating`).
// - Server errors from `Form validationErrors` are shown until the value
//   changes.
// - `extraError` is a component's own constraint (incomplete mask, number
//   out of range) evaluated after the rules.

import { FieldStateContext, type FieldState } from '@salmonui/core/internal/field/context';
export { FieldStateContext, type FieldState };
import { createContext, use, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  compileValidationRules,
  DEFAULT_VALIDATION_MESSAGES,
  formatValidationMessage as fill,
  NO_ERRORS,
  type CompiledValidator,
  type FieldValidation,
  type FieldValidatorContext,
  type ValidationMessages,
} from '@salmonui/core/validation';
import { useFormReset, formOf } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { FormContext, type FieldEntry, type ValidateOn } from '@salmonui/core/internal/field/context';

/** Field size (a fixed metric set, not density). */
export type FieldSize = 'sm' | 'md' | 'lg';

/**
 * Validation strings, flat keys shared with the Data Grid `localeText`
 * (`validationRequired`, `validationMin`, ...; `{0}` / `{1}` are the rule
 * arguments).
 */
export type FieldValidationText = { readonly [K in keyof ValidationMessages as `validation${Capitalize<K & string>}`]?: string };

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface FieldOptions {
  /** The current value the rules check. */
  readonly value: unknown;
  /** The native element that carries the value (its validity is synced). */
  readonly inputRef: RefObject<Control | null>;
  /** The element focused when the field is the first invalid one; default `inputRef`. */
  readonly focusRef?: RefObject<HTMLElement | null> | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly validation?: FieldValidation | undefined;
  readonly validateOn?: ValidateOn | undefined;
  /** Forces the error state; `errorMessage` is the text. */
  readonly invalid?: boolean | undefined;
  readonly errorMessage?: ReactNode | ((ctx: { readonly errors: readonly string[] }) => ReactNode);
  readonly description?: ReactNode;
  readonly label?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly localeText?: FieldValidationText | undefined;
  /** The component's own constraint error, or null. */
  readonly extraError?: string | null | undefined;
  /** Shows errors immediately (no blur needed); used by controls without a blur model. */
  readonly revealOnChange?: boolean | undefined;
}

function messagesOf(text: FieldValidationText | undefined): ValidationMessages {
  if (!text) return DEFAULT_VALIDATION_MESSAGES;
  let out: Record<string, string> | null = null;
  for (const key of Object.keys(DEFAULT_VALIDATION_MESSAGES) as (keyof ValidationMessages)[]) {
    const value = (text as Record<string, string | undefined>)[`validation${key[0]!.toUpperCase()}${key.slice(1)}`];
    if (typeof value === 'string') (out ??= { ...DEFAULT_VALIDATION_MESSAGES })[key] = value;
  }
  return (out as ValidationMessages | null) ?? DEFAULT_VALIDATION_MESSAGES;
}

/** Maps the native validity flags to the rule messages. */
export function nativeMessage(el: Control, m: ValidationMessages): string {
  const v = el.validity;
  const input = el as HTMLInputElement;
  if (v.valueMissing) return m.required;
  if (v.badInput) return m.number;
  if (v.typeMismatch) return input.type === 'email' ? m.email : input.type === 'url' ? m.url : m.pattern;
  if (v.tooShort) return fill(m.minLength, input.minLength);
  if (v.tooLong) return fill(m.maxLength, input.maxLength);
  if (v.rangeUnderflow) return fill(m.min, input.min);
  if (v.rangeOverflow) return fill(m.max, input.max);
  if (v.patternMismatch || v.stepMismatch) return m.pattern;
  return el.validationMessage || m.validate;
}

function shallowEqual(a: object | undefined, b: object | undefined): boolean {
  if (!a || !b) return a === b;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = (a as Record<string, unknown>)[k];
    const y = (b as Record<string, unknown>)[k];
    if (Object.is(x, y)) continue;
    // `[argument, message]` pairs and `range` tuples compare by element.
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.some((v, i) => !Object.is(v, y[i]))) return false;
  }
  return true;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

export function useField(options: FieldOptions): FieldState {
  const form = use(FormContext);
  const base = useId();
  const inputId = options.id ?? `${base}input`;
  const labelId = `${base}label`;
  const descriptionId = `${base}description`;
  const errorId = `${base}error`;
  // The shared `validation` family: the component's text over the nearest LocaleProvider's.
  const text = useLocaleText('validation', options.localeText);
  const messages = useMemo(() => messagesOf(text), [text]);
  // Inline rule objects (`validation={{ required: true }}`) keep their compiled form while shallow-equal.
  const [rules, setRules] = useState(options.validation);
  if (options.validation !== rules && !shallowEqual(options.validation, rules)) setRules(options.validation);
  // Compiled once per rules (and messages) identity.
  const compiled = useMemo<CompiledValidator | null>(() => (rules ? compileValidationRules(rules, messages) : null), [rules, messages]);
  const validateOn = options.validateOn ?? form?.validateOn ?? 'blur';
  const [revealed, setRevealed] = useState(false);
  const [shown, setShown] = useState<readonly string[]>(NO_ERRORS);
  const [validating, setValidating] = useState(false);
  const [dismissed, setDismissed] = useState<object | null>(null);

  const latest = useRef({ options, compiled, messages, revealed, form });
  useLayoutEffect(() => {
    latest.current = { options, compiled, messages, revealed, form };
  });
  const syncErrors = useRef<readonly string[]>(NO_ERRORS);
  const token = useRef(0);

  /** Built-in rules, native constraints and the component's own error; syncs `setCustomValidity`. */
  const runSync = (): readonly string[] => {
    const { options: o, compiled: c, messages: m } = latest.current;
    let errors = c ? c.validate(o.value, null) : NO_ERRORS;
    if (errors.length === 0 && o.extraError) errors = [o.extraError];
    const el = o.inputRef.current;
    if (el && typeof el.setCustomValidity === 'function') {
      el.setCustomValidity('');
      if (errors.length === 0 && el.willValidate && !el.validity.valid) errors = [nativeMessage(el, m)];
      el.setCustomValidity(errors[0] ?? '');
    }
    syncErrors.current = errors;
    return errors;
  };

  const show = (errors: readonly string[]): void => setShown((prev) => (same(prev, errors) ? prev : errors));

  /** Sync rules, then custom ones; reveals the outcome. */
  const runAll = (): readonly string[] | Promise<readonly string[]> => {
    const errors = runSync();
    const { options: o, compiled: c } = latest.current;
    const id = ++token.current;
    if (errors.length > 0 || !c?.custom || (o.value === null || o.value === undefined || o.value === '')) {
      setValidating(false);
      show(errors);
      return errors;
    }
    const el = o.inputRef.current;
    const owner = formOf(el);
    const ctx: FieldValidatorContext = { name: o.name ?? '', formData: owner ? new FormData(owner) : null, isNew: false };
    const out = c.custom(o.value, ctx, ctx);
    const settle = (message: string | null): readonly string[] => {
      const result = message ? [message] : NO_ERRORS;
      if (id === token.current) {
        setValidating(false);
        el?.setCustomValidity(result[0] ?? '');
        syncErrors.current = result;
        show(result);
      }
      return result;
    };
    if (out !== null && typeof out === 'object' && typeof (out as PromiseLike<unknown>).then === 'function') {
      setValidating(true);
      return Promise.resolve(out as PromiseLike<string | null>).then(settle, () => settle(latest.current.messages.validate));
    }
    return settle(out as string | null);
  };

  // Value changes: keep validity in sync; update shown errors once revealed.
  const previous = useRef<{ value: unknown } | null>(null);
  const resetting = useRef(false);
  useEffect(() => {
    const first = previous.current === null;
    const changed = !first && !Object.is(previous.current!.value, options.value);
    previous.current = { value: options.value };
    // A value restored by a form reset (React 19 resets a form after its action) keeps server errors.
    if (changed && form?.validationErrors && !resetting.current) setDismissed(form.validationErrors);
    if (changed) resetting.current = false;
    const reveal = revealed || (changed && (validateOn === 'change' || options.revealOnChange === true));
    if (reveal) {
      if (!revealed) setRevealed(true);
      void runAll();
    } else runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.value, compiled, options.extraError, messages]);

  // Native `invalid` events (reportValidity, requestSubmit) reveal the field.
  useEffect(() => {
    const el = options.inputRef.current;
    if (!el) return;
    const onInvalid = (event: Event): void => {
      if (latest.current.form) event.preventDefault();
      setRevealed(true);
      show(syncErrors.current.length ? syncErrors.current : el.validationMessage ? [el.validationMessage] : NO_ERRORS);
    };
    el.addEventListener('invalid', onInvalid);
    return () => el.removeEventListener('invalid', onInvalid);
  }, [options.inputRef]);

  // Form registration.
  useEffect(() => {
    if (!form) return;
    const entry: FieldEntry = {
      name: () => latest.current.options.name ?? '',
      element: () => (latest.current.options.focusRef ?? latest.current.options.inputRef).current,
      validate: () => {
        if (latest.current.options.disabled) return NO_ERRORS;
        setRevealed(true);
        return runAll();
      },
      reveal: () => {
        setRevealed(true);
        show(syncErrors.current);
      },
      conceal: () => {
        setRevealed(false);
        setShown(NO_ERRORS);
      },
    };
    return form.register(entry);
  }, [form]);

  useFormReset(options.inputRef, () => {
    token.current++;
    resetting.current = true;
    setRevealed(false);
    setShown(NO_ERRORS);
    setValidating(false);
    // Native controls restore their defaults after the event.
    void Promise.resolve().then(runSync);
  });

  const onBlur = (): void => {
    if (validateOn === 'submit' && !revealed) return;
    if (!revealed) setRevealed(true);
    void runAll();
  };

  const server = options.name && form?.validationErrors && dismissed !== form.validationErrors ? form.validationErrors[options.name] : undefined;
  const serverErrors: readonly string[] = server === undefined ? NO_ERRORS : typeof server === 'string' ? (server ? [server] : NO_ERRORS) : server;
  const visible = options.disabled ? NO_ERRORS : revealed && shown.length ? shown : serverErrors;
  const invalid = options.invalid === true || visible.length > 0;
  const hasDescription = options.description != null && options.description !== false;
  const describedBy = [hasDescription ? descriptionId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined;
  return {
    inputId,
    labelId,
    descriptionId,
    errorId,
    errors: visible,
    invalid,
    validating,
    hasDescription,
    inputProps: {
      id: inputId,
      'aria-describedby': describedBy,
      'aria-invalid': invalid ? true : undefined,
      'aria-errormessage': invalid ? errorId : undefined,
    },
    rootProps: {
      'data-invalid': invalid ? '' : undefined,
      'data-disabled': options.disabled ? '' : undefined,
      'data-validating': validating ? '' : undefined,
    },
    onBlur,
    validate: runAll,
    errorMessage: options.errorMessage,
  };
}

/** Props every Salmon field shares. */
export interface FieldCommonProps {
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  /** Error text (or a function of the errors) shown while the field is invalid. */
  readonly errorMessage?: ReactNode | ((ctx: { readonly errors: readonly string[] }) => ReactNode);
  /** Forces the error state. */
  readonly invalid?: boolean | undefined;
  /** Rules in the Data Grid vocabulary. */
  readonly validation?: FieldValidation | undefined;
  /** When errors appear; default the `Form`'s, else `'blur'`. */
  readonly validateOn?: ValidateOn | undefined;
  /** Metric set. Default `'md'`. */
  readonly size?: FieldSize | undefined;
}

/** Text of the error part: `errorMessage` (node or function) or the first error. */
export function errorContent(field: FieldState): ReactNode {
  const custom = field.errorMessage;
  if (typeof custom === 'function') return custom({ errors: field.errors });
  if (custom != null && custom !== false) return custom;
  return field.errors[0] ?? null;
}

/** `<label>` of a field; nothing without a label. */
export function FieldLabel({ field, children, className }: { readonly field: FieldState; readonly children: ReactNode; readonly className?: string | undefined }): ReactNode {
  if (children == null || children === false) return null;
  return (
    <label className={cx('salmon-field-label', className)} id={field.labelId} htmlFor={field.inputId}>
      {children}
    </label>
  );
}

/** Description and error parts. The error renders only while shown. */
export function FieldHelp({ field, description, classNames, error: showError = true }: { readonly field: FieldState; readonly description?: ReactNode; readonly error?: boolean; readonly classNames?: { readonly description?: string; readonly error?: string } | undefined }): ReactNode {
  const error = field.invalid ? errorContent(field) : null;
  return (
    <>
      {field.hasDescription ? (
        <div className={cx('salmon-field-description', classNames?.description)} id={field.descriptionId}>
          {description}
        </div>
      ) : null}
      {field.invalid && showError ? (
        <div className={cx('salmon-field-error', classNames?.error)} id={field.errorId}>
          {error}
        </div>
      ) : null}
    </>
  );
}

/** Joins class names, skipping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  let out = '';
  for (const n of names) if (n) out = out ? `${out} ${n}` : n;
  return out;
}
