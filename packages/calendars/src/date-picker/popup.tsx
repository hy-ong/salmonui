'use client';

// DatePicker popup (lazy chunk): Calendar, and
// for the time granularities a TimeField and the time list, inside the
// picker popup. Loaded when idle after mount (DatePicker.tsx).

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { compare, plainTime, toPlainDate, toPlainTime, type PlainDate, type PlainDateTime, type PlainTime } from '@salmonui/core/internal/dates/index';
import { useLocale } from '@salmonui/core/internal/locale';
import { Calendar, type CalendarSingleProps } from '../calendar.js';
import { TimeField, type TimeFieldProps } from '../date-field/TimeField.js';
import { defined, formatText, sourceOf, type ChangeSource } from '../internal/picker.js';
import { PickerPopup, useActiveDescendant, type PickerPopupProps } from '../internal/picker-popup.js';
import { valueOf } from '../internal/picker-values.js';
import { TimeList } from '../internal/TimeList.js';
import { compareTimes, nearestOption, timeListKey, timeOfDayMs, timeOptions } from '../internal/time-list.js';
import type { DatePickerCalendarProps, DatePickerGranularity, DatePickerLocaleText } from './DatePicker.js';

const TIME_GRANULARITIES = new Set<DatePickerGranularity>(['hour', 'minute', 'second']);

type ContentProps = PopupContentProps;

interface PopupContentProps extends DatePickerCalendarProps {
  readonly mode: 'popover' | 'modal';
  readonly value: PlainDate | PlainDateTime | null;
  readonly granularity: DatePickerGranularity;
  readonly calendarGranularity: 'day' | 'month' | 'year';
  readonly min: PlainDate | PlainDateTime | null;
  readonly max: PlainDate | PlainDateTime | null;
  readonly minTime: PlainTime | null;
  readonly maxTime: PlainTime | null;
  readonly placeholderValue: PlainDate | PlainDateTime | null;
  readonly zone: string | null;
  readonly timeZone?: string | undefined;
  readonly locale?: string | undefined;
  readonly hourCycle?: 'h12' | 'h23' | undefined;
  readonly timeStep?: number | undefined;
  readonly text: DatePickerLocaleText;
  readonly listId: string;
  readonly timeRef: { current: HTMLDivElement | null };
  readonly formatTime: (t: PlainTime) => string;
  onDate(date: PlainDate, source: ChangeSource): void;
  onTime(time: PlainTime, source: ChangeSource, close: boolean): void;
  onClose(): void;
}

