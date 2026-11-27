'use client';

// DateRangePicker: two
// `DateField`s with a separator in one group, a trigger, and a popup dialog
// with presets, a two-month `RangeCalendar`, the range summary and Apply /
// Cancel (`confirm`, default true).

import { useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { compare, getRangeDays, intlSpaces, type DateInput, type DateRange, type PlainDate } from '@salmonui/core/internal/dates/index';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { DateField, type DateFieldProps } from '../date-field/DateField.js';
import type { FieldChangeDetails } from '../date-field/types.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { isoOf, valueOf, type PickerCalendarProps } from '../internal/picker-values.js';
import {
  cx,
  defined,
  fieldReason,
  domRest,
  focusFirst,
  formatText,
  FormValue,
  PICKER_CALLBACKS,
  useLazyModule,
  sourceOf,
  usePickerOpen,
  useTimeZone,
  type ChangeSource,
  type PickerFieldProps,
  type PickerHandle,
  type PickerMessage,
} from '../internal/picker.js';

/** UI strings of `DateRangePicker` (`localeText`). */
export interface DateRangePickerLocaleText {
  readonly chooseRange: PickerMessage;
  readonly startDate: PickerMessage;
  readonly endDate: PickerMessage;
  readonly presets: PickerMessage;
  readonly apply: PickerMessage;
  readonly cancel: PickerMessage;
  readonly clear: PickerMessage;
  /** Range summary: `{count}` days (plural forms). */
  readonly selectedDays: PickerMessage;
  readonly noRange: PickerMessage;
  readonly rangeUnderflow: PickerMessage;
  readonly rangeOverflow: PickerMessage;
  /** `{min}` days. */
  readonly tooShort: PickerMessage;
  /** `{max}` days. */
  readonly tooLong: PickerMessage;
  readonly reversed: PickerMessage;
  readonly unavailable: PickerMessage;
}

export const DATE_RANGE_PICKER_DEFAULT_LOCALE_TEXT: DateRangePickerLocaleText = Object.freeze({
  chooseRange: 'Choose date range',
  startDate: 'Start date',
  endDate: 'End date',
  presets: 'Presets',
  apply: 'Apply',
  cancel: 'Cancel',
  clear: 'Clear',
  selectedDays: { one: '{count} day', other: '{count} days' },
  noRange: 'No range selected',
  rangeUnderflow: 'Choose {min} or later.',
  rangeOverflow: 'Choose {max} or earlier.',
  tooShort: 'Choose at least {min} days.',
  tooLong: 'Choose at most {max} days.',
  reversed: 'The end date is before the start date.',
  unavailable: 'The range includes an unavailable date.',
});

/** A preset range. Function values are evaluated when the popup opens. */
export interface DateRangePreset {
  readonly label: ReactNode;
  readonly value: DateRange<DateInput> | (() => DateRange<DateInput>);
}

export interface DateRangePickerValueChangeDetails {
  readonly source: ChangeSource;
  readonly reason: 'input' | 'calendar' | 'preset' | 'apply' | 'clear' | 'reset' | 'strict';
  /** The ISO 8601 interval `start/end` (`''` when empty). */
  readonly iso: string;
}

export interface DateRangePickerProps extends PickerFieldProps, Omit<PickerCalendarProps, 'focusedValue' | 'defaultFocusedValue'> {
  readonly value?: DateRange<DateInput> | null | undefined;
  readonly defaultValue?: DateRange<DateInput> | null | undefined;
  readonly onValueChange?: ((value: DateRange | null, details: DateRangePickerValueChangeDetails) => void) | undefined;
  /** Both ends chosen in the popup, before Apply. */
  readonly onRangeSelect?: ((range: DateRange) => void) | undefined;
  readonly granularity?: 'day' | 'month' | 'year' | undefined;
  readonly min?: DateInput | null | undefined;
  readonly max?: DateInput | null | undefined;
  /** Shortest and longest allowed span in days, inclusive. */
  readonly minDays?: number | undefined;
  readonly maxDays?: number | undefined;
  /** Whether a range may span `isDateDisabled` days. Default `'block'`. */
  readonly rangeOverDisabled?: 'block' | 'allow' | undefined;
  readonly presets?: readonly DateRangePreset[] | undefined;
  /** Between the two fields; also splits pasted text. Default an en dash. */
  readonly separator?: ReactNode | undefined;
  /** Apply / Cancel in the popup (default `true`); `false` commits on the second selection. */
  readonly confirm?: boolean | undefined;
  /** Months shown side by side (default 2; one under a narrow container). */
  readonly visibleMonths?: number | undefined;
  /** Form names of the two ends; `name` posts one ISO interval instead. */
  readonly startName?: string | undefined;
  readonly endName?: string | undefined;
  readonly format?: Intl.DateTimeFormatOptions | string | undefined;
  readonly localeText?: Partial<DateRangePickerLocaleText> | undefined;
  readonly ref?: Ref<PickerHandle> | undefined;
}


type PopupModule = typeof import('./popup.js');
/** The popup (calendar, time list, overlay) is a lazy chunk, preloaded when idle after mount. */
const loadPopup = (): Promise<PopupModule> => import('./popup.js');

export type Granularity = 'day' | 'month' | 'year';

function dateOf(input: unknown, granularity: Granularity, zone: string | null): PlainDate | null {
  return valueOf(input, granularity, zone) as PlainDate | null;
}

export function rangeOf(input: DateRange<DateInput> | null | undefined, granularity: Granularity, zone: string | null): DateRange | null {
  if (!input) return null;
  const start = dateOf(input.start, granularity, zone);
  const end = dateOf(input.end, granularity, zone);
  return start && end ? { start, end } : null;
}

export const sameRange = (a: DateRange | null, b: DateRange | null): boolean => a === b || (a !== null && b !== null && compare(a.start, b.start) === 0 && compare(a.end, b.end) === 0);
const SPLIT = /\s+(?:–|—|-|to|bis|à|a)\s+|\s*[–—/]\s*|\s*~\s*/i;

/** Splits pasted range text on the separator. */
export function splitRangeText(text: string, separator?: string): [string, string] | null {
  const t = text.trim();
  if (separator && separator.trim() && t.includes(separator.trim())) {
    const i = t.indexOf(separator.trim());
    return [t.slice(0, i).trim(), t.slice(i + separator.trim().length).trim()];
  }
  // ISO dates contain '-': split on a separator surrounded by space, or an en dash, or '/'.
  const parts = t.split(SPLIT);
  return parts.length === 2 ? [parts[0] as string, parts[1] as string] : null;
}

export function DateRangePicker(props: DateRangePickerProps) {
  const locale = useLocale(props.locale) ?? 'en-US';
  const granularity = props.granularity ?? 'day';
  const zone = useTimeZone(props.timeZone);
  const text = { ...DATE_RANGE_PICKER_DEFAULT_LOCALE_TEXT, ...useLocaleText('dateRangePicker', props.localeText) };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const labelId = `${baseId}label`;
  const descriptionId = `${baseId}description`;
  const errorId = `${baseId}error`;
  const dialogId = `${baseId}dialog`;

  // `defaultValue` is read once; an instant resolves when the zone does (after hydration without `timeZone`).
  const [defaultInput] = useState(() => props.defaultValue);
  const initial = rangeOf(defaultInput, granularity, zone);
  const controlled = props.value !== undefined;
  // Uncontrolled and untouched (`undefined`): the resolved default.
  const [touched, setStored] = useControllableState<DateRange | null | undefined, [DateRangePickerValueChangeDetails]>(controlled ? rangeOf(props.value, granularity, zone) : undefined, undefined, (next, details) => props.onValueChange?.(next ?? null, details), 'value');
  const value = touched === undefined ? initial : touched;
  // Typed ends while the range is incomplete or reversed.
  const [partial, setPartial] = useState<{ start: PlainDate | null; end: PlainDate | null } | null>(null);
  const shownStart = partial ? partial.start : (value?.start ?? null);
  const shownEnd = partial ? partial.end : (value?.end ?? null);
  const min = dateOf(props.min, granularity, zone);
  const max = dateOf(props.max, granularity, zone);

  const labelFormat = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...(granularity === 'year' ? { year: 'numeric' } : granularity === 'month' ? { year: 'numeric', month: 'short' } : { dateStyle: 'medium' }) }), [locale, granularity]);
  const label = (d: PlainDate): string => labelFormat.format(Date.UTC(d.year, d.month - 1, d.day));
  const rangeLabel = (r: DateRange): string => {
    const f = labelFormat as Intl.DateTimeFormat & { formatRange?: (a: number, b: number) => string };
    const a = Date.UTC(r.start.year, r.start.month - 1, r.start.day);
    const b = Date.UTC(r.end.year, r.end.month - 1, r.end.day);
    return typeof f.formatRange === 'function' ? intlSpaces(f.formatRange(a, b)) : `${label(r.start)} – ${label(r.end)}`;
  };

  const validityOf = (r: DateRange | null): string => {
    if (!r) return partial && shownStart && shownEnd && compare(shownStart, shownEnd) > 0 ? formatText(text.reversed, {}, locale) : '';
    if (min && compare(r.start, min) < 0) return formatText(text.rangeUnderflow, { min: label(min) }, locale);
    if (max && compare(r.end, max) > 0) return formatText(text.rangeOverflow, { max: label(max) }, locale);
    const days = getRangeDays(r);
    if (granularity === 'day' && props.minDays !== undefined && days < props.minDays) return formatText(text.tooShort, { min: props.minDays }, locale);
    if (granularity === 'day' && props.maxDays !== undefined && days > props.maxDays) return formatText(text.tooLong, { max: props.maxDays }, locale);
    if (props.isDateDisabled && (props.isDateDisabled(r.start) || props.isDateDisabled(r.end))) return formatText(text.unavailable, {}, locale);
    return '';
  };
  const validity = validityOf(value);
  const invalid = Boolean(props.invalid) || validity !== '';

  const { open, mode, setOpen } = usePickerOpen(props, rootRef);
  const lazy = useLazyModule(loadPopup, open);
  const isoOfRange = (r: DateRange | null): string => (r ? `${isoOf(r.start, granularity)}/${isoOf(r.end, granularity)}` : '');
  const commit = (next: DateRange | null, source: ChangeSource, reason: DateRangePickerValueChangeDetails['reason']): void => {
    setPartial(null);
    if (sameRange(next, value)) return;
    setStored(next, { source, reason, iso: isoOfRange(next) });
  };
  const onEnd = (which: 'start' | 'end', d: PlainDate | null, details?: FieldChangeDetails): void => {
    const start = which === 'start' ? d : shownStart;
    const end = which === 'end' ? d : shownEnd;
    if (start && end && compare(start, end) <= 0) commit({ start, end }, details?.source ?? 'keyboard', details ? fieldReason(details) : 'input');
    else {
      setPartial({ start, end });
      if (value) setStored(null, { source: 'keyboard', reason: 'input', iso: '' });
    }
  };

  const show = (source: ChangeSource, reason: 'trigger' | 'keyboard' | 'focus' | 'field' | 'api'): void => {
    const el = rootRef.current?.ownerDocument.activeElement as HTMLElement | null;
    returnFocus.current = el && controlRef.current?.contains(el) ? el : null;
    setOpen(true, { source, reason });
  };
  const hide = (source: ChangeSource, reason: 'escape' | 'outside' | 'tab' | 'select' | 'apply' | 'cancel' | 'api' | 'trigger', refocus: boolean): void => {
    setOpen(false, { source, reason });
    if (refocus) {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
      else triggerRef.current?.focus();
    }
  };
  const handle: PickerHandle = {
    get element() {
      return rootRef.current;
    },
    focus: (options) => focusFirst(startRef.current, options),
    blur: () => {
      const el = rootRef.current?.ownerDocument.activeElement as HTMLElement | null;
      if (el && rootRef.current?.contains(el)) el.blur();
    },
    open: () => show('api', 'api'),
    close: () => hide('api', 'api', false),
  };
  useImperativeHandle(props.ref, () => handle);

  const editable = props.editable !== false;
  const onControlKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (!open) show('keyboard', 'keyboard');
    } else if (open && (e.key === 'Escape' || (e.altKey && e.key === 'ArrowUp'))) {
      e.preventDefault();
      e.stopPropagation();
      hide('keyboard', 'escape', true);
    }
  };
  const onRootFocus = (e: FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    props.onFocus?.(e);
    // Not on the trigger: its click follows the focus and would close the popup again.
    if (props.openOnFocus && !open && !(e.target as Element).classList.contains('salmon-picker__trigger')) show('keyboard', 'focus');
  };
  const onRootBlur = (e: FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    // each field clamps itself with `strict`; an incomplete or reversed range reverts.
    if (props.strict && partial) commit(value, 'keyboard', 'strict');
    props.onBlur?.(e);
  };
  // a pasted range fills both ends; anything else is the field's own paste.
  const onPasteCapture = (e: ClipboardEvent<HTMLDivElement>): void => {
    if (props.readOnly || props.disabled || !editable) return;
    const sep = typeof props.separator === 'string' ? props.separator : undefined;
    const parts = splitRangeText(e.clipboardData.getData('text'), sep);
    if (!parts) return;
    const [a, b] = parts.map((p) => dateOf(p, granularity, zone));
    if (!a || !b) return;
    e.preventDefault();
    e.stopPropagation();
    if (compare(a, b) <= 0) commit({ start: a, end: b }, 'keyboard', 'input');
    else setPartial({ start: a, end: b });
  };

  const empty = shownStart === null && shownEnd === null;
  const describedBy = cx(props['aria-describedby'], props.description ? descriptionId : null, invalid && props.errorMessage ? errorId : null) || undefined;
  const fieldProps = (which: 'start' | 'end') =>
    defined({
      ref: which === 'start' ? startRef : endRef,
      className: 'salmon-picker__field',
      'aria-label': formatText(which === 'start' ? text.startDate : text.endDate, {}, locale),
      value: which === 'start' ? shownStart : shownEnd,
      onValueChange: (d: PlainDate | null, details: FieldChangeDetails) => onEnd(which, d ? dateOf(d, granularity, null) : null, details),
      granularity,
      locale,
      format: props.format,
      hourCycle: props.hourCycle,
      min: min ?? undefined,
      max: max ?? undefined,
      isDateDisabled: props.isDateDisabled,
      strict: props.strict,
      disabled: props.disabled,
      readOnly: props.readOnly || !editable,
      invalid: props.invalid,
      'aria-describedby': describedBy,
      onClick: !editable && !props.disabled && !props.readOnly ? () => (open ? hide('pointer', 'trigger', false) : show('pointer', 'field')) : undefined,
    }) as unknown as DateFieldProps;
  const formProps = { form: props.form, required: props.required, disabled: props.disabled, validity, onInvalid: () => (props.onInvalid?.(), focusFirst(startRef.current)), onReset: () => commit(initial, 'api', 'reset') } as const;
  return (
    <div
      ref={rootRef}
      className={cx('salmon-date-range-picker', 'salmon-picker', props.className)}
      style={props.style}
      dir={props.dir}
      data-size={props.size ?? 'md'}
      data-open={open ? '' : undefined}
      data-disabled={props.disabled ? '' : undefined}
      data-readonly={props.readOnly ? '' : undefined}
      data-invalid={invalid ? '' : undefined}
      data-empty={empty ? '' : undefined}
      onFocus={onRootFocus}
      onBlur={onRootBlur}
    >
      {props.label ? (
        <span id={labelId} className="salmon-picker__label" onClick={() => focusFirst(startRef.current)}>
          {props.label}
        </span>
      ) : null}
      <div
        {...domRest(props, PICKER_CALLBACKS)}
        ref={controlRef}
        id={props.id}
        role="group"
        className="salmon-picker__control"
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby'] ?? (props.label ? labelId : undefined)}
        onKeyDownCapture={onControlKeyDown}
        onPasteCapture={onPasteCapture}
      >
        <DateField {...fieldProps('start')} />
        <span className="salmon-date-range-picker__separator" aria-hidden="true">
          {props.separator ?? '–'}
        </span>
        <DateField {...fieldProps('end')} />
        {props.placeholder && empty ? (
          <span className="salmon-picker__placeholder" aria-hidden="true">
            {props.placeholder}
          </span>
        ) : null}
        {props.clearable && !empty && !props.disabled && !props.readOnly ? (
          <button
            type="button"
            className="salmon-picker__clear"
            aria-label={formatText(text.clear, {}, locale)}
            tabIndex={-1}
            onClick={(e) => {
              commit(null, sourceOf(e), 'clear');
              props.onClear?.();
              focusFirst(startRef.current);
            }}
          />
        ) : null}
        <button
          ref={triggerRef}
          type="button"
          className="salmon-picker__trigger"
          data-icon="calendar"
          aria-label={formatText(text.chooseRange, {}, locale)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          disabled={props.disabled}
          aria-disabled={props.readOnly || undefined}
          onClick={(e) => {
            if (props.readOnly) return;
            if (open) hide(sourceOf(e), 'trigger', true);
            else show(sourceOf(e), 'trigger');
          }}
        />
      </div>
      {props.description ? (
        <div id={descriptionId} className="salmon-picker__description">
          {props.description}
        </div>
      ) : null}
      {invalid && props.errorMessage ? (
        <div id={errorId} className="salmon-picker__error">
          {props.errorMessage}
        </div>
      ) : null}
      {props.startName !== undefined || props.endName !== undefined ? (
        <>
          <FormValue {...formProps} name={props.startName} value={value ? isoOf(value.start, granularity) : ''} />
          <FormValue {...formProps} name={props.endName} value={value ? isoOf(value.end, granularity) : ''} validity="" onReset={undefined} />
        </>
      ) : props.name !== undefined || props.required ? (
        <FormValue {...formProps} name={props.name} value={isoOfRange(value)} />
      ) : null}
      {open && mode && lazy ? (
        <lazy.DateRangePickerPopup
          shell={{ id: dialogId, mode, role: 'dialog', anchorRef: controlRef, insideRef: rootRef, className: 'salmon-picker__popup salmon-date-range-picker__popup', 'aria-label': formatText(text.chooseRange, {}, locale), onDismiss: (reason) => hide('pointer', reason, reason === 'escape') }}
          {...props}
          locale={locale}
          mode={mode}
          granularity={granularity}
          value={value}
          min={min}
          max={max}
          zone={zone}
          text={text}
          rangeLabel={rangeLabel}
          onCommit={(range, source, reason) => {
            commit(range, source, reason);
            hide(source, reason === 'apply' ? 'apply' : 'select', true);
          }}
          onCancel={(source) => hide(source, 'cancel', true)}
        />
      ) : null}
    </div>
  );
}

