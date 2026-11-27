'use client';

// RecurrenceEditor: a form that edits one RRULE string. It is a non-grid
// component: `value` /
// `defaultValue` / `onValueChange(rule, details)`, where `rule` is the RRULE
// string or `null` for "never". The form is derived from the current rule on
// every render (no second copy of the state), so a controlled `value` and
// an uncontrolled one behave the same. Sub-controls are the public
// `Select`, `ToggleButtonGroup` and `DatePicker`; numbers use a labelled `<input type="number">` until the
// Inputs category ships `NumberField`.

import { useId, type CSSProperties, type ReactElement } from 'react';
// The bare control: the editor renders its own labels (no field parts in the bundle).
import { Select } from '@salmonui/dropdowns/internal/select';
import { ToggleButton } from '@salmonui/buttons/button';
import { ToggleButtonGroup } from '@salmonui/buttons/button';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import {
  addMonths,
  formatMessage,
  formatRecurrenceRule,
  getRecurrenceSummary,
  localeFirstDay,
  parseRecurrenceRule,
  plainDate,
  recurrenceMonthNames,
  recurrenceWeekdayNames,
  toDays,
  toPlainDate,
  toPlainDateTime,
  RECURRENCE_SUMMARY_DEFAULT_TEXT,
  type DateInput,
  type DateTimeInput,
  type LocaleMessage,
  type PlainDate,
  type RecurrenceRule,
  type RecurrenceSummaryText,
} from '@salmonui/core/internal/dates/index';

export type RecurrenceFrequencyOption = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceEndType = 'never' | 'until' | 'count';

export interface RecurrenceEditorLocaleText extends RecurrenceSummaryText {
  readonly label: LocaleMessage;
  readonly repeat: LocaleMessage;
  readonly frequencyNever: LocaleMessage;
  readonly frequencyDaily: LocaleMessage;
  readonly frequencyWeekly: LocaleMessage;
  readonly frequencyMonthly: LocaleMessage;
  readonly frequencyYearly: LocaleMessage;
  readonly interval: LocaleMessage;
  readonly unitDays: LocaleMessage;
  readonly unitWeeks: LocaleMessage;
  readonly unitMonths: LocaleMessage;
  readonly unitYears: LocaleMessage;
  readonly repeatOn: LocaleMessage;
  readonly onDay: LocaleMessage;
  readonly onThe: LocaleMessage;
  readonly dayOfMonth: LocaleMessage;
  readonly ordinal: LocaleMessage;
  readonly weekday: LocaleMessage;
  readonly month: LocaleMessage;
  readonly end: LocaleMessage;
  readonly endNever: LocaleMessage;
  readonly endUntil: LocaleMessage;
  readonly endCount: LocaleMessage;
  readonly untilDate: LocaleMessage;
  readonly occurrences: LocaleMessage;
  readonly summary: LocaleMessage;
}

export const RECURRENCE_EDITOR_DEFAULT_LOCALE_TEXT: RecurrenceEditorLocaleText = Object.freeze({
  ...RECURRENCE_SUMMARY_DEFAULT_TEXT,
  label: 'Recurrence',
  repeat: 'Repeat',
  frequencyNever: 'Never',
  frequencyDaily: 'Daily',
  frequencyWeekly: 'Weekly',
  frequencyMonthly: 'Monthly',
  frequencyYearly: 'Yearly',
  interval: 'Repeat every',
  unitDays: { one: 'day', other: 'days' },
  unitWeeks: { one: 'week', other: 'weeks' },
  unitMonths: { one: 'month', other: 'months' },
  unitYears: { one: 'year', other: 'years' },
  repeatOn: 'Repeat on',
  onDay: 'On day',
  onThe: 'On the',
  dayOfMonth: 'Day of the month',
  ordinal: 'Week of the month',
  weekday: 'Day of the week',
  month: 'Month',
  end: 'End',
  endNever: 'Never',
  endUntil: 'On date',
  endCount: 'After',
  untilDate: 'End date',
  occurrences: { one: 'occurrence', other: 'occurrences' },
  summary: 'Summary',
});

