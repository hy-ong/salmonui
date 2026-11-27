'use client';

// Calendar and RangeCalendar. The grid of the APG
// "Date Picker Dialog" example: a header with previous / next buttons and a
// view button (month → year → decade), a `table` with `role="grid"`
// labelled by the heading, weekday column headers (`abbr` = long name),
// optional week-number row headers, and one focusable cell per day with a
// roving tabindex. Values are plain ISO dates (`#dates`); all math is on day
// numbers. Today and the host time zone are client-only: the server renders
// neither.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  addCalendarMonths,
  calendarLabels,
  calendarSystem,
  decadeGrid,
  fromDays,
  isInstant,
  isoDate,
  localeFirstDay,
  localeWeekRule,
  monthGrid,
  monthLength,
  resolveCalendar,
  toDays,
  toPlainDate,
  wallOf,
  weekNumber,
  weekStart,
  yearGrid,
  type CalendarSystem,
  type DateInput,
  type DateRange,
  type PlainDate,
} from '@salmonui/core/internal/dates/index';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { formatText } from '../internal/text.js';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { useClientValue, useHydrated } from '@salmonui/core/internal/hydrated';
import type {
  CalendarBaseProps,
  CalendarChangeDetails,
  CalendarDayContext,
  CalendarLocaleText,
  CalendarMultipleProps,
  CalendarProps,
  CalendarSingleProps,
  CalendarView,
  RangeCalendarProps,
} from './types.js';

export const CALENDAR_TEXT: CalendarLocaleText = {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  previousDecade: 'Previous decade',
  nextDecade: 'Next decade',
  today: 'Today',
  weekNumber: 'Wk',
  weekNumberHeader: 'Week',
  weekNumberLabel: 'Week {week}',
  rangeStartSelected: '{date} selected as the start date',
  selectedRange: { one: '{start} to {end}, {count} day', other: '{start} to {end}, {count} days' },
};

const VIEWS: readonly CalendarView[] = ['month', 'year', 'decade'];
const VIEW_OF = { day: 'month', month: 'year', year: 'decade' } as const;

type Kind = 'single' | 'multiple' | 'range';
type Source = CalendarChangeDetails['source'];

interface RootProps extends CalendarBaseProps {
  readonly kind: Kind;
  readonly value?: unknown;
  readonly defaultValue?: unknown;
  readonly onValueChange?: (value: never, details: CalendarChangeDetails) => void;
  readonly visibleMonths?: number;
  readonly minDays?: number;
  readonly maxDays?: number;
  readonly rangeOverDisabled?: 'block' | 'allow';
}


