'use client';

// DateRangePicker popup (lazy chunk):
// presets, the two-month RangeCalendar, the summary and Apply / Cancel.
// Loaded when idle after mount (DateRangePicker.tsx).

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { getRangeDays, type DateRange, type PlainDate } from '@salmonui/core/internal/dates/index';
import { RangeCalendar, type RangeCalendarProps } from '../calendar.js';
import { defined, formatText, sourceOf, type ChangeSource } from '../internal/picker.js';
import { PickerPopup, type PickerPopupProps } from '../internal/picker-popup.js';
import { rangeOf, sameRange, type DateRangePickerLocaleText, type DateRangePickerProps, type Granularity } from './DateRangePicker.js';

type ContentProps = RangePopupProps;

interface RangePopupProps extends Omit<DateRangePickerProps, 'value' | 'min' | 'max' | 'ref' | 'localeText' | 'defaultValue'> {
  readonly mode: 'popover' | 'modal';
  readonly granularity: Granularity;
  readonly value: DateRange | null;
  readonly min: PlainDate | null;
  readonly max: PlainDate | null;
  readonly zone: string | null;
  readonly text: DateRangePickerLocaleText;
  readonly rangeLabel: (r: DateRange) => string;
  onCommit(range: DateRange, source: ChangeSource, reason: 'calendar' | 'preset' | 'apply'): void;
  onCancel(source: ChangeSource): void;
}

/** Popup body, mounted only while open: preset functions and "today" are evaluated here, never during a server render. */
function RangePopupContent(props: RangePopupProps) {
  const { granularity, min, max } = props;
  const locale = props.locale ?? 'en-US';
  const confirm = props.confirm !== false;
  const [presets, setPresets] = useState<readonly { label: ReactNode; range: DateRange | null }[]>([]);
  const [draft, setDraft] = useState<DateRange | null>(props.value);
  const [activePreset, setActivePreset] = useState(0);
  const presetsRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const presetId = useId();
  useLayoutEffect(() => {
    setPresets((props.presets ?? []).map((p) => ({ label: p.label, range: rangeOf(typeof p.value === 'function' ? p.value() : p.value, granularity, props.zone) })));
    // Evaluated once per open.
  }, []);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('[data-salmon-focus]')?.focus({ preventScroll: true });
  }, []);

  // `rangeOverDisabled`, `minDays` and `maxDays` are applied by RangeCalendar before it reports a range.
  const chooseRange = (range: DateRange, source: ChangeSource): void => {
    setDraft(range);
    props.onRangeSelect?.(range);
    if (!confirm) props.onCommit(range, source, 'calendar');
  };
  const choosePreset = (range: DateRange | null, source: ChangeSource): void => {
    if (!range) return;
    setDraft(range);
    props.onRangeSelect?.(range);
    props.onCommit(range, source, 'preset');
  };
  // Alt+Left / Alt+Right move between the popup regions.
  const onRegionKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const regions = [presetsRef.current, calendarRef.current, actionsRef.current].filter((r): r is HTMLDivElement => r !== null);
    const doc = e.currentTarget.ownerDocument;
    const current = regions.findIndex((r) => r.contains(doc.activeElement));
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const dir = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    const next = regions[(current + dir + regions.length) % regions.length];
    e.preventDefault();
    e.stopPropagation();
    const target = next === calendarRef.current ? next?.querySelector<HTMLElement>('[data-salmon-focus]') : next === presetsRef.current ? next : next?.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus();
  };
  const onPresetKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const count = presets.length;
    if (e.altKey || count === 0) return;
    let next = activePreset;
    if (e.key === 'ArrowDown') next = Math.min(count - 1, activePreset + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, activePreset - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choosePreset(presets[activePreset]?.range ?? null, 'keyboard');
      return;
    } else return;
    e.preventDefault();
    setActivePreset(next);
  };
  const days = draft ? getRangeDays(draft) : 0;
  return (
    <div ref={bodyRef} className="salmon-date-range-picker__body" onKeyDownCapture={onRegionKey}>
      {presets.length ? (
        <div
          ref={presetsRef}
          role="listbox"
          tabIndex={0}
          className="salmon-date-range-picker__presets"
          aria-label={formatText(props.text.presets, {}, locale)}
          aria-activedescendant={`${presetId}-${activePreset}`}
          onKeyDown={onPresetKey}
        >
          {presets.map((p, i) => {
            const selected = p.range !== null && draft !== null && sameRange(p.range, draft);
            return (
              <div
                key={i}
                id={`${presetId}-${i}`}
                role="option"
                className="salmon-date-range-picker__preset"
                aria-selected={selected}
                data-active={i === activePreset ? '' : undefined}
                data-selected={selected ? '' : undefined}
                onClick={(e) => {
                  setActivePreset(i);
                  choosePreset(p.range, sourceOf(e));
                }}
              >
                {p.label}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="salmon-date-range-picker__main">
        <div ref={calendarRef} className="salmon-date-range-picker__calendars">
          <RangeCalendar
            {...(defined({
              value: draft,
              onValueChange: (r: DateRange | null, details: { source: 'pointer' | 'keyboard' | 'api' }) => r && chooseRange(r, details.source),
              visibleMonths: props.visibleMonths ?? 2,
              granularity,
              defaultFocusedValue: draft?.start,
              min: min ?? undefined,
              max: max ?? undefined,
              minDays: granularity === 'day' ? props.minDays : undefined,
              maxDays: granularity === 'day' ? props.maxDays : undefined,
              rangeOverDisabled: props.rangeOverDisabled,
              isDateDisabled: props.isDateDisabled,
              renderDay: props.renderDay,
              getDayProps: props.getDayProps,
              firstDayOfWeek: props.firstDayOfWeek,
              showWeekNumbers: props.showWeekNumbers,
              weekRule: props.weekRule,
              weekdayFormat: props.weekdayFormat,
              showTodayButton: props.showTodayButton,
              showOutsideDays: props.showOutsideDays,
              view: props.view,
              defaultView: props.defaultView,
              onViewChange: props.onViewChange,
              onFocusedValueChange: props.onFocusedValueChange,
              locale,
              calendar: props.calendar,
              timeZone: props.timeZone,
            }) as RangeCalendarProps)}
          />
        </div>
        <div className="salmon-date-range-picker__footer">
          <div className="salmon-date-range-picker__summary" aria-live="polite">
            {draft ? (
              <>
                <span className="salmon-date-range-picker__summary-range">{props.rangeLabel(draft)}</span>
                {granularity === 'day' ? <span className="salmon-date-range-picker__summary-days">{formatText(props.text.selectedDays, { count: days }, locale)}</span> : null}
              </>
            ) : (
              formatText(props.text.noRange, {}, locale)
            )}
          </div>
          {confirm || props.mode === 'modal' ? (
            <div ref={actionsRef} className="salmon-picker__actions">
              <button type="button" className="salmon-picker__button" onClick={(e) => props.onCancel(sourceOf(e))}>
                {formatText(props.text.cancel, {}, locale)}
              </button>
              {confirm ? (
                <button type="button" className="salmon-picker__button" data-primary="" disabled={!draft} onClick={(e) => draft && props.onCommit(draft, sourceOf(e), 'apply')}>
                  {formatText(props.text.apply, {}, locale)}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The popup with its content: the lazy chunk's entry. */
export function DateRangePickerPopup(props: ContentProps & { readonly shell: Omit<PickerPopupProps, 'children'> }) {
  const { shell, ...rest } = props;
  return (
    <PickerPopup {...shell}>
      <RangePopupContent {...rest} />
    </PickerPopup>
  );
}
