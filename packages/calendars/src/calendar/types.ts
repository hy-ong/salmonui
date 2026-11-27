import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import type { DateInput, DateRange, LocaleMessage, PlainDate, WeekRule, WeekdayFormat } from '@salmonui/core/internal/dates/index';

/** Navigation view of a calendar: days of a month, months of a year, years of a decade. */
export type CalendarView = 'month' | 'year' | 'decade';

/** What a calendar selects: days, months (day 1) or years (January 1). */
export type CalendarGranularity = 'day' | 'month' | 'year';

/** State of one rendered day cell, passed to `renderDay` and `getDayProps`. */
export interface CalendarDayContext {
  readonly date: PlainDate;
  readonly selected: boolean;
  readonly disabled: boolean;
  /** A day of the previous or next month (rendered only with `showOutsideDays`). */
  readonly outside: boolean;
  /** Today in the calendar's time zone; always false in server HTML. */
  readonly today: boolean;
  readonly focused: boolean;
  /** Inside the selected or previewed range (RangeCalendar). */
  readonly inRange: boolean;
  readonly rangeStart: boolean;
  readonly rangeEnd: boolean;
}

/** Props `getDayProps` may add to a day cell. */
export interface CalendarDayProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly title?: string;
  readonly [data: `data-${string}`]: string | number | boolean | undefined;
}

/** Second argument of the change callbacks. */
export interface CalendarChangeDetails {
  readonly source: 'pointer' | 'keyboard' | 'api';
  readonly reason: 'select' | 'today';
  /** The ISO form value: `YYYY-MM-DD`, `start/end` for a range, comma separated for multiple dates, `''` for none. */
  readonly iso: string;
}

/** User-visible strings of `Calendar` and `RangeCalendar` (Data Grid `localeText` message format). */
export interface CalendarLocaleText {
  readonly previousMonth: LocaleMessage;
  readonly nextMonth: LocaleMessage;
  readonly previousYear: LocaleMessage;
  readonly nextYear: LocaleMessage;
  readonly previousDecade: LocaleMessage;
  readonly nextDecade: LocaleMessage;
  readonly today: LocaleMessage;
  /** Week number column header. */
  readonly weekNumber: LocaleMessage;
  /** Full name of the week number column (`abbr` of its header). */
  readonly weekNumberHeader: LocaleMessage;
  /** Accessible name of a week number row header (`{week}`). */
  readonly weekNumberLabel: LocaleMessage;
  /** Announced when a range start is chosen (`{date}`). */
  readonly rangeStartSelected: LocaleMessage;
  /** Announced when a range is complete (`{start}`, `{end}`, `{count}`; plural forms). */
  readonly selectedRange: LocaleMessage;
}

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'children' | 'dir'>;

/** Props shared by `Calendar` and `RangeCalendar`. */
export interface CalendarBaseProps extends DivProps {
  readonly ref?: Ref<HTMLDivElement>;
  /** Deepest selectable unit; also the deepest view (`'month'` makes a month picker). Default `'day'`. */
  readonly granularity?: CalendarGranularity;
  readonly view?: CalendarView;
  readonly defaultView?: CalendarView;
  readonly onViewChange?: (view: CalendarView) => void;
  /** Deepest view the user can navigate to. Default: from `granularity`. */
  readonly minView?: CalendarView;
  /** Highest view the heading button can reach. Default `'decade'`. */
  readonly maxView?: CalendarView;
  /** The date the calendar shows and focuses. */
  readonly focusedValue?: DateInput | null;
  readonly defaultFocusedValue?: DateInput;
  readonly onFocusedValueChange?: (date: PlainDate) => void;
  /** Earliest selectable date (unbounded by default). */
  readonly min?: DateInput;
  /** Latest selectable date (unbounded by default). */
  readonly max?: DateInput;
  /** Disables single days (weekends, holidays); disabled days stay focusable. */
  readonly isDateDisabled?: (date: PlainDate) => boolean;
  /** Content of a day cell; the default is the day number. */
  readonly renderDay?: (ctx: CalendarDayContext) => ReactNode;
  /** Extra `className`, `style`, `title` and `data-*` for a day cell. */
  readonly getDayProps?: (ctx: CalendarDayContext) => CalendarDayProps | undefined;
  /** 0 Sunday ... 6 Saturday. Default: the locale's week info. */
  readonly firstDayOfWeek?: number;
  readonly showWeekNumbers?: boolean;
  /** Which week of January is week 1. Default: the locale's minimal days. */
  readonly weekRule?: WeekRule;
  /** Weekday header width. Default `'short'`. */
  readonly weekdayFormat?: WeekdayFormat;
  /** `Intl` calendar id (`'gregory'`, `'islamic-umalqura'`, `'japanese'`, ...). Default: the `-u-ca-` of `locale`, else Gregorian. */
  readonly calendar?: string;
  /** BCP 47 locale. Default `'en-US'`; the host locale is never read. */
  readonly locale?: string;
  /** IANA zone for `Date` and offset inputs and for today. Default: the host zone on the client only. */
  readonly timeZone?: string;
  readonly showTodayButton?: boolean;
  /** Show the days of the previous and next month. Default `false`. */
  readonly showOutsideDays?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly localeText?: Partial<CalendarLocaleText>;
  /** Direction override; inherited from the document by default. */
  readonly dir?: 'ltr' | 'rtl';
}

export interface CalendarSingleProps extends CalendarBaseProps {
  readonly selectionMode?: 'single';
  readonly value?: DateInput | null;
  readonly defaultValue?: DateInput | null;
  readonly onValueChange?: (value: PlainDate | null, details: CalendarChangeDetails) => void;
}

export interface CalendarMultipleProps extends CalendarBaseProps {
  readonly selectionMode: 'multiple';
  readonly value?: readonly DateInput[];
  readonly defaultValue?: readonly DateInput[];
  readonly onValueChange?: (value: PlainDate[], details: CalendarChangeDetails) => void;
}

export type CalendarProps = CalendarSingleProps | CalendarMultipleProps;

export interface RangeCalendarProps extends CalendarBaseProps {
  readonly value?: DateRange<DateInput> | null;
  readonly defaultValue?: DateRange<DateInput> | null;
  readonly onValueChange?: (value: DateRange | null, details: CalendarChangeDetails) => void;
  /** Months shown side by side. Default 1. */
  readonly visibleMonths?: number;
  /** Shortest allowed range in days (inclusive). */
  readonly minDays?: number;
  /** Longest allowed range in days (inclusive). */
  readonly maxDays?: number;
  /** `'block'` (default): a range may not span a disabled day. */
  readonly rangeOverDisabled?: 'block' | 'allow';
}