/** A day cell's position: `[gridIndex, cellIndex]` for focus lookups is the day number itself. */
function CalendarRoot(props: RootProps) {
  const {
    kind,
    value: valueProp,
    defaultValue,
    onValueChange,
    granularity = 'day',
    view: viewProp,
    defaultView,
    onViewChange,
    minView: minViewProp,
    maxView = 'decade',
    focusedValue,
    defaultFocusedValue,
    onFocusedValueChange,
    min: minProp,
    max: maxProp,
    isDateDisabled,
    renderDay,
    getDayProps,
    firstDayOfWeek,
    showWeekNumbers = false,
    weekRule,
    weekdayFormat = 'short',
    calendar: calendarProp,
    locale: ownLocale,
    timeZone,
    showTodayButton = false,
    showOutsideDays = false,
    disabled = false,
    readOnly = false,
    localeText: ownText,
    visibleMonths = 1,
    minDays,
    maxDays,
    rangeOverDisabled = 'block',
    className,
    ref,
    ...rest
  } = props;
  const locale = useLocale(ownLocale) ?? 'en-US';
  const localeText = useLocaleText('calendar', ownText);
  const id = useId();
  const hydrated = useHydrated();
  const zoneReady = timeZone !== undefined || hydrated;
  const today = useClientValue(() => {
    const w = wallOf(Date.now(), timeZone);
    return w ? toDays(w) : 0;
  });
  // A day number of an input in the calendar zone; an instant waits for the zone (server render: null).
  const days = (input: unknown): number | null => {
    if (input === null || input === undefined || (!zoneReady && isInstant(input))) return null;
    const d = toPlainDate(input, timeZone);
    return d ? toDays(d) : null;
  };
  const text = (key: keyof CalendarLocaleText, params?: Record<string, string | number>): string => formatText(localeText?.[key] ?? CALENDAR_TEXT[key], params, locale);

  const minView: CalendarView = minViewProp ?? VIEW_OF[granularity];
  const clampView = (v: CalendarView): CalendarView => VIEWS[Math.min(Math.max(VIEWS.indexOf(v), VIEWS.indexOf(minView)), Math.max(VIEWS.indexOf(maxView), VIEWS.indexOf(minView)))] as CalendarView;
  const [viewState, setView] = useControllableState<CalendarView>(viewProp, () => defaultView ?? minView, undefined, 'Calendar view');
  const view = clampView(viewState);

  const [rawValue, setRawValue] = useControllableState<unknown>(valueProp, () => defaultValue ?? (kind === 'multiple' ? [] : null), undefined, 'Calendar value');
  // Selected day numbers (single / multiple) or the range ends.
  let selected: number[] = [];
  let range: { start: number; end: number } | null = null;
  if (kind === 'range') {
    const r = rawValue as DateRange<DateInput> | null;
    const s = days(r?.start);
    const e = days(r?.end);
    if (s !== null && e !== null) range = { start: Math.min(s, e), end: Math.max(s, e) };
  } else if (kind === 'multiple') {
    for (const v of Array.isArray(rawValue) ? (rawValue as unknown[]) : []) {
      const n = days(v);
      if (n !== null) selected.push(n);
    }
  } else {
    const n = days(rawValue);
    if (n !== null) selected = [n];
  }

  const min = days(minProp);
  const max = days(maxProp);
  const sys: CalendarSystem = calendarSystem(resolveCalendar(locale, calendarProp));
  const firstDay = Number.isInteger(firstDayOfWeek) && firstDayOfWeek! >= 0 && firstDayOfWeek! <= 6 ? firstDayOfWeek! : localeFirstDay(locale);
  const rule = weekRule ?? localeWeekRule(locale);
  const labels = calendarLabels(locale, sys, firstDay, weekdayFormat);

  const [focusState, setFocusState] = useControllableState<DateInput | null>(focusedValue, () => defaultFocusedValue ?? null, undefined, 'Calendar focusedValue');
  const clamp = (n: number): number => (min !== null && n < min ? min : max !== null && n > max ? max : n);
  const focusRaw = days(focusState) ?? (range ? range.start : selected[0]) ?? today;
  const focus = focusRaw === null ? null : clamp(focusRaw);

  // Range selection: the first chosen day until the second one, and the previewed end.
  const [anchor, setAnchor] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const unitStart = (n: number, v: CalendarView): number => {
    const f = sys.fields(n);
    return v === 'year' ? sys.start(f.year, f.month) : v === 'decade' ? sys.start(f.year, 1) : n;
  };
  // First visible month (RangeCalendar with several months): the focused month, or the window the last
  // navigation kept while the focus stays inside it (updated in event handlers, never during render).
  const months = Math.max(1, Math.floor(visibleMonths));
  const [windowStart, setWindowStart] = useState<number | null>(null);
  const windowFor = (n: number, start: number | null): number => {
    const m = unitStart(n, 'year');
    return start !== null && m >= start && m < addCalendarMonths(sys, start, months) ? start : start !== null && m >= start ? addCalendarMonths(sys, m, 1 - months) : m;
  };
  const first: number | null = focus === null ? null : windowFor(focus, windowStart);

  const outOfRange = (n: number): boolean => (min !== null && n < min) || (max !== null && n > max);
  const dayDisabled = (n: number): boolean => disabled || outOfRange(n) || (isDateDisabled?.(fromDays(n)) ?? false);

  // While a range start is chosen: days outside minDays / maxDays, and with 'block' past the first disabled day.
  let lowLimit = -Infinity;
  let highLimit = Infinity;
  if (kind === 'range' && anchor !== null) {
    if (maxDays !== undefined) (lowLimit = anchor - maxDays + 1), (highLimit = anchor + maxDays - 1);
    if (rangeOverDisabled === 'block') {
      const reach = 3660;
      for (let n = anchor - 1; n >= Math.max(lowLimit, anchor - reach); n--) if (dayDisabled(n)) { lowLimit = n + 1; break; }
      for (let n = anchor + 1; n <= Math.min(highLimit, anchor + reach); n++) if (dayDisabled(n)) { highLimit = n - 1; break; }
    }
  }
  const blocked = (n: number): boolean => kind === 'range' && anchor !== null && (n < lowLimit || n > highLimit || (minDays !== undefined && n !== anchor && Math.abs(n - anchor) + 1 < minDays));
  const cellDisabled = (n: number): boolean => dayDisabled(n) || blocked(n);

  // Focus moves to the focused cell after a keyboard or button action that asked for it.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wantFocus = useRef(false);
  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>('[data-salmon-focus]')?.focus({ preventScroll: true });
  });

  // Development warning for inputs that do not normalize.
  useEffect(() => {
    if (DEV && kind === 'single' && rawValue !== null && rawValue !== undefined && rawValue !== '' && toPlainDate(rawValue, timeZone) === null) warnOnce('calendar-invalid-value', `Calendar: value ${JSON.stringify(rawValue)} is not a valid date; it is treated as empty.`);
  });

  const moveFocus = (n: number, grab: boolean): void => {
    const next = clamp(n);
    wantFocus.current = grab;
    if (months > 1) setWindowStart(windowFor(next, first));
    setFocusState(fromDays(next));
    if (next !== focus) onFocusedValueChange?.(fromDays(next));
  };
  const changeView = (v: CalendarView, grab: boolean): void => {
    const next = clampView(v);
    if (next === view) return;
    wantFocus.current = grab;
    setView(next);
    onViewChange?.(next);
  };

  const emit = (next: unknown, source: Source, reason: CalendarChangeDetails['reason'], iso: string): void => {
    setRawValue(next);
    (onValueChange as ((v: unknown, d: CalendarChangeDetails) => void) | undefined)?.(next, Object.freeze({ source, reason, iso }));
  };

  /** Selects a day (or the month / year start in coarser granularities). */
  const select = (n: number, source: Source, reason: CalendarChangeDetails['reason'] = 'select'): void => {
    if (readOnly || disabled || cellDisabled(n)) return;
    const date = fromDays(n);
    if (kind === 'single') emit(date, source, reason, String(date));
    else if (kind === 'multiple') {
      const has = selected.includes(n);
      const next = (has ? selected.filter((x) => x !== n) : [...selected, n]).sort((a, b) => a - b).map(fromDays);
      emit(next, source, reason, next.join());
    } else if (anchor === null) {
      setAnchor(n);
      setPreview(n);
      setAnnouncement(text('rangeStartSelected', { date: labels.full(n) }));
    } else {
      const lo = Math.min(anchor, n);
      const hi = Math.max(anchor, n);
      const start = fromDays(lo);
      const end = fromDays(hi);
      setAnchor(null);
      setPreview(null);
      setAnnouncement(text('selectedRange', { start: labels.full(lo), end: labels.full(hi), count: hi - lo + 1 }));
      emit(Object.freeze({ start, end }), source, reason, `${start}/${end}`);
    }
    moveFocus(n, false);
  };

  const units = (v: CalendarView): number[] => (v === 'year' ? yearGrid(sys, focus as number) : decadeGrid(sys, focus as number));
  /** The day a year or decade cell moves the focus to: the same day of month, or the same date in that year. */
  const unitTarget = (start: number, v: CalendarView): number => {
    if (focus === null) return start;
    const fy = sys.fields(focus);
    return v === 'year' ? start + Math.min(fy.day, monthLength(sys, start)) - 1 : addCalendarMonths(sys, focus, (sys.fields(start).year - fy.year) * 12);
  };
  /** Activates a year / decade cell: select in the deepest view, else drill down. */
  const activate = (n: number, source: Source): void => {
    if (view === minView && view !== 'month') {
      const start = unitStart(n, view);
      if (!readOnly && !disabled && !unitDisabled(start, view)) select(Math.max(start, min ?? start), source);
      return;
    }
    if (view === 'month') select(n, source);
    else {
      moveFocus(n, true);
      changeView(view === 'decade' ? 'year' : 'month', true);
    }
  };
  /** A month or year cell is disabled when all its days are out of range. */
  const unitDisabled = (start: number, v: CalendarView): boolean => {
    if (disabled) return true;
    const f = sys.fields(start);
    const end = v === 'year' ? start + monthLength(sys, start) - 1 : sys.start(f.year + 1, 1) - 1;
    return (min !== null && end < min) || (max !== null && start > max);
  };

  const stepOf = (v: CalendarView, n: number, delta: number): number => addCalendarMonths(sys, n, delta * (v === 'month' ? 1 : v === 'year' ? 12 : 120));

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>): void => {
    if (focus === null) return;
    const rtl = rootRef.current ? getComputedStyle(rootRef.current).direction === 'rtl' : false;
    const horizontal = rtl ? -1 : 1;
    const f = focus;
    const mod = event.ctrlKey || event.metaKey;
    let next: number | null = null;
    const cols = view === 'month' ? 7 : 4;
    const unit = (d: number): number => (view === 'month' ? f + d : addCalendarMonths(sys, f, view === 'year' ? d : d * 12));
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        next = unit(event.key === 'ArrowLeft' ? -horizontal : horizontal);
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        const up = event.key === 'ArrowUp';
        if (mod) {
          event.preventDefault();
          changeView(VIEWS[VIEWS.indexOf(view) + (up ? 1 : -1)] ?? view, true);
          return;
        }
        next = unit(up ? -cols : cols);
        break;
      }
      case 'Home':
      case 'End': {
        const end = event.key === 'End';
        if (view === 'month') {
          const start = mod ? unitStart(f, 'year') : weekStart(f, firstDay);
          next = end ? start + (mod ? monthLength(sys, f) : 7) - 1 : start;
        } else {
          const cells = units(view);
          const i = cells.indexOf(unitStart(f, view));
          next = unitTarget(cells[mod ? (end ? 11 : 0) : i - (i % 4) + (end ? 3 : 0)] as number, view);
        }
        break;
      }
      case 'PageUp':
      case 'PageDown':
        next = stepOf(event.shiftKey && view === 'month' ? 'year' : view, f, event.key === 'PageUp' ? -1 : 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        activate(f, 'keyboard');
        return;
      default:
        return;
    }
    event.preventDefault();
    if (kind === 'range' && anchor !== null && view === 'month') setPreview(clamp(next));
    moveFocus(next, true);
  };

  /** Previous / next is disabled when the whole target month, year or decade is out of range. */
  const navDisabled = (delta: number): boolean => {
    if (focus === null || first === null || disabled) return true;
    const y = sys.fields(focus).year;
    const decade = Math.floor(y / 10) * 10;
    const [lowEnd, highStart] =
      view === 'month'
        ? [first - 1, addCalendarMonths(sys, first, months)]
        : view === 'year'
          ? [sys.start(y, 1) - 1, sys.start(y + 1, 1)]
          : [sys.start(decade, 1) - 1, sys.start(decade + 10, 1)];
    return delta < 0 ? min !== null && lowEnd < min : max !== null && highStart > max;
  };
  const nav = (delta: number): void => {
    if (focus !== null) moveFocus(stepOf(view, focus, delta), false);
  };

  const headingId = `${id}h`;
  const rangeLow = range ? range.start : anchor !== null && preview !== null ? Math.min(anchor, preview) : null;
  const rangeHigh = range && anchor === null ? range.end : anchor !== null && preview !== null ? Math.max(anchor, preview) : null;

  const navUnit = view === 'month' ? 'Month' : view === 'year' ? 'Year' : 'Decade';
  const upView = VIEWS[VIEWS.indexOf(view) + 1];
  const canGoUp = upView !== undefined && VIEWS.indexOf(upView) <= VIEWS.indexOf(maxView);

  const headingText = (n: number): string => {
    if (view === 'month') return labels.month(n);
    if (view === 'year') return labels.year(n);
    const g = decadeGrid(sys, n);
    return `${labels.year(g[1] as number)} – ${labels.year(g[10] as number)}`;
  };

  const renderMonth = (start: number, index: number): ReactNode => {
    const grid = monthGrid(sys, start, firstDay);
    const month = sys.fields(start).month;
    const gid = `${headingId}${index}`;
    const rows: number[][] = [];
    for (let i = 0; i < 42; i += 7) rows.push(grid.slice(i, i + 7));
    return (
      <div className="salmon-calendar__month" key={start}>
        {months > 1 ? (
          <div id={gid} className="salmon-calendar__month-heading">
            {labels.month(start)}
          </div>
        ) : null}
        <table role="grid" className="salmon-calendar__grid" aria-labelledby={months > 1 ? gid : headingId} aria-readonly={readOnly || undefined} aria-disabled={disabled || undefined} aria-multiselectable={kind !== 'single' || undefined} onKeyDown={onKeyDown}>
          <thead>
            <tr>
              {showWeekNumbers ? (
                <th scope="col" className="salmon-calendar__week-header" abbr={text('weekNumberHeader')}>
                  {text('weekNumber')}
                </th>
              ) : null}
              {labels.weekdays.map((w) => (
                <th key={w.long} scope="col" abbr={w.long} className="salmon-calendar__weekday">
                  {w.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {showWeekNumbers ? (
                  <th scope="row" className="salmon-calendar__week-number" aria-label={text('weekNumberLabel', { week: labels.number(weekNumber(row[0] as number, firstDay, rule)) })}>
                    {labels.number(weekNumber(row[0] as number, firstDay, rule))}
                  </th>
                ) : null}
                {row.map((n) => {
                  const outside = sys.fields(n).month !== month;
                  if (outside && !showOutsideDays) return <td key={n} className="salmon-calendar__day" data-outside="" data-empty="" />;
                  const isFocused = n === focus && !(outside && months > 1);
                  const isSelected = kind === 'range' ? range !== null && n >= range.start && n <= range.end : selected.includes(n);
                  const off = cellDisabled(n);
                  const inRange = rangeLow !== null && rangeHigh !== null && n >= rangeLow && n <= rangeHigh;
                  const ctx: CalendarDayContext = {
                    date: fromDays(n),
                    selected: isSelected,
                    disabled: off,
                    outside,
                    today: n === today,
                    focused: isFocused,
                    inRange,
                    rangeStart: inRange && n === rangeLow,
                    rangeEnd: inRange && n === rangeHigh,
                  };
                  const extra = getDayProps?.(ctx);
                  return (
                    <td
                      key={n}
                      {...extra}
                      className={extra?.className ? `salmon-calendar__day ${extra.className}` : 'salmon-calendar__day'}
                      tabIndex={isFocused && !disabled ? 0 : -1}
                      aria-selected={isSelected}
                      aria-disabled={off || undefined}
                      aria-current={ctx.today ? 'date' : undefined}
                      aria-label={labels.full(n)}
                      data-salmon-focus={isFocused ? '' : undefined}
                      data-selected={isSelected || undefined}
                      data-today={ctx.today || undefined}
                      data-outside={outside || undefined}
                      data-disabled={off || undefined}
                      data-in-range={inRange || undefined}
                      data-range-start={ctx.rangeStart || undefined}
                      data-range-end={ctx.rangeEnd || undefined}
                      data-day={isoDate(ctx.date)}
                      onClick={() => {
                        if (disabled) return;
                        moveFocus(n, true);
                        if (!off) select(n, 'pointer');
                      }}
                      onPointerEnter={kind === 'range' && anchor !== null ? () => setPreview(n) : undefined}
                      onFocus={kind === 'range' && anchor !== null && preview !== n ? () => setPreview(n) : undefined}
                    >
                      {renderDay ? renderDay(ctx) : labels.day(n)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderUnits = (cells: number[], v: 'year' | 'decade'): ReactNode => {
    const rows: number[][] = [];
    for (let i = 0; i < 12; i += 4) rows.push(cells.slice(i, i + 4));
    const fy = focus === null ? null : sys.fields(focus);
    return (
      <table role="grid" className="salmon-calendar__grid" data-view={v} aria-labelledby={headingId} aria-readonly={readOnly || undefined} aria-disabled={disabled || undefined} onKeyDown={onKeyDown}>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((start, i) => {
                const f = sys.fields(start);
                const isFocused = fy !== null && (v === 'year' ? f.month === fy.month : f.year === fy.year);
                const off = unitDisabled(start, v);
                const end = v === 'year' ? start + monthLength(sys, start) - 1 : sys.start(f.year + 1, 1) - 1;
                const has = (n: number): boolean => n >= start && n <= end;
                const isSelected = view === minView && (kind === 'range' ? range !== null && (has(range.start) || has(range.end)) : selected.some(has));
                const edge = v === 'decade' && (i === 0 && row === rows[0] ? true : i === 3 && row === rows[2]);
                const target = unitTarget(start, v);
                return (
                  <td
                    key={start}
                    className="salmon-calendar__cell"
                    tabIndex={isFocused && !disabled ? 0 : -1}
                    aria-selected={isSelected}
                    aria-disabled={off || undefined}
                    data-salmon-focus={isFocused ? '' : undefined}
                    data-selected={isSelected || undefined}
                    data-disabled={off || undefined}
                    data-outside={edge || undefined}
                    data-today={today !== null && has(today) ? '' : undefined}
                    onClick={() => {
                      if (disabled) return;
                      moveFocus(target, true);
                      if (!off) activate(target, 'pointer');
                    }}
                  >
                    {v === 'year' ? labels.monthName(start) : labels.year(start)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // `first` is null exactly while `focus` is (no focus yet: the server render and hydration).
  const busy = first === null;
  const classes = className ? `salmon-calendar ${className}` : 'salmon-calendar';
  return (
    <div
      {...rest}
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === 'function') return ref(el);
        if (ref) ref.current = el;
        return undefined;
      }}
      className={classes}
      data-view={view}
      data-disabled={disabled || undefined}
      aria-busy={busy || undefined}
    >
      <div className="salmon-calendar__header">
        <button type="button" className="salmon-calendar__nav" data-dir="previous" aria-label={text(`previous${navUnit}`)} disabled={busy || navDisabled(-1)} onClick={() => nav(-1)} />
        <button
          type="button"
          id={headingId}
          className="salmon-calendar__heading"
          aria-live="polite"
          aria-disabled={!canGoUp || disabled || undefined}
          onClick={() => {
            if (canGoUp && !disabled && upView) changeView(upView, false);
          }}
        >
          {busy ? ' ' : headingText(view === 'month' ? first : (focus as number))}
          {months > 1 && view === 'month' && first !== null ? <span>{` – ${labels.month(addCalendarMonths(sys, first, months - 1))}`}</span> : null}
        </button>
        <button type="button" className="salmon-calendar__nav" data-dir="next" aria-label={text(`next${navUnit}`)} disabled={busy || navDisabled(1)} onClick={() => nav(1)} />
      </div>
      <div className="salmon-calendar__body">
        {busy ? (
          <table role="grid" className="salmon-calendar__grid" aria-labelledby={headingId}>
            <tbody>
              {Array.from({ length: 6 }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: 7 }, (_, c) => (
                    <td key={c} className="salmon-calendar__day" data-empty="" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : view === 'month' ? (
          Array.from({ length: months }, (_, i) => renderMonth(addCalendarMonths(sys, first, i), i))
        ) : (
          renderUnits(units(view), view)
        )}
      </div>
      {showTodayButton ? (
        <div className="salmon-calendar__footer">
          <button
            type="button"
            className="salmon-calendar__today"
            disabled={today === null || readOnly || cellDisabled(today)}
            onClick={() => {
              if (today === null) return;
              changeView(minView, false);
              select(today, 'pointer', 'today');
              moveFocus(today, true);
            }}
          >
            {text('today')}
          </button>
        </div>
      ) : null}
      {kind === 'range' ? (
        <div className="salmon-calendar__live" role="status" aria-live="polite">
          {announcement}
        </div>
      ) : null}
    </div>
  );
}

/**
 * An inline calendar: one month grid (or year / decade grid) with single or
 * multiple day selection (`selectionMode`). WAI-ARIA APG date grid.
 */
export function Calendar(props: CalendarProps) {
  const { selectionMode, ...rest } = props;
  return <CalendarRoot {...(rest as CalendarSingleProps)} kind={selectionMode === 'multiple' ? 'multiple' : 'single'} />;
}

/** An inline calendar that selects a start and an end date. */
export function RangeCalendar(props: RangeCalendarProps) {
  return <CalendarRoot {...(props as RangeCalendarProps & { onValueChange?: never })} kind="range" />;
}

export type { CalendarMultipleProps };
