'use client';

// `datePickerEditor`: a Data
// Grid column `renderEditor` that edits a date or date-time cell with the
// public `DatePicker`. Opt-in: the built-in `date` / `datetime` editors keep
// the grid's compact picker so no Data Grid bundle grows. Typed structurally, so this module never imports the grid.

import type { KeyboardEvent, ReactElement } from 'react';
import { DatePicker, type DatePickerProps, type DatePickerValueChangeDetails } from './DatePicker.js';
import type { PlainDate, PlainDateTime } from '@salmonui/core/internal/dates/index';

/** The part of the Data Grid `renderEditor` context the editor reads. */
export interface DatePickerEditorContext {
  readonly value: unknown;
  setValue(value: unknown): void;
  /** Column `editorProps`: the keys of `DATE_PICKER_EDITOR_PROPS` reach the `DatePicker`. */
  readonly editorProps: Readonly<Record<string, unknown>>;
  /** The id and ARIA wiring of the grid editor (id, `aria-label`, `aria-invalid`, `aria-describedby`, `aria-required`, `autoFocus`, `disabled`). */
  readonly inputProps: object;
}

/** `DatePicker` props applied to every cell, plus the column `editorProps` keys. */
export type DatePickerEditorOptions = Omit<DatePickerProps, 'value' | 'defaultValue' | 'onValueChange'>;

/** Column `editorProps` keys mapped to `DatePicker` props of the same name. */
export const DATE_PICKER_EDITOR_PROPS: readonly string[] = ['min', 'max', 'firstDayOfWeek', 'calendar', 'weekRule', 'showWeekNumbers', 'weekdayFormat', 'showTodayButton', 'showOutsideDays', 'isDateDisabled', 'format', 'inputFormats', 'hourCycle', 'timeStep', 'minTime', 'maxTime', 'locale', 'timeZone', 'popupMode', 'strict', 'clearable', 'placeholder', 'className', 'style'];

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * A `renderEditor` for `date` (default `granularity: 'day'`) and `datetime`
 * (`granularity: 'minute'`) columns. Date-only cells hold UTC midnight, as the
 * grid's column parser stores them; the editor writes ISO dates back, and
 * date-times as `Date` instants (in `timeZone`, else the host zone).
 */
export function datePickerEditor(options: DatePickerEditorOptions = {}): (ctx: DatePickerEditorContext) => ReactElement {
  return function DatePickerCellEditor(ctx) {
    const props: Record<string, unknown> = { ...options };
    for (const key of DATE_PICKER_EDITOR_PROPS) if (ctx.editorProps[key] !== undefined) props[key] = ctx.editorProps[key];
    const input = ctx.inputProps as Readonly<Record<string, unknown>>;
    const withTime = props['granularity'] === 'hour' || props['granularity'] === 'minute' || props['granularity'] === 'second';
    const raw = ctx.value;
    const value = raw instanceof Date ? (Number.isNaN(raw.getTime()) ? null : withTime ? raw : isoDay(raw)) : raw === '' || raw === undefined ? null : raw;
    const onValueChange = (next: PlainDate | PlainDateTime | null, details: DatePickerValueChangeDetails): void => {
      if (!next || !('hour' in next)) return ctx.setValue(next ? next.toString() : null);
      if (details.epochMilliseconds !== undefined) return ctx.setValue(new Date(details.epochMilliseconds));
      ctx.setValue(new Date(next.year, next.month - 1, next.day, next.hour, next.minute, next.second));
    };
    // Keys inside the popup (a portal) stay there: Enter picks a day and Escape closes the popup, not the edit.
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      if ((event.target as Element).closest?.('.salmon-picker__popup')) event.stopPropagation();
    };
    return (
      <div className="salmon-date-picker-editor" onKeyDown={onKeyDown}>
        <DatePicker
          {...(props as DatePickerEditorOptions)}
          value={value as DatePickerProps['value']}
          onValueChange={onValueChange}
          id={input['id'] as string}
          aria-label={input['aria-label'] as string | undefined}
          aria-describedby={input['aria-describedby'] as string | undefined}
          invalid={(input['aria-invalid'] as boolean | undefined) ?? undefined}
          required={(input['aria-required'] as boolean | undefined) ?? undefined}
          disabled={(input['disabled'] as boolean | undefined) ?? (props['disabled'] as boolean | undefined)}
          autoFocus={(input['autoFocus'] as boolean | undefined) ?? undefined}
        />
      </div>
    );
  };
}