/** Popup body: mounted only while open, so "today" is computed on the client after a user action. */
function DatePickerPopupContent(props: PopupContentProps) {
  const { value, min, max, minTime, maxTime, granularity } = props;
  const locale = useLocale(props.locale) ?? 'en-US';
  const withTime = TIME_GRANULARITIES.has(granularity);
  const dayOf = (v: PlainDate | PlainDateTime | null): PlainDate | null => (v ? toPlainDate(v) : null);
  const selectedDay = dayOf(value);

  // The time list honors the daily window and, on the boundary days, `min` / `max`.
  const day = selectedDay ?? dayOf(props.placeholderValue);
  const lo = [minTime, day && min && compare(day, toPlainDate(min) as PlainDate) === 0 && withTime ? toPlainTime(min as PlainDateTime) : null].filter((t): t is PlainTime => t !== null).sort((a, b) => compareTimes(b, a))[0] ?? null;
  const hi = [maxTime, day && max && compare(day, toPlainDate(max) as PlainDate) === 0 && withTime ? toPlainTime(max as PlainDateTime) : null].filter((t): t is PlainTime => t !== null).sort(compareTimes)[0] ?? null;
  const step = granularity === 'hour' ? Math.max(60, props.timeStep ?? 60) : (props.timeStep ?? 30);
  const loKey = lo ? timeOfDayMs(lo) : -1;
  const hiKey = hi ? timeOfDayMs(hi) : -1;
  const options = useMemo(() => (withTime ? timeOptions(step, loKey >= 0 ? msTime(loKey) : null, hiKey >= 0 ? msTime(hiKey) : null) : []), [withTime, step, loKey, hiKey]);
  const time = withTime && value ? toPlainTime(value as PlainDateTime) : null;
  const [active, setActive] = useState(() => nearestOption(options, time ?? (props.placeholderValue && withTime ? toPlainTime(props.placeholderValue as PlainDateTime) : null)));
  const controlRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useActiveDescendant(withTime, controlRef, props.listId, active >= 0 ? `${props.listId}-${active}` : null);
  // Focus the selected day (else placeholderValue, else today) once the calendar is rendered.
  useLayoutEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('[data-salmon-focus]')?.focus({ preventScroll: true });
  }, []);

  const focus = props.defaultFocusedValue;
  const initialFocus = (focus !== undefined ? (valueOf(focus, 'day', props.zone) as PlainDate | null) : null) ?? selectedDay ?? dayOf(props.placeholderValue);
  const disabledOption = (): boolean => false;

  const onTimeKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const next = timeListKey(e.key, options.length, active, disabledOption);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (next === 'select') {
      const t = options[active];
      if (t) props.onTime(t, 'keyboard', true);
    } else if (next >= 0) setActive(next);
  };
  return (
    <div ref={bodyRef} className="salmon-date-picker__body">
      <Calendar
        {...(defined({
          value: selectedDay,
          focusedValue: props.focusedValue,
          defaultFocusedValue: initialFocus ?? undefined,
          onFocusedValueChange: props.onFocusedValueChange,
          view: props.view,
          defaultView: props.defaultView,
          onViewChange: props.onViewChange,
          onValueChange: (d: PlainDate | null, details: { source: 'pointer' | 'keyboard' | 'api' }) => d && props.onDate(d, details.source),
          granularity: props.calendarGranularity,
          min: dayOf(min) ?? undefined,
          max: dayOf(max) ?? undefined,
          isDateDisabled: props.isDateDisabled,
          renderDay: props.renderDay,
          getDayProps: props.getDayProps,
          firstDayOfWeek: props.firstDayOfWeek,
          showWeekNumbers: props.showWeekNumbers,
          weekRule: props.weekRule,
          weekdayFormat: props.weekdayFormat,
          showTodayButton: props.showTodayButton,
          showOutsideDays: props.showOutsideDays,
          locale,
          calendar: props.calendar,
          timeZone: props.timeZone,
        }) as CalendarSingleProps)}
      />
      {withTime ? (
        <div className="salmon-date-picker__time" ref={controlRef} onKeyDownCapture={onTimeKey}>
          <TimeField
            {...(defined({
              ref: props.timeRef,
              className: 'salmon-date-picker__time-field',
              'aria-label': formatText(props.text.time, {}, locale),
              value: time,
              granularity: granularity as 'hour' | 'minute' | 'second',
              locale,
              hourCycle: props.hourCycle,
              readOnly: !selectedDay && !props.placeholderValue,
              onValueChange: (t: PlainTime | null) => {
                if (!t) return;
                props.onTime(t, 'keyboard', false);
                const i = nearestOption(options, t);
                if (i >= 0) setActive(i);
              },
            }) as TimeFieldProps)}
          />
          <TimeList
            id={props.listId}
            className="salmon-date-picker__time-list"
            options={options}
            selected={time}
            active={active}
            format={props.formatTime}
            aria-label={formatText(props.text.timeList, {}, locale)}
            onActiveChange={setActive}
            onSelect={(t, e) => props.onTime(t, sourceOf(e), true)}
          />
        </div>
      ) : null}
      {props.mode === 'modal' ? (
        <div className="salmon-picker__actions">
          <button type="button" className="salmon-picker__button" onClick={props.onClose}>
            {formatText(props.text.close, {}, locale)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const msTime = (ms: number): PlainTime => {
  const s = Math.floor(ms / 1000);
  return plainTime(Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60);
};

/** The popup with its content: the lazy chunk's entry. */
export function DatePickerPopup(props: ContentProps & { readonly shell: Omit<PickerPopupProps, 'children'> }) {
  const { shell, ...rest } = props;
  return (
    <PickerPopup {...shell}>
      <DatePickerPopupContent {...rest} />
    </PickerPopup>
  );
}
