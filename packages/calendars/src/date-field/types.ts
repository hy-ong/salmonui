import type { FocusEvent, HTMLAttributes, ReactNode, Ref } from 'react';
import type { DateFormat, Granularity, HourCycle, LocaleMessage, ParseFn, SegmentType } from '@salmonui/core/internal/dates/index';

/** Second argument of `onValueChange` on the segmented fields. */
export interface FieldChangeDetails {
  readonly source: 'keyboard' | 'pointer' | 'api';
  readonly reason: 'input' | 'paste' | 'clear' | 'blur';
  /** ISO form value (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `YYYY-MM-DDTHH:mm[:ss]`, `HH:mm[:ss]`); `''` when empty. */
  readonly iso: string;
  /** The instant of a date-time value when `timeZone` is given. */
  readonly epochMilliseconds?: number;
}

/** User-visible strings of `DateField` and `TimeField`: segment placeholders and names. */
export type FieldLocaleText = {
  readonly [K in `${SegmentType}Placeholder` | `${SegmentType}Label`]: LocaleMessage;
} & {
  /** `aria-valuetext` of an empty segment. */
  readonly empty: LocaleMessage;
};

type GroupProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'children' | 'onFocus' | 'onBlur' | 'placeholder'>;

/** Props shared by `DateField` and `TimeField`. */
export interface FieldBaseProps extends GroupProps {
  readonly ref?: Ref<HTMLDivElement>;
  /** Control size: `'sm'` 24px, `'md'` 32px (default), `'lg'` 40px tall; `data-size` on the group. */
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  /** Visible label above the segments; also names the group. */
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  /** Shown when `invalid` (or a complete value is out of range / disabled). */
  readonly errorMessage?: ReactNode;
  /** Display format: `Intl` options, a CLDR skeleton (`'yMMMd'`) or a pattern (`'dd/MM/yyyy'`, `'HH:mm'`); the segments follow it. */
  readonly format?: DateFormat;
  /** `'h12'` or `'h23'`; default from the locale. */
  readonly hourCycle?: HourCycle;
  /** BCP 47 locale. Default `'en-US'`; the host locale is never read. */
  readonly locale?: string;
  /** IANA zone for `Date` and offset inputs, and `details.epochMilliseconds`. */
  readonly timeZone?: string;
  /** Extra accepted paste and typed formats (patterns); ISO is always accepted. */
  readonly inputFormats?: readonly string[];
  /** Custom text parser, tried last. */
  readonly parse?: ParseFn;
  /**
   * `false` (default): an out-of-range or disabled value is kept and the
   * field is `aria-invalid`. `true`: on blur, incomplete or disabled input
   * reverts to the last valid value and an out-of-range value moves to the
   * nearest bound.
   */
  readonly strict?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly autoFocus?: boolean;
  /** Form field name: a visually hidden input posts the ISO value. */
  readonly name?: string;
  readonly form?: string;
  /** Fires once when focus enters the group. */
  readonly onFocus?: (event: FocusEvent<HTMLDivElement>) => void;
  /** Fires once when focus leaves the group. */
  readonly onBlur?: (event: FocusEvent<HTMLDivElement>) => void;
  readonly localeText?: Partial<FieldLocaleText>;
  /** Direction override; inherited from the document by default. */
  readonly dir?: 'ltr' | 'rtl';
}

export type { Granularity };
