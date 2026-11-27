'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { formatValue, parseNumber } from '@salmonui/core/format';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { DEFAULT_VALIDATION_MESSAGES as MESSAGES } from '@salmonui/core/validation';
import { clearOnEscape, InputGroup } from '../internal/input-group/input-group.js';
import { usePressRepeat } from '@salmonui/core/internal/press';

/** Second argument of `onValueChange`. */
export interface NumberChangeDetails {
  readonly source: 'keyboard' | 'pointer' | 'wheel' | 'api';
  readonly reason: 'input' | 'increment' | 'decrement' | 'clamp' | 'clear' | 'reset';
  /** The value as the blurred field shows it. */
  readonly formattedValue: string;
}

/** User-visible strings of NumberField. */
export type NumberFieldLocaleText = FieldValidationText & { readonly increment?: string; readonly decrement?: string; readonly clear?: string };

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'size' | 'type' | 'className' | 'style' | 'children' | 'min' | 'max' | 'step'>;

export interface NumberFieldProps extends FieldCommonProps, NativeInput {
  readonly value?: number | null | undefined;
  readonly defaultValue?: number | null | undefined;
  readonly onValueChange?: ((value: number | null, details: NumberChangeDetails) => void) | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Arrow keys and the stepper change the value by `step`; Page keys by ten steps. Default 1. */
  readonly step?: number | undefined;
  /** Increment and decrement buttons. Default true. */
  readonly showStepper?: boolean | undefined;
  /** `Intl.NumberFormat` options of the blurred text. */
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
  /** A Data Grid `column.format` preset or pattern instead (`'n2'`, `'C2'`, `'P1'`, `'#,##0.00'`). */
  readonly format?: string | undefined;
  /** ISO 4217 code for currency formats. */
  readonly currency?: string | undefined;
  /** BCP 47 locale for formatting and parsing. Default `'en-US'`; the host locale is never read. */
  readonly locale?: string | undefined;
  /** Fraction digits the committed value is rounded to. */
  readonly decimals?: number | undefined;
  /** Refuses typing more fraction digits than `decimals`. */
  readonly restrictDecimals?: boolean | undefined;
  /** `'blur'` (default) clamps to `min` / `max` on blur; `'none'` keeps the value and reports the range error. */
  readonly clampBehavior?: 'blur' | 'none' | undefined;
  /** Mouse wheel over the focused field steps the value. Default false. */
  readonly incrementOnWheel?: boolean | undefined;
  readonly clearable?: boolean | undefined;
  readonly startAdornment?: ReactNode;
  readonly endAdornment?: ReactNode;
  readonly localeText?: NumberFieldLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: { readonly group?: string; readonly input?: string; readonly label?: string; readonly description?: string; readonly error?: string; readonly stepper?: string } | undefined;
  /** The native `<input>`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

const OWN = new Set(['value', 'defaultValue', 'onValueChange', 'min', 'max', 'step', 'showStepper', 'formatOptions', 'format', 'currency', 'locale', 'decimals', 'restrictDecimals', 'clampBehavior', 'incrementOnWheel', 'clearable', 'startAdornment', 'endAdornment', 'localeText', 'className', 'style', 'classNames', 'ref', 'label', 'description', 'errorMessage', 'invalid', 'validation', 'validateOn', 'size', 'name', 'form', 'onBlur', 'onFocus', 'onKeyDown', 'onChange', 'onWheel']);

const formats = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let nf = formats.get(key);
  if (!nf) {
    if (formats.size > 64) formats.clear();
    nf = new Intl.NumberFormat(locale, options);
    formats.set(key, nf);
  }
  return nf;
}

const round = (n: number, digits: number | undefined): number => (digits === undefined ? n : Number(n.toFixed(Math.max(0, Math.min(20, digits)))));
// Float steps (0.1 + 0.2) stay exact to the step's own precision.
const precisionOf = (n: number): number => {
  const s = String(n);
  const e = s.indexOf('e-');
  if (e >= 0) return Number(s.slice(e + 2));
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
};

/**
 * Numeric input: a text input with
 * `role="spinbutton"`, formatted with `Intl.NumberFormat` (or a Data Grid
 * format preset) when blurred and shown raw while focused. A hidden input
 * with `name` submits the number. `ref` is the visible input.
 */
export function NumberField(props: NumberFieldProps): ReactNode {
  const { min, max, step = 1, decimals, clampBehavior = 'blur' } = props;
  const locale = useLocale(props.locale) ?? 'en-US';
  // Own keys, then the `numberField` family, then the shared `validation` one (range and number messages).
  const m = useLocaleText('validation', useLocaleText('numberField', props.localeText));
  const initial = useRef(props.defaultValue ?? null);
  const [value, setValue] = useControllableState<number | null, [NumberChangeDetails]>(props.value === undefined ? undefined : props.value, initial.current, props.onValueChange, 'NumberField value');
  const options: Intl.NumberFormatOptions = props.formatOptions ?? (props.currency && !props.format ? { style: 'currency', currency: props.currency } : {});
  const percent = options.style === 'percent' || /^p\d*$/i.test(props.format ?? '');
  const formatted = (n: number | null): string => {
    if (n === null || Number.isNaN(n)) return '';
    if (props.format) return formatValue(n, props.format, { locale, ...(props.currency ? { currency: props.currency } : {}), type: 'number' });
    return numberFormat(locale, decimals !== undefined && options.maximumFractionDigits === undefined ? { ...options, maximumFractionDigits: decimals } : options).format(n);
  };
  // Raw editing text: locale decimal symbol, no grouping; percent shown as the percent number.
  const editText = (n: number | null): string => (n === null ? '' : numberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 }).format(percent ? round(n * 100, 12) : n));
  const parse = (text: string): number | null => parseNumber(text, { locale, formatOptions: percent ? { ...options, style: 'percent' } : options });
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const outOfRange = value !== null && ((min !== undefined && value < min) || (max !== undefined && value > max));
  const rangeError =
    !outOfRange || value === null ? null : min !== undefined && value < min ? (m?.validationMin ?? MESSAGES.min).replace('{0}', formatted(min)) : (m?.validationMax ?? MESSAGES.max).replace('{0}', formatted(max ?? 0));
  const badText = draft !== null && draft.trim() !== '' && Number.isNaN(parse(draft) as number) ? (m?.validationNumber ?? MESSAGES.number) : null;
  const field = useField({ ...props, localeText: m, value, inputRef, extraError: badText ?? rangeError });

  const emit = (next: number | null, source: NumberChangeDetails['source'], reason: NumberChangeDetails['reason']): void => setValue(next, { source, reason, formattedValue: formatted(next) });
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const stepBy = (delta: number, source: NumberChangeDetails['source']): void => {
    if (props.disabled || props.readOnly) return;
    const base = draft !== null ? (parse(draft) ?? 0) : (value ?? 0);
    const start = Number.isNaN(base) ? 0 : base;
    const digits = Math.max(precisionOf(step), precisionOf(start));
    const next = clamp(round(start + delta * step, digits));
    if (draft !== null) setDraft(editText(next));
    emit(next, source, delta > 0 ? 'increment' : 'decrement');
  };

  useFormReset(inputRef, () => {
    setDraft(null);
    emit(initial.current, 'api', 'reset');
  });

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && caret.current !== null) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  // opt-in wheel stepping; the listener is non-passive so the page does not scroll.
  const latest = useRef(stepBy);
  useLayoutEffect(() => {
    latest.current = stepBy;
  });
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !props.incrementOnWheel) return;
    const onWheel = (event: WheelEvent): void => {
      if (document.activeElement !== el || event.deltaY === 0) return;
      event.preventDefault();
      latest.current(event.deltaY < 0 ? 1 : -1, 'wheel');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [props.incrementOnWheel]);

  const up = usePressRepeat<HTMLButtonElement>({ onPress: (s) => stepBy(1, s === 'keyboard' ? 'keyboard' : 'pointer'), disabled: props.disabled || props.readOnly || (max !== undefined && value !== null && value >= max) });
  const down = usePressRepeat<HTMLButtonElement>({ onPress: (s) => stepBy(-1, s === 'keyboard' ? 'keyboard' : 'pointer'), disabled: props.disabled || props.readOnly || (min !== undefined && value !== null && value <= min) });

  const native: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.has(key)) native[key] = (props as unknown as Record<string, unknown>)[key];
  const text = draft ?? formatted(value);
  const canClear = props.clearable === true && value !== null && !props.disabled && !props.readOnly;
  const fraction = (t: string): number => {
    const sep = numberFormat(locale, {}).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
    const i = Math.max(t.lastIndexOf(sep), sep === '.' ? -1 : t.lastIndexOf('.'));
    return i < 0 ? 0 : t.length - i - 1;
  };

  return (
    <FieldStateContext value={field}>
      <div className={cx('salmon-field salmon-number-field', props.className)} style={props.style} data-size={props.size ?? 'md'} {...field.rootProps}>
        <FieldLabel field={field} className={props.classNames?.label}>{props.label}</FieldLabel>
        <InputGroup
          size={props.size}
          start={props.startAdornment}
          end={props.endAdornment}
          clear={canClear ? { label: m?.clear ?? 'Clear', onClear: () => (setDraft(draft === null ? null : ''), emit(null, 'pointer', 'clear')) } : null}
          className={props.classNames?.group}
        >
          <input
            {...native}
            {...field.inputProps}
            ref={(el) => {
              inputRef.current = el;
              assignRef(props.ref as never, el);
            }}
            type="text"
            inputMode={(native['inputMode'] as InputHTMLAttributes<HTMLInputElement>['inputMode']) ?? 'decimal'}
            role="spinbutton"
            autoComplete={(native['autoComplete'] as string | undefined) ?? 'off'}
            aria-valuenow={value ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={value === null ? undefined : formatted(value)}
            aria-required={props.required || undefined}
            className={cx('salmon-input', props.classNames?.input)}
            value={text}
            onChange={(event) => {
              props.onChange?.(event);
              const next = event.currentTarget.value;
              if (props.restrictDecimals && decimals !== undefined && fraction(next) > decimals) {
                caret.current = Math.max(0, (event.currentTarget.selectionStart ?? 1) - 1);
                return;
              }
              setDraft(next);
              const n = parse(next);
              if (n === null) emit(null, 'keyboard', 'input');
              else if (!Number.isNaN(n)) emit(n, 'keyboard', 'input');
            }}
            onFocus={(event: FocusEvent<HTMLInputElement>) => {
              props.onFocus?.(event);
              setDraft((d) => d ?? editText(value));
            }}
            onBlur={(event: FocusEvent<HTMLInputElement>) => {
              props.onBlur?.(event);
              const parsed = draft === null ? value : parse(draft);
              setDraft(null);
              if (parsed !== null && !Number.isNaN(parsed)) {
                let next = round(parsed, decimals);
                if (clampBehavior === 'blur') next = clamp(next);
                if (next !== value) emit(next, 'keyboard', next !== parsed ? 'clamp' : 'input');
              }
              field.onBlur();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              props.onKeyDown?.(event);
              if (event.defaultPrevented || clearOnEscape(event, canClear, () => (setDraft(''), emit(null, 'keyboard', 'clear')))) return;
              const k = event.key;
              const handled = k === 'ArrowUp' || k === 'ArrowDown' || k === 'PageUp' || k === 'PageDown' || (k === 'Home' && min !== undefined) || (k === 'End' && max !== undefined);
              if (!handled) return;
              event.preventDefault();
              if (k === 'Home' || k === 'End') {
                if (props.readOnly) return;
                const next = k === 'Home' ? (min as number) : (max as number);
                setDraft(editText(next));
                emit(next, 'keyboard', k === 'Home' ? 'decrement' : 'increment');
                return;
              }
              stepBy(k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : k === 'PageUp' ? 10 : -10, 'keyboard');
            }}
          />
          {props.showStepper === false ? null : (
            <span className={cx('salmon-number-field-stepper', props.classNames?.stepper)}>
              <button type="button" tabIndex={-1} className="salmon-number-field-step" data-direction="up" aria-label={m?.increment ?? 'Increment'} disabled={props.disabled} {...up} />
              <button type="button" tabIndex={-1} className="salmon-number-field-step" data-direction="down" aria-label={m?.decrement ?? 'Decrement'} disabled={props.disabled} {...down} />
            </span>
          )}
        </InputGroup>
        {props.name ? <input type="hidden" name={props.name} form={props.form} value={value === null ? '' : String(value)} disabled={props.disabled} /> : null}
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}
