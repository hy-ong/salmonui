'use client';

// DatePicker: a segmented `DateField`,
// a trigger (`aria-haspopup="dialog"`) and a popup dialog holding
// `Calendar`, plus a `TimeField` and a time listbox for the time
// granularities (the DateTimePicker fold). APG "Date Picker Dialog".

import { useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from 'react';
import { compare, isInstant, offsetAt, plainDate, plainDateTime, plainTime, toEpoch, toPlainDate, toPlainDateTime, toPlainTime, wallOf, type DateFormat, type DateInput, type ParseFn, type PlainDate, type PlainDateTime, type PlainTime, type TimeInput, type WeekRule, type WeekdayFormat } from '@salmonui/core/internal/dates/index';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { isoOf, valueOf, type PickerCalendarProps, type PickerGranularity } from '../internal/picker-values.js';
import { DateField, type DateFieldProps } from '../date-field/DateField.js';
import type { FieldChangeDetails } from '../date-field/types.js';

export { isoOf, valueOf };
import { useControllableState } from '@salmonui/core/internal/controllable';
import {
  cx,
  domRest,
  focusFirst,
  formatText,
  FormValue,
  defined,
  fieldReason,
  PICKER_CALLBACKS,
  sourceOf,
  useLazyModule,
  usePickerOpen,
  useTimeZone,
  type ChangeSource,
  type PickerFieldProps,
  type PickerHandle,
  type PickerMessage,
} from '../internal/picker.js';
import { compareTimes } from '../internal/time-list.js';

export type DatePickerGranularity = PickerGranularity;

/** UI strings of `DatePicker` (`localeText`). */
export interface DatePickerLocaleText {
  readonly chooseDate: PickerMessage;
  readonly chooseDateTime: PickerMessage;
  readonly clear: PickerMessage;
  readonly close: PickerMessage;
  readonly time: PickerMessage;
  readonly timeList: PickerMessage;
  /** Validity message for a value before `min` (`{min}`). */
  readonly rangeUnderflow: PickerMessage;
  /** Validity message for a value after `max` (`{max}`). */
  readonly rangeOverflow: PickerMessage;
  readonly unavailable: PickerMessage;
}

export const DATE_PICKER_DEFAULT_LOCALE_TEXT: DatePickerLocaleText = Object.freeze({
  chooseDate: 'Choose date',
  chooseDateTime: 'Choose date and time',
  clear: 'Clear',
  close: 'Close',
  time: 'Time',
  timeList: 'Times',
  rangeUnderflow: 'Choose {min} or later.',
  rangeOverflow: 'Choose {max} or earlier.',
  unavailable: 'This date is not available.',
});

/** Second argument of `onValueChange`. */
export interface DatePickerValueChangeDetails {
  readonly source: ChangeSource;
  readonly reason: 'input' | 'calendar' | 'time' | 'clear' | 'reset' | 'strict';
  /** The form value (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `YYYY-MM-DDTHH:mm[:ss]` with an offset when `timeZone` is given; `''` when empty). */
  readonly iso: string;
  /** The instant of a date-time value in the resolved time zone. */
  readonly epochMilliseconds?: number | undefined;
}

/** The popup `Calendar` props a `DatePicker` forwards. */
export type DatePickerCalendarProps = PickerCalendarProps;

export interface DatePickerProps extends PickerFieldProps, DatePickerCalendarProps {
  /** A `PlainDate` or `PlainDateTime` (what `onValueChange` passes), fields, an ISO string or a `Date` instant. */
  readonly value?: DateInput | null | undefined;
  readonly defaultValue?: DateInput | null | undefined;
  /** `PlainDate` for `'year' | 'month' | 'day'`, `PlainDateTime` for `'hour' | 'minute' | 'second'`. */
  readonly onValueChange?: ((value: PlainDate | PlainDateTime | null, details: DatePickerValueChangeDetails) => void) | undefined;
  /** Deepest segment; also the deepest calendar view and the time part. Default `'day'`. */
  readonly granularity?: DatePickerGranularity | undefined;
  readonly min?: DateInput | null | undefined;
  readonly max?: DateInput | null | undefined;
  /** Display format of the field: `Intl` options, a skeleton (`'yMMMd'`) or a pattern (`'dd/MM/yyyy'`); the segments follow it. */
  readonly format?: DateFormat | undefined;
  /** Extra patterns accepted when typing over or pasting a whole value. */
  readonly inputFormats?: readonly string[] | undefined;
  /** Custom text parser for paste. */
  readonly parse?: ParseFn | undefined;
  /** Segment seed and popup position without a value. */
  readonly placeholderValue?: DateInput | null | undefined;
  /** Minutes between time list options (default 30). */
  readonly timeStep?: number | undefined;
  /** Daily time window. */
  readonly minTime?: TimeInput | null | undefined;
  readonly maxTime?: TimeInput | null | undefined;
  readonly localeText?: Partial<DatePickerLocaleText> | undefined;
  readonly ref?: Ref<PickerHandle> | undefined;
}


type PopupModule = typeof import('./popup.js');
/** The popup (calendar, time list, overlay) is a lazy chunk, preloaded when idle after mount. */
const loadPopup = (): Promise<PopupModule> => import('./popup.js');

const TIME_GRANULARITIES = new Set<DatePickerGranularity>(['hour', 'minute', 'second']);
const timeOfInput = (input: unknown): PlainTime | null => (input === null || input === undefined ? null : toPlainTime(input));

export function DatePicker(props: DatePickerProps) {
  const locale = useLocale(props.locale) ?? 'en-US';
  const granularity = props.granularity ?? 'day';
  const withTime = TIME_GRANULARITIES.has(granularity);
  const zone = useTimeZone(props.timeZone);
  const text = { ...DATE_PICKER_DEFAULT_LOCALE_TEXT, ...useLocaleText('datePicker', props.localeText) };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const id = props.id ?? `${baseId}field`;
  const labelId = `${baseId}label`;
  const descriptionId = `${baseId}description`;
  const errorId = `${baseId}error`;
  const dialogId = `${baseId}dialog`;
  const listId = `${baseId}times`;

  // `defaultValue` is read once; an instant resolves when the zone does (after hydration without `timeZone`).
  const [defaultInput] = useState(() => props.defaultValue);
  const initial = valueOf(defaultInput, granularity, zone);
  const controlled = props.value !== undefined;
  // Uncontrolled and untouched (`undefined`): the resolved default.
  const [touched, setStored] = useControllableState<PlainDate | PlainDateTime | null | undefined, [DatePickerValueChangeDetails]>(controlled ? valueOf(props.value, granularity, zone) : undefined, undefined, (next, details) => props.onValueChange?.(next ?? null, details), 'value');
  const value = touched === undefined ? initial : touched;
  const min = valueOf(props.min, withTime ? 'second' : 'day', zone);
  const max = valueOf(props.max, withTime ? 'second' : 'day', zone);
  const minTime = timeOfInput(props.minTime);
  const maxTime = timeOfInput(props.maxTime);
  const placeholderValue = valueOf(props.placeholderValue, withTime ? 'second' : 'day', zone);

  // Display labels for validity messages.
  const labelFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...(granularity === 'year' ? { year: 'numeric' } : granularity === 'month' ? { year: 'numeric', month: 'long' } : { dateStyle: 'medium' }), ...(withTime ? { timeStyle: 'short' } : null) }),
    [locale, granularity, withTime],
  );
  const label = (v: PlainDate & Partial<PlainTime>): string => labelFormat.format(Date.UTC(v.year, v.month - 1, v.day, v.hour ?? 0, v.minute ?? 0, v.second ?? 0));
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...(granularity === 'second' ? { second: '2-digit' } : null), timeZone: 'UTC', ...(props.hourCycle ? { hourCycle: props.hourCycle } : null) }), [locale, granularity, props.hourCycle]);
  const formatTime = (t: PlainTime): string => timeFormat.format(Date.UTC(1970, 0, 1, t.hour, t.minute, t.second));

  const cmp = (a: PlainDate & Partial<PlainTime>, b: PlainDate & Partial<PlainTime>): number => (withTime ? compare(a, b) : granularity === 'day' ? compare(toPlainDate(a) as PlainDate, toPlainDate(b) as PlainDate) : granularity === 'month' ? a.year * 12 + a.month - (b.year * 12 + b.month) : a.year - b.year);
  const below = value !== null && min !== null && cmp(value, min) < 0;
  const above = value !== null && max !== null && cmp(value, max) > 0;
  const outsideWindow = value !== null && withTime && ((minTime !== null && compareTimes(value as PlainDateTime, minTime) < 0) || (maxTime !== null && compareTimes(value as PlainDateTime, maxTime) > 0));
  const unavailable = value !== null && (Boolean(props.isDateDisabled?.(toPlainDate(value) as PlainDate)) || outsideWindow);
  const validity = below && min ? formatText(text.rangeUnderflow, { min: label(min) }, locale) : above && max ? formatText(text.rangeOverflow, { max: label(max) }, locale) : unavailable ? formatText(text.unavailable, {}, locale) : '';
  const invalid = Boolean(props.invalid) || validity !== '';

  const { open, mode, setOpen } = usePickerOpen(props, rootRef);
  const lazy = useLazyModule(loadPopup, open);

  // ISO and instant of a value.
  const detailsOf = (next: PlainDate | PlainDateTime | null): { iso: string; epochMilliseconds?: number } => {
    const epoch = next && withTime && zone ? toEpoch(next as PlainDateTime, zone) : null;
    if (epoch === null) return { iso: isoOf(next, granularity) };
    // The wall time of the instant: a time in a DST gap resolves forward.
    const offset = props.timeZone ? (offsetAt(epoch, zone as string) ?? undefined) : undefined;
    return { iso: isoOf(wallOf(epoch, zone as string), granularity, offset), epochMilliseconds: epoch };
  };
  const commit = (next: PlainDate | PlainDateTime | null, source: ChangeSource, reason: DatePickerValueChangeDetails['reason']): void => {
    if (next === value || (next && value && compare(next, value) === 0)) return;
    setStored(next, { source, reason, ...detailsOf(next) });
  };

  const show = (source: ChangeSource, reason: 'trigger' | 'keyboard' | 'focus' | 'field' | 'api'): void => {
    const el = rootRef.current?.ownerDocument.activeElement as HTMLElement | null;
    returnFocus.current = el && controlRef.current?.contains(el) ? el : null;
    setOpen(true, { source, reason });
  };
  const hide = (source: ChangeSource, reason: 'escape' | 'outside' | 'tab' | 'select' | 'api' | 'trigger', refocus: boolean): void => {
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
    focus: (options) => focusFirst(fieldRef.current, options),
    blur: () => {
      const el = rootRef.current?.ownerDocument.activeElement as HTMLElement | null;
      if (el && rootRef.current?.contains(el)) el.blur();
    },
    open: () => show('api', 'api'),
    close: () => hide('api', 'api', false),
  };
  useImperativeHandle(props.ref, () => handle);

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
    if (props.openOnFocus && !open && (e.target as Element) !== triggerRef.current) show('keyboard', 'focus');
  };
  const onRootBlur = (e: FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    props.onBlur?.(e);
  };

  const editable = props.editable !== false;
  const empty = value === null;
  const describedBy = cx(props['aria-describedby'], props.description ? descriptionId : null, invalid && props.errorMessage ? errorId : null) || undefined;
  const calendarGranularity = granularity === 'year' || granularity === 'month' ? granularity : 'day';
  return (
    <div
      ref={rootRef}
      className={cx('salmon-date-picker', 'salmon-picker', props.className)}
      style={props.style}
      dir={props.dir}
      data-size={props.size ?? 'md'}
      data-open={open ? '' : undefined}
      data-disabled={props.disabled ? '' : undefined}
      data-readonly={props.readOnly ? '' : undefined}
      data-invalid={invalid ? '' : undefined}
      data-empty={empty ? '' : undefined}
      data-granularity={granularity}
      onFocus={onRootFocus}
      onBlur={onRootBlur}
    >
      {props.label ? (
        <span id={labelId} className="salmon-picker__label" onClick={() => focusFirst(fieldRef.current)}>
          {props.label}
        </span>
      ) : null}
      <div {...domRest(props, PICKER_CALLBACKS)} ref={controlRef} className="salmon-picker__control" onKeyDownCapture={onControlKeyDown}>
        <DateField
          {...(defined({
            id,
            ref: fieldRef,
            className: 'salmon-picker__field',
            value,
            onValueChange: (next: PlainDate | PlainDateTime | null, details: FieldChangeDetails) => commit(next ? valueOf(next, granularity, null) : null, details.source, fieldReason(details)),
            granularity,
            locale,
            format: props.format,
            inputFormats: props.inputFormats,
            parse: props.parse,
            hourCycle: props.hourCycle,
            min: min ?? undefined,
            max: max ?? undefined,
            isDateDisabled: props.isDateDisabled,
            strict: props.strict,
            disabled: props.disabled,
            readOnly: props.readOnly || !editable,
            invalid: props.invalid,
            placeholderValue: placeholderValue ?? undefined,
            'aria-label': props['aria-label'],
            'aria-labelledby': props['aria-labelledby'] ?? (props.label ? labelId : undefined),
            'aria-describedby': describedBy,
            onClick: !editable && !props.disabled && !props.readOnly ? () => (open ? hide('pointer', 'trigger', false) : show('pointer', 'field')) : undefined,
          }) as unknown as DateFieldProps)}
        />
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
              focusFirst(fieldRef.current);
            }}
          />
        ) : null}
        <button
          ref={triggerRef}
          type="button"
          className="salmon-picker__trigger"
          data-icon="calendar"
          aria-label={formatText(withTime ? text.chooseDateTime : text.chooseDate, {}, locale)}
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
      {props.name !== undefined || props.required ? (
        <FormValue
          name={props.name}
          form={props.form}
          value={detailsOf(value).iso}
          required={props.required}
          disabled={props.disabled}
          validity={validity}
          onInvalid={() => {
            props.onInvalid?.();
            focusFirst(fieldRef.current);
          }}
          onReset={() => commit(initial, 'api', 'reset')}
        />
      ) : null}
      {open && mode && lazy ? (
        <lazy.DatePickerPopup
          shell={{ id: dialogId, mode, role: 'dialog', anchorRef: controlRef, insideRef: rootRef, className: 'salmon-picker__popup salmon-date-picker__popup', 'aria-label': formatText(withTime ? text.chooseDateTime : text.chooseDate, {}, locale), onDismiss: (reason) => hide('pointer', reason, reason === 'escape') }}
          {...props}
          mode={mode}
          value={value}
          granularity={granularity}
          calendarGranularity={calendarGranularity}
          min={min}
          max={max}
          minTime={minTime}
          maxTime={maxTime}
          placeholderValue={placeholderValue}
          zone={zone}
          text={text}
          listId={listId}
          timeRef={timeRef}
          formatTime={formatTime}
          onDate={(date, source) => {
            if (!withTime) {
              commit(valueOf(date, granularity, null), source, 'calendar');
              hide(source, 'select', true);
              return;
            }
            // Keep the time part (or the placeholder's, or the window start) and move focus to the time part.
            const prev = value as PlainDateTime | null;
            const t = prev ?? (placeholderValue as PlainDateTime | null) ?? minTime ?? plainTime(0, 0);
            commit(plainDateTime(date, plainTime(t.hour, t.minute, t.second ?? 0)), source, 'calendar');
            requestAnimationFrame(() => focusFirst(timeRef.current));
          }}
          onTime={(t, source, close) => {
            const base = (value as PlainDateTime | null) ?? (placeholderValue as PlainDateTime | null);
            const date = base ? toPlainDate(base) : null;
            if (date) commit(valueOf(plainDateTime(date, t), granularity, null), source, 'time');
            if (close) hide(source, 'select', true);
          }}
          onClose={() => hide('pointer', 'escape', true)}
        />
      ) : null}
    </div>
  );
}