export interface RecurrenceEditorChangeDetails {
  /** The parsed rule, or `null` for "never". */
  readonly rule: RecurrenceRule | null;
  /** The localized summary of the new rule. */
  readonly summary: string;
}

export interface RecurrenceEditorProps {
  /** The RRULE string (`FREQ=WEEKLY;BYDAY=MO`), or `null` for "never". */
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly onValueChange?: ((rule: string | null, details: RecurrenceEditorChangeDetails) => void) | undefined;
  /** Repeat types offered, in order. Default all five. */
  readonly frequencies?: readonly RecurrenceFrequencyOption[] | undefined;
  /** End types offered. Default all three. */
  readonly endTypes?: readonly RecurrenceEndType[] | undefined;
  /** Repeat type when the editor starts with no rule. Default `'never'`. */
  readonly defaultFrequency?: RecurrenceFrequencyOption | undefined;
  /** First occurrence: anchors the weekday, month day and month defaults. */
  readonly start?: DateTimeInput | undefined;
  /** Bounds of the until date picker. */
  readonly min?: DateInput | undefined;
  readonly max?: DateInput | undefined;
  readonly locale?: string | undefined;
  readonly localeText?: Partial<RecurrenceEditorLocaleText> | undefined;
  /** `Intl` calendar id for month names and the until picker. */
  readonly calendar?: string | undefined;
  /** Format of the until date (the DatePicker `format`). */
  readonly dateFormat?: Intl.DateTimeFormatOptions | string | undefined;
  /** 0 Sunday ... 6 Saturday; default from the locale. */
  readonly firstDayOfWeek?: number | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  /** Writing direction; inherited when omitted. */
  readonly dir?: 'ltr' | 'rtl' | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
}

const ALL_FREQUENCIES: readonly RecurrenceFrequencyOption[] = ['never', 'daily', 'weekly', 'monthly', 'yearly'];
const ALL_END_TYPES: readonly RecurrenceEndType[] = ['never', 'until', 'count'];
const weekdayOf = (n: number): number => (((n + 4) % 7) + 7) % 7;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The default rule of a frequency, anchored at `start`. */
function defaultRule(frequency: Exclude<RecurrenceFrequencyOption, 'never'>, start: PlainDate): RecurrenceRule {
  switch (frequency) {
    case 'weekly':
      return { frequency, interval: 1, byDay: [{ weekday: weekdayOf(toDays(start)) }] };
    case 'monthly':
      return { frequency, interval: 1, byMonthDay: [start.day] };
    case 'yearly':
      return { frequency, interval: 1, byMonth: [start.month], byMonthDay: [start.day] };
    default:
      return { frequency, interval: 1 };
  }
}

function ordinalOf(rule: RecurrenceRule): { ordinal: number; weekday: number } | null {
  const d = rule.byDay?.length === 1 ? rule.byDay[0] : undefined;
  if (!d) return null;
  const ordinal = d.ordinal ?? (rule.bySetPos?.length === 1 ? rule.bySetPos[0] : undefined);
  return ordinal === undefined ? null : { ordinal, weekday: d.weekday };
}

