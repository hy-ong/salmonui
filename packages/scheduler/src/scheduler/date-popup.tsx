'use client';

// Header date popup: the date range button
// opens the public `Calendar` (month granularity in month views) in a
// popover; a pick navigates. A lazy chunk, so the calendar grid is not in
// the Scheduler's initial JS.

import type { RefObject } from 'react';
import { Calendar } from '@salmonui/calendars/calendar';
import { fromDays } from '@salmonui/core/internal/dates/index';
import { Overlay } from '@salmonui/core/internal/overlay';

export function DatePopup(props: {
  readonly anchor: RefObject<HTMLElement | null>;
  readonly value: number;
  readonly month: boolean;
  readonly min: number | null;
  readonly max: number | null;
  readonly locale: string;
  readonly firstDayOfWeek: number;
  readonly label: string;
  readonly onClose: () => void;
  readonly onPick: (day: number) => void;
}) {
  const value = fromDays(props.value);
  return (
    <Overlay anchor={props.anchor} placement="bottom-start" role="dialog" aria-label={props.label} className="salmon-scheduler__date-popup" onDismiss={props.onClose} focus={{ autoFocus: false, tab: 'contain' }}>
      <Calendar
        aria-label={props.label}
        value={String(value)}
        defaultFocusedValue={String(value)}
        granularity={props.month ? 'month' : 'day'}
        locale={props.locale}
        firstDayOfWeek={props.firstDayOfWeek}
        {...(props.min === null ? {} : { min: String(fromDays(props.min)) })}
        {...(props.max === null ? {} : { max: String(fromDays(props.max)) })}
        autoFocus
        onValueChange={(d: unknown) => {
          const p = d as { year: number; month: number; day: number } | null;
          if (p) props.onPick(Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000));
        }}
      />
    </Overlay>
  );
}
