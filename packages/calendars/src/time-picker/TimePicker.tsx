'use client';

// TimePicker: a segmented `TimeField`,
// a trigger (`aria-haspopup="listbox"`) and a popup listbox of times every
// `step` minutes between `min` and `max`. Focus stays in the field; the
// field carries `aria-activedescendant` while the list is open.

import { useId, useImperativeHandle, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { isInstant, toPlainTime, type DateFormat, type PlainTime, type TimeInput } from '@salmonui/core/internal/dates/index';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { TimeField, type TimeFieldProps } from '../date-field/TimeField.js';
import type { FieldChangeDetails } from '../date-field/types.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import {
  cx,
  defined,
  fieldReason,
  domRest,
  focusFirst,
  formatText,
  FormValue,
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
import { compareTimes, nearestOption, stepOption, timeListKey, timeOptions, type TimeOptionContext } from '../internal/time-list.js';

type PopupModule = typeof import('./popup.js');
/** The popup (calendar, time list, overlay) is a lazy chunk, preloaded when idle after mount. */
const loadPopup = (): Promise<PopupModule> => import('./popup.js');


/** UI strings of `TimePicker` (`localeText`). */
export interface TimePickerLocaleText {
  readonly openTimeList: PickerMessage;
  readonly clear: PickerMessage;
  readonly timeList: PickerMessage;
  /** Validity message for a value before `min` (`{min}`). */
  readonly rangeUnderflow: PickerMessage;
  /** Validity message for a value after `max` (`{max}`). */
  readonly rangeOverflow: PickerMessage;
  readonly unavailable: PickerMessage;
}

export const TIME_PICKER_DEFAULT_LOCALE_TEXT: TimePickerLocaleText = Object.freeze({
  openTimeList: 'Choose time',
  clear: 'Clear',
  timeList: 'Times',
  rangeUnderflow: 'Choose {min} or later.',
  rangeOverflow: 'Choose {max} or earlier.',
  unavailable: 'This time is not available.',
});

/** Second argument of `onValueChange`. */
export interface TimePickerValueChangeDetails {
  readonly source: ChangeSource;
  readonly reason: 'input' | 'option' | 'clear' | 'reset' | 'strict';
  /** The form value: `HH:mm` or `HH:mm:ss` (`''` when empty). */
  readonly iso: string;
}

export interface TimePickerProps extends PickerFieldProps {
  readonly value?: TimeInput | null | undefined;
  readonly defaultValue?: TimeInput | null | undefined;
  readonly onValueChange?: ((value: PlainTime | null, details: TimePickerValueChangeDetails) => void) | undefined;
  /** Minutes between list options (default 30). */
  readonly step?: number | undefined;
  readonly min?: TimeInput | null | undefined;
  readonly max?: TimeInput | null | undefined;
  /** Disabled times: skipped in the list, invalid when typed. */
  readonly isTimeDisabled?: ((time: PlainTime) => boolean) | undefined;
  /** Deepest segment (default `'minute'`). */
  readonly granularity?: 'hour' | 'minute' | 'second' | undefined;
  /** Display format of the field (`Intl` options, a skeleton or a pattern); `Intl` options also format the option labels. */
  readonly format?: DateFormat | undefined;
  /** List position and segment seed without a value. */
  readonly placeholderValue?: TimeInput | null | undefined;
  /** Option content. */
  readonly renderOption?: ((ctx: TimeOptionContext) => ReactNode) | undefined;
  readonly localeText?: Partial<TimePickerLocaleText> | undefined;
  readonly ref?: Ref<PickerHandle> | undefined;
}

export function isoTime(t: PlainTime | null, granularity: 'hour' | 'minute' | 'second'): string {
  if (!t) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return granularity === 'second' ? `${p(t.hour)}:${p(t.minute)}:${p(t.second)}` : `${p(t.hour)}:${p(t.minute)}`;
}

/** A time input in `zone`; an instant waits for the zone (server render: `null`). */
function timeOf(input: unknown, zone: string | null): PlainTime | null {
  if (input === null || input === undefined || (isInstant(input) && !zone)) return null;
  return toPlainTime(input, zone ?? undefined);
}


export function TimePicker(props: TimePickerProps) {
  const locale = useLocale(props.locale) ?? 'en-US';
  const granularity = props.granularity ?? 'minute';
  const zone = useTimeZone(props.timeZone);
  const text = { ...TIME_PICKER_DEFAULT_LOCALE_TEXT, ...useLocaleText('timePicker', props.localeText) };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const id = props.id ?? `${baseId}field`;
  const labelId = `${baseId}label`;
  const descriptionId = `${baseId}description`;
  const errorId = `${baseId}error`;
  const listId = `${baseId}list`;

  // `defaultValue` is read once; an instant resolves when the zone does (after hydration without `timeZone`).
  const [defaultInput] = useState(() => props.defaultValue);
  const initial = timeOf(defaultInput, zone);
  const controlled = props.value !== undefined;
  // Uncontrolled and untouched (`undefined`): the resolved default.
  const [touched, setStored] = useControllableState<PlainTime | null | undefined, [TimePickerValueChangeDetails]>(controlled ? timeOf(props.value, zone) : undefined, undefined, (next, details) => props.onValueChange?.(next ?? null, details), 'value');
  const stored = touched === undefined ? initial : touched;
  const value = stored;
  const min = timeOf(props.min, zone);
  const max = timeOf(props.max, zone);
  const placeholderValue = timeOf(props.placeholderValue, zone);
  const step = props.step ?? 30;
  const minKey = min ? min.toString() : '';
  const maxKey = max ? max.toString() : '';
  const options = useMemo(() => timeOptions(step, minKey ? timeOf(minKey, null) : null, maxKey ? timeOf(maxKey, null) : null), [step, minKey, maxKey]);
  const isDisabled = props.isTimeDisabled;
  const formatter = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = typeof props.format === 'object' ? props.format : { hour: 'numeric', minute: '2-digit', ...(granularity === 'second' ? { second: '2-digit' } : null) };
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC', ...(props.hourCycle ? { hourCycle: props.hourCycle } : null) });
  }, [locale, props.format, props.hourCycle, granularity]);
  const format = (t: PlainTime): string => formatter.format(Date.UTC(1970, 0, 1, t.hour, t.minute, t.second));

  const below = value !== null && min !== null && compareTimes(value, min) < 0;
  const above = value !== null && max !== null && compareTimes(value, max) > 0;
  const unavailable = value !== null && Boolean(isDisabled?.(value));
  const validity = below ? formatText(text.rangeUnderflow, { min: format(min) }, locale) : above ? formatText(text.rangeOverflow, { max: format(max) }, locale) : unavailable ? formatText(text.unavailable, {}, locale) : '';
  const invalid = Boolean(props.invalid) || validity !== '';

  const { open, mode, setOpen } = usePickerOpen(props, rootRef);
  const [active, setActive] = useState(-1);
  const optionDisabled = (i: number): boolean => Boolean(isDisabled?.(options[i] as PlainTime));
  const lazy = useLazyModule(loadPopup, open);

  const iso = (t: PlainTime | null): string => isoTime(t, granularity);
  const commit = (next: PlainTime | null, source: ChangeSource, reason: TimePickerValueChangeDetails['reason']): void => {
    if (next === value || (next && value && compareTimes(next, value) === 0)) return;
    setStored(next, { source, reason, iso: iso(next) });
  };
  const show = (source: ChangeSource, reason: 'trigger' | 'keyboard' | 'focus' | 'field' | 'api'): void => {
    const el = rootRef.current?.ownerDocument.activeElement as HTMLElement | null;
    returnFocus.current = el && controlRef.current?.contains(el) && el.tagName !== 'BUTTON' ? el : null;
    const from = value ?? placeholderValue;
    let start = nearestOption(options, from);
    if (start >= 0 && optionDisabled(start)) start = stepOption(options.length, start, 1, optionDisabled);
    setActive(start);
    setOpen(true, { source, reason });
  };
  const hide = (source: ChangeSource, reason: 'escape' | 'outside' | 'tab' | 'select' | 'api' | 'trigger', refocus: boolean): void => {
    setOpen(false, { source, reason });
    if (refocus) {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
      else focusFirst(fieldRef.current);
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

  // Capture phase: list keys win over the segment keys while the list is open.
  const onControlKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (!open) show('keyboard', 'keyboard');
      return;
    }
    if (!open) return;
    if (e.key === 'Escape' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      hide('keyboard', 'escape', true);
      return;
    }
    if (e.key === 'Tab') {
      hide('keyboard', 'tab', false);
      return;
    }
    const next = timeListKey(e.key, options.length, active, optionDisabled);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (next === 'select') {
      const t = options[active];
      if (t && !optionDisabled(active)) commit(t, 'keyboard', 'option');
      hide('keyboard', 'select', true);
    } else if (next >= 0) setActive(next);
  };

  const onFieldValue = (next: PlainTime | null, details: FieldChangeDetails): void => {
    commit(next, details.source === 'api' ? 'api' : details.source, fieldReason(details));
    if (open && next) {
      const i = nearestOption(options, next);
      if (i >= 0) setActive(i);
    }
  };

  // onFocus / onBlur once for the whole group, popup included.
  const onRootFocus = (e: FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    props.onFocus?.(e);
    // Not on the trigger: its click follows the focus and would close the popup again.
    if (props.openOnFocus && !open && !(e.target as Element).classList.contains('salmon-picker__trigger')) show('keyboard', 'focus');
  };
  const onRootBlur = (e: FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    props.onBlur?.(e);
  };

  const editable = props.editable !== false;
  const empty = value === null;
  const describedBy = cx(props['aria-describedby'], props.description ? descriptionId : null, invalid && props.errorMessage ? errorId : null) || undefined;
  return (
    <div
      ref={rootRef}
      className={cx('salmon-time-picker', 'salmon-picker', props.className)}
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
        <span id={labelId} className="salmon-picker__label" onClick={() => focusFirst(fieldRef.current)}>
          {props.label}
        </span>
      ) : null}
      <div {...domRest(props, PICKER_CALLBACKS)} ref={controlRef} className="salmon-picker__control" onKeyDownCapture={onControlKeyDown}>
        <TimeField
          {...(defined({
            id: id,
            ref: fieldRef,
            className: 'salmon-picker__field',
            value: value,
            onValueChange: onFieldValue,
            granularity: granularity,
            locale: locale,
            format: props.format,
            hourCycle: props.hourCycle,
            min: min ?? undefined,
            max: max ?? undefined,
            isTimeDisabled: isDisabled,
            strict: props.strict,
            disabled: props.disabled,
            readOnly: props.readOnly || !editable,
            invalid: props.invalid,
            placeholderValue: placeholderValue ?? undefined,
            'aria-label': props['aria-label'],
            'aria-labelledby': props['aria-labelledby'] ?? (props.label ? labelId : undefined),
            'aria-describedby': describedBy,
            onClick: !editable && !props.disabled && !props.readOnly ? () => (open ? hide('pointer', 'trigger', false) : show('pointer', 'field')) : undefined,
          }) as unknown as TimeFieldProps)}
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
          type="button"
          className="salmon-picker__trigger"
          data-icon="time"
          aria-label={formatText(text.openTimeList, {}, locale)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={props.disabled}
          aria-disabled={props.readOnly || undefined}
          tabIndex={-1}
          onClick={(e) => {
            if (props.readOnly) return;
            if (open) hide(sourceOf(e), 'trigger', true);
            else {
              show(sourceOf(e), 'trigger');
              focusFirst(fieldRef.current, { preventScroll: true });
            }
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
          value={iso(value)}
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
        <lazy.TimePickerPopup
          shell={{ mode, anchorRef: controlRef, insideRef: rootRef, className: 'salmon-picker__popup salmon-time-picker__popup', 'aria-label': formatText(text.timeList, {}, locale), onDismiss: (reason) => hide('pointer', reason, reason === 'escape') }}
          controlRef={controlRef}
          id={listId}
          options={options}
          selected={value}
          active={active}
          format={format}
          isDisabled={isDisabled}
          renderOption={props.renderOption}
          aria-label={formatText(text.timeList, {}, locale)}
          onActiveChange={setActive}
          onSelect={(t, e) => {
            commit(t, sourceOf(e), 'option');
            hide(sourceOf(e), 'select', true);
          }}
        />
      ) : null}
    </div>
  );
}