export function RecurrenceEditor(props: RecurrenceEditorProps): ReactElement {
  const locale = useLocale(props.locale) ?? 'en-US';
  // The summary messages (`getRecurrenceSummary`) are part of this family's text.
  const text: RecurrenceEditorLocaleText = { ...RECURRENCE_EDITOR_DEFAULT_LOCALE_TEXT, ...useLocaleText('recurrenceEditor', props.localeText) };
  const t = (key: keyof RecurrenceEditorLocaleText, params?: Record<string, string | number>): string => formatMessage(text[key], params, locale);
  const startWall = (props.start === undefined ? null : toPlainDateTime(props.start)) ?? null;
  // Without `start` the anchor is a fixed date, never "today" (SSR-safe).
  const start: PlainDate = startWall ? plainDate(startWall.year, startWall.month, startWall.day) : plainDate(2026, 1, 1);
  const frequencies = props.frequencies ?? ALL_FREQUENCIES;
  const endTypes = props.endTypes ?? ALL_END_TYPES;
  const disabled = props.disabled ?? false;
  const readOnly = props.readOnly ?? false;
  const inert = disabled || readOnly;
  const firstDay = props.firstDayOfWeek ?? localeFirstDay(locale);
  const initial = (): string | null => {
    if (props.defaultValue !== undefined) return props.defaultValue;
    const f = props.defaultFrequency ?? 'never';
    return f === 'never' ? null : formatRecurrenceRule(defaultRule(f, start));
  };
  const [value, setValue] = useControllableState<string | null, [RecurrenceEditorChangeDetails]>(props.value, initial, props.onValueChange, 'RecurrenceEditor value');
  const parsed = value ? parseRecurrenceRule(value) : null;
  const rule = parsed?.ok ? parsed.rule : null;
  const frequency: RecurrenceFrequencyOption = rule?.frequency ?? 'never';
  const summaryOptions = { locale, localeText: text, ...(props.start === undefined ? {} : { start: props.start }), ...(props.calendar ? { calendar: props.calendar } : {}) };
  const commit = (next: RecurrenceRule | null): void => {
    if (inert) return;
    const str = next ? formatRecurrenceRule(next) : null;
    setValue(str, Object.freeze({ rule: next ? (parseRecurrenceRule(str as string) as { rule: RecurrenceRule }).rule : null, summary: getRecurrenceSummary(str, summaryOptions) }));
  };
  const update = (patch: { -readonly [K in keyof RecurrenceRule]?: RecurrenceRule[K] | undefined }): void => {
    if (!rule) return;
    const next: Record<string, unknown> = { ...rule, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    commit(next as unknown as RecurrenceRule);
  };
  const base = useId();
  const id = (part: string): string => `${base}${part}`;
  const weekdayNames = recurrenceWeekdayNames(locale);
  const shortNames = (() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => f.format(Date.UTC(2023, 0, 1 + i)));
  })();
  const monthNames = recurrenceMonthNames(locale, props.calendar);
  const order = Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7);
  const unitKey = { never: 'unitDays', daily: 'unitDays', weekly: 'unitWeeks', monthly: 'unitMonths', yearly: 'unitYears' } as const;
  // `frequencyDaily`, `endUntil`, ...: the key is the prefix and the capitalized option.
  const optionText = (prefix: 'frequency' | 'end', option: string): string => t(`${prefix}${option[0]!.toUpperCase()}${option.slice(1)}` as keyof RecurrenceEditorLocaleText);
  const endType: RecurrenceEndType = rule?.count !== undefined ? 'count' : rule?.until ? 'until' : 'never';
  const ord = rule ? ordinalOf(rule) : null;
  const monthlyMode: 'day' | 'weekday' = ord ? 'weekday' : 'day';
  const monthDay = rule?.byMonthDay?.[0] ?? start.day;
  const ordinalValue = ord?.ordinal ?? Math.min(5, Math.ceil(start.day / 7));
  const ordinalWeekday = ord?.weekday ?? weekdayOf(toDays(start));
  const ordinalOptions = [1, 2, 3, 4, 5, -1].map((n) => ({ value: String(n), label: t(n === -1 ? 'ordinalLast' : (['ordinalFirst', 'ordinalSecond', 'ordinalThird', 'ordinalFourth', 'ordinalFifth'] as const)[n - 1]!) }));
  const weekdayOptions = order.map((d) => ({ value: String(d), label: weekdayNames[d] ?? '' }));
  const monthOptions = monthNames.map((label, i) => ({ value: String(i + 1), label }));
  const until = rule?.until ? rule.until.date : null;
  const setFrequency = (f: RecurrenceFrequencyOption): void => {
    if (f === frequency) return;
    if (f === 'never') return commit(null);
    const next: Mutable<RecurrenceRule> = { ...defaultRule(f, start) };
    if (rule && rule.interval > 1) next.interval = rule.interval;
    if (rule?.count !== undefined) next.count = rule.count;
    if (rule?.until) next.until = rule.until;
    commit(next);
  };
  const setMonthly = (mode: 'day' | 'weekday', day = monthDay, n = ordinalValue, wd = ordinalWeekday): void => {
    if (mode === 'day') update({ byMonthDay: [day], byDay: undefined, bySetPos: undefined });
    else update({ byDay: [{ weekday: wd, ordinal: n }], byMonthDay: undefined, bySetPos: undefined });
  };
  const setEnd = (type: RecurrenceEndType): void => {
    if (type === 'never') update({ count: undefined, until: undefined });
    else if (type === 'count') update({ count: rule?.count ?? 10, until: undefined });
    else {
      const d = until ?? addMonths(start, 1);
      update({ count: undefined, until: { date: plainDate(d.year, d.month, d.day) } });
    }
  };
  const intInput = (n: string, min: number, max: number): number | null => {
    const v = Number(n);
    return Number.isInteger(v) && v >= min && v <= max ? v : null;
  };
  const summary = getRecurrenceSummary(value, summaryOptions);
  const minDate = props.min === undefined ? toPlainDate(start) : toPlainDate(props.min);
  const maxDate = props.max === undefined ? null : toPlainDate(props.max);
  const rootClass = props.className ? `salmon-recurrence-editor ${props.className}` : 'salmon-recurrence-editor';
  return (
    <div
      id={props.id}
      role="group"
      className={rootClass}
      style={props.style}
      dir={props.dir}
      aria-label={props['aria-labelledby'] ? undefined : (props['aria-label'] ?? t('label'))}
      aria-labelledby={props['aria-labelledby']}
      aria-disabled={disabled || undefined}
      data-frequency={frequency}
      data-disabled={disabled ? '' : undefined}
      data-readonly={readOnly ? '' : undefined}
    >
      <div className="salmon-recurrence-editor__row">
        <span id={id('repeat')} className="salmon-recurrence-editor__label">
          {t('repeat')}
        </span>
        <Select
          className="salmon-recurrence-editor__frequency"
          aria-labelledby={id('repeat')}
          data={frequencies.map((f) => ({ value: f, label: optionText('frequency', f) }))}
          value={frequency}
          onValueChange={(v) => setFrequency((v ?? 'never') as RecurrenceFrequencyOption)}
          disabled={disabled}
          readOnly={readOnly}
        />
      </div>
      {rule ? (
        <>
          <div className="salmon-recurrence-editor__row">
            <label htmlFor={id('interval')} className="salmon-recurrence-editor__label">
              {t('interval')}
            </label>
            <input
              id={id('interval')}
              className="salmon-recurrence-editor__number"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={rule.interval}
              disabled={disabled}
              readOnly={readOnly}
              aria-describedby={id('unit')}
              onChange={(e) => {
                const n = intInput(e.currentTarget.value, 1, 999);
                if (n !== null) update({ interval: n });
              }}
            />
            <span id={id('unit')} className="salmon-recurrence-editor__unit">
              {t(unitKey[frequency], { count: rule.interval })}
            </span>
          </div>
          {frequency === 'weekly' ? (
            <div className="salmon-recurrence-editor__row">
              <span id={id('on')} className="salmon-recurrence-editor__label">
                {t('repeatOn')}
              </span>
              <ToggleButtonGroup
                className="salmon-recurrence-editor__weekdays"
                selectionMode="multiple"
                aria-labelledby={id('on')}
                disallowEmpty
                disabled={disabled}
                value={(rule.byDay?.length ? rule.byDay.map((d) => d.weekday) : [weekdayOf(toDays(start))]).map(String)}
                onValueChange={(v) => {
                  if (!readOnly && v.length) update({ byDay: order.filter((d) => v.includes(String(d))).map((weekday) => ({ weekday })) });
                }}
              >
                {order.map((d) => (
                  <ToggleButton key={d} value={String(d)}>
                    <span aria-hidden="true">{shortNames[d]}</span>
                    <span className="salmon-recurrence-editor__sr">{weekdayNames[d]}</span>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </div>
          ) : null}
          {frequency === 'yearly' ? (
            <div className="salmon-recurrence-editor__row">
              <span id={id('month')} className="salmon-recurrence-editor__label">
                {t('month')}
              </span>
              <Select
                className="salmon-recurrence-editor__month"
                aria-labelledby={id('month')}
                data={monthOptions}
                value={String(rule.byMonth?.[0] ?? start.month)}
                onValueChange={(v) => v && update({ byMonth: [Number(v)] })}
                disabled={disabled}
                readOnly={readOnly}
              />
            </div>
          ) : null}
          {frequency === 'monthly' || frequency === 'yearly' ? (
            <div className="salmon-recurrence-editor__choice" role="radiogroup" aria-label={t('repeatOn')}>
              <div className="salmon-recurrence-editor__row">
                <input
                  type="radio"
                  id={id('mday')}
                  name={id('mode')}
                  className="salmon-recurrence-editor__radio"
                  checked={monthlyMode === 'day'}
                  disabled={disabled}
                  onChange={() => !readOnly && setMonthly('day')}
                />
                <label htmlFor={id('mday')} className="salmon-recurrence-editor__label">
                  {t('onDay')}
                </label>
                <input
                  className="salmon-recurrence-editor__number"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  aria-label={t('dayOfMonth')}
                  value={monthDay}
                  disabled={disabled || monthlyMode !== 'day'}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const n = intInput(e.currentTarget.value, 1, 31);
                    if (n !== null) setMonthly('day', n);
                  }}
                />
              </div>
              <div className="salmon-recurrence-editor__row">
                <input
                  type="radio"
                  id={id('mweek')}
                  name={id('mode')}
                  className="salmon-recurrence-editor__radio"
                  checked={monthlyMode === 'weekday'}
                  disabled={disabled}
                  onChange={() => !readOnly && setMonthly('weekday')}
                />
                <label htmlFor={id('mweek')} className="salmon-recurrence-editor__label">
                  {t('onThe')}
                </label>
                <Select
                  className="salmon-recurrence-editor__ordinal"
                  aria-label={t('ordinal')}
                  data={ordinalOptions}
                  value={String(ordinalValue)}
                  onValueChange={(v) => v && setMonthly('weekday', monthDay, Number(v))}
                  disabled={disabled || monthlyMode !== 'weekday'}
                  readOnly={readOnly}
                />
                <Select
                  className="salmon-recurrence-editor__weekday"
                  aria-label={t('weekday')}
                  data={weekdayOptions}
                  value={String(ordinalWeekday)}
                  onValueChange={(v) => v && setMonthly('weekday', monthDay, ordinalValue, Number(v))}
                  disabled={disabled || monthlyMode !== 'weekday'}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ) : null}
          <div className="salmon-recurrence-editor__row">
            <span id={id('end')} className="salmon-recurrence-editor__label">
              {t('end')}
            </span>
            <Select
              className="salmon-recurrence-editor__end"
              aria-labelledby={id('end')}
              data={endTypes.map((e) => ({ value: e, label: optionText('end', e) }))}
              value={endType}
              onValueChange={(v) => setEnd((v ?? 'never') as RecurrenceEndType)}
              disabled={disabled}
              readOnly={readOnly}
            />
            {endType === 'until' ? (
              <DatePicker
                className="salmon-recurrence-editor__until"
                aria-label={t('untilDate')}
                value={until ? String(until) : null}
                min={minDate ? String(minDate) : null}
                max={maxDate ? String(maxDate) : null}
                locale={locale}
                calendar={props.calendar}
                format={props.dateFormat}
                firstDayOfWeek={firstDay}
                disabled={disabled}
                readOnly={readOnly}
                onValueChange={(d) => {
                  if (d) update({ until: { date: plainDate(d.year, d.month, d.day) } });
                }}
              />
            ) : null}
            {endType === 'count' ? (
              <>
                <input
                  className="salmon-recurrence-editor__number"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  aria-label={t('occurrences', { count: rule.count ?? 10 })}
                  value={rule.count ?? 10}
                  disabled={disabled}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const n = intInput(e.currentTarget.value, 1, 999);
                    if (n !== null) update({ count: n });
                  }}
                />
                <span className="salmon-recurrence-editor__unit" aria-hidden="true">
                  {t('occurrences', { count: rule.count ?? 10 })}
                </span>
              </>
            ) : null}
          </div>
        </>
      ) : null}
      <output className="salmon-recurrence-editor__summary" aria-live="polite" aria-label={t('summary')}>
        {summary}
      </output>
    </div>
  );
}
