'use client';

// The `date` / `datetime` editor: a text input in
// the locale's numeric date order plus a calendar button that opens a WAI-ARIA
// APG date picker dialog (grid of days, roving tabindex, aria-selected, arrow
// keys, Home/End, PageUp/PageDown, Escape, focus return). Month and weekday
// names, week start and calendar labels come from `Intl` (calendar.ts). In
// the lazy editing chunk; the dialog only renders after a user action.

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { rectOf, type AnchorRect } from '../anchor.js';
import { useDataGridInstance, useDataGridText } from '../context.js';
import { DataGridPopover } from '../popover.js';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';
import {
  addMonths,
  calendarLabels,
  dateTextFormat,
  dayNumber,
  dayOf,
  formatDayText,
  monthGrid,
  parseDateText,
  placeholderOf,
  resolveCalendar,
  resolveFirstDay,
  timeText,
  weekStart,
  type DateTextFormat,
} from './calendar.js';
import type { DataGridEditorContext } from './edit-types.js';

/** A draft value as a day and minutes in the editor's zone (UTC fields for UTC grids and date-only values). */
function split(value: unknown, utc: boolean): { day: number; minutes: number } | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return utc
    ? { day: dayNumber(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
    : { day: dayNumber(d.getFullYear(), d.getMonth() + 1, d.getDate()), minutes: d.getHours() * 60 + d.getMinutes() };
}

/** The draft of a day: UTC midnight for dates (the column parser's ISO dates), else the zone's wall time. */
function join(day: number, minutes: number, withTime: boolean, utc: boolean): Date {
  const { year, month, day: date } = dayOf(day);
  if (!withTime) return new Date(Date.UTC(year, month - 1, date));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return utc ? new Date(Date.UTC(year, month - 1, date, h, m)) : new Date(year, month - 1, date, h, m);
}

function textOf(value: { day: number; minutes: number } | null, format: DateTextFormat, withTime: boolean): string {
  if (!value) return '';
  const date = formatDayText(dayOf(value.day), format);
  return withTime ? `${date} ${timeText(value.minutes)}` : date;
}

/** `editorProps.min` / `max` (ISO text or `Date`) as a day number. */
function bound(value: unknown, utc: boolean): number | null {
  if (value instanceof Date) return split(value, utc)?.day ?? null;
  if (typeof value !== 'string') return null;
  const parsed = parseDateText(value, { order: 'ymd', separator: '-' });
  return parsed ? dayNumber(parsed.day.year, parsed.day.month, parsed.day.day) : null;
}

interface Picker {
  readonly focus: number;
  readonly today: number;
  readonly minutes: number;
  readonly anchor: AnchorRect;
  readonly container: Element;
}

export interface DateEditorProps {
  readonly ctx: DataGridEditorContext<unknown>;
  /** Attributes of the text input (ids, ARIA, class, style). */
  readonly input: Readonly<Record<string, unknown>> & { readonly className: string; readonly style?: CSSProperties | undefined };
  readonly withTime: boolean;
  readonly utc: boolean;
  readonly inputRef?: ((el: HTMLInputElement | null) => void) | undefined;
}

export function DateEditor({ ctx, input, withTime, utc, inputRef }: DateEditorProps) {
  const instance = useDataGridInstance<unknown>();
  const text = useDataGridText();
  const locale = text.locale;
  const { editorProps } = ctx;
  const format = dateTextFormat(locale);
  const current = split(ctx.value, utc);
  const [picker, setPicker] = useState<Picker | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const toGrid = useRef(false);
  const headingId = useId();
  const rtl = instance.rtl;
  const label = text('chooseDate');

  const commit = (day: number, minutes: number): void => {
    ctx.setValue(join(day, minutes, withTime, utc));
    if (field.current) field.current.value = textOf({ day, minutes }, format, withTime);
  };
  const open = (): void => {
    const el = wrap.current;
    if (!el) return;
    // Today is the local calendar day for dates and the zone's day for date-times.
    const now = split(new Date(), withTime && utc) as { day: number; minutes: number };
    const root = instance.root;
    const container = el.closest('dialog') ?? portalScopeOf(root ?? el);
    toGrid.current = true;
    setPicker({ focus: current?.day ?? now.day, today: now.day, minutes: current?.minutes ?? 0, anchor: rectOf(el), container });
  };
  const close = (refocus: boolean): void => {
    setPicker(null);
    if (refocus) field.current?.focus({ preventScroll: true });
  };
  const choose = (day: number, minutes: number): void => {
    commit(day, minutes);
    close(true);
  };

  const onInputKey = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  };
  const { className, style, ...attrs } = input;
  return (
    <div ref={wrap} className="salmon-data-grid-date" data-open={picker ? '' : undefined}>
      <input
        {...attrs}
        className={className}
        style={style}
        type="text"
        autoComplete="off"
        inputMode={withTime ? 'text' : 'numeric'}
        placeholder={typeof editorProps.placeholder === 'string' ? editorProps.placeholder : placeholderOf(format, withTime)}
        defaultValue={textOf(current, format, withTime)}
        ref={(el) => {
          field.current = el;
          inputRef?.(el);
        }}
        onKeyDown={onInputKey}
        onChange={(e) => {
          const value = e.currentTarget.value;
          if (value.trim() === '') return ctx.setValue(null);
          const parsed = parseDateText(value, format);
          // Text that does not parse keeps the last valid draft.
          if (parsed) ctx.setValue(join(dayNumber(parsed.day.year, parsed.day.month, parsed.day.day), parsed.minutes ?? current?.minutes ?? 0, withTime, utc));
        }}
      />
      <button
        type="button"
        className="salmon-data-grid-date__button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={picker !== null}
        // Inline editors: Tab moves between editors, so the button is reached with Alt+ArrowDown or a click.
        tabIndex={ctx.placement === 'cell' ? -1 : undefined}
        onClick={() => (picker ? close(true) : open())}
      />
      {picker ? (
        <Calendar
          picker={picker}
          setPicker={setPicker}
          toGrid={toGrid}
          label={label}
          headingId={headingId}
          locale={locale}
          rtl={rtl}
          withTime={withTime}
          selected={current?.day ?? null}
          firstDay={resolveFirstDay(locale, editorProps['firstDayOfWeek'])}
          calendar={resolveCalendar(locale, editorProps['calendar'])}
          min={bound(editorProps.min, utc)}
          max={bound(editorProps.max, utc)}
          insideRef={wrap}
          onChoose={choose}
          onTime={(minutes) => {
            const day = current?.day;
            if (day !== undefined) commit(day, minutes);
          }}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

interface CalendarProps {
  readonly picker: Picker;
  readonly setPicker: (update: (p: Picker | null) => Picker | null) => void;
  readonly toGrid: { current: boolean };
  readonly label: string;
  readonly headingId: string;
  readonly locale: string;
  readonly rtl: boolean;
  readonly withTime: boolean;
  readonly selected: number | null;
  readonly firstDay: number;
  readonly calendar: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly insideRef: { readonly current: Element | null };
  onChoose(day: number, minutes: number): void;
  onTime(minutes: number): void;
  onClose(refocus: boolean): void;
}

function Calendar(props: CalendarProps) {
  const { picker, setPicker, toGrid, locale, firstDay, rtl, min, max } = props;
  const text = useDataGridText();
  const labels = useMemo(() => calendarLabels(locale, props.calendar, firstDay), [locale, props.calendar, firstDay]);
  const gridRef = useRef<HTMLTableElement | null>(null);
  const days = monthGrid(picker.focus, firstDay);
  const month = dayOf(picker.focus).month;
  const disabled = (n: number): boolean => (min !== null && n < min) || (max !== null && n > max);
  const move = (focus: number, grid: boolean): void => {
    toGrid.current = grid;
    setPicker((p) => (p ? { ...p, focus } : p));
  };

  useLayoutEffect(() => {
    if (!toGrid.current) return;
    toGrid.current = false;
    gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  }, [picker.focus, toGrid]);

  const onGridKey = (event: ReactKeyboardEvent<HTMLTableElement>): void => {
    const f = picker.focus;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = f + (rtl ? 1 : -1);
        break;
      case 'ArrowRight':
        next = f + (rtl ? -1 : 1);
        break;
      case 'ArrowUp':
        next = f - 7;
        break;
      case 'ArrowDown':
        next = f + 7;
        break;
      case 'Home':
        next = weekStart(f, firstDay);
        break;
      case 'End':
        next = weekStart(f, firstDay) + 6;
        break;
      case 'PageUp':
        next = addMonths(f, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(f, event.shiftKey ? 12 : 1);
        break;
      case 'Enter':
      case ' ':
        // DataGridPopover lets prevented keys bubble: stop them before the editor's keyboard context.
        event.preventDefault();
        event.stopPropagation();
        if (!disabled(f)) props.onChoose(f, picker.minutes);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    move(next, true);
  };

  const weeks: number[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <DataGridPopover
      anchor={picker.anchor}
      container={picker.container}
      rtl={rtl}
      className="salmon-data-grid-date-picker"
      role="dialog"
      label={props.label}
      insideRefs={[props.insideRef]}
      onDismiss={(reason) => props.onClose(reason !== 'outside')}
    >
      <div className="salmon-data-grid-date-picker__header">
        <button type="button" className="salmon-data-grid-date-picker__nav" data-dir="previous" aria-label={text('previousMonth')} onClick={() => move(addMonths(picker.focus, -1), false)} />
        <h2 id={props.headingId} className="salmon-data-grid-date-picker__title" aria-live="polite">
          {labels.month(picker.focus)}
        </h2>
        <button type="button" className="salmon-data-grid-date-picker__nav" data-dir="next" aria-label={text('nextMonth')} onClick={() => move(addMonths(picker.focus, 1), false)} />
      </div>
      <table ref={gridRef} role="grid" className="salmon-data-grid-date-picker__grid" aria-labelledby={props.headingId} onKeyDown={onGridKey}>
        <thead>
          <tr>
            {labels.weekdays.map((w) => (
              <th key={w.long} scope="col" abbr={w.long}>
                {w.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((n) => {
                const off = disabled(n);
                return (
                  <td
                    key={n}
                    tabIndex={n === picker.focus ? 0 : -1}
                    aria-selected={n === props.selected}
                    aria-current={n === picker.today ? 'date' : undefined}
                    aria-disabled={off || undefined}
                    aria-label={labels.dayLabel(n)}
                    title={props.calendar === 'gregory' ? undefined : labels.dayLabel(n)}
                    className="salmon-data-grid-date-picker__day"
                    data-day={n}
                    data-outside={dayOf(n).month !== month ? '' : undefined}
                    onClick={() => {
                      if (off) return;
                      props.onChoose(n, picker.minutes);
                    }}
                  >
                    {labels.dayText(n)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="salmon-data-grid-date-picker__footer">
        {props.withTime ? (
          <label className="salmon-data-grid-date-picker__time">
            {text('timeLabel')}
            <input
              type="time"
              className="salmon-data-grid-input"
              value={timeText(picker.minutes)}
              onChange={(e) => {
                const [h, m] = e.currentTarget.value.split(':').map(Number);
                if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
                const minutes = h * 60 + m;
                setPicker((p) => (p ? { ...p, minutes } : p));
                props.onTime(minutes);
              }}
            />
          </label>
        ) : null}
        <button type="button" className="salmon-data-grid-button" disabled={disabled(picker.today)} onClick={() => props.onChoose(picker.today, picker.minutes)}>
          {text('today')}
        </button>
      </div>
    </DataGridPopover>
  );
}
