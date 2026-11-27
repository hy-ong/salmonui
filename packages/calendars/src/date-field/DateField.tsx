'use client';

// DateField: a segmented date or
// date-time input with no popup, the field the DatePicker composes.

import type { DateInput, DateTimeInput, PlainDate, PlainDateTime } from '@salmonui/core/internal/dates/index';
import { SegmentedField } from './SegmentedField.js';
import type { FieldBaseProps, FieldChangeDetails } from './types.js';

interface DateFieldShared extends FieldBaseProps {
  /** Earliest valid value. */
  readonly min?: DateInput;
  /** Latest valid value. */
  readonly max?: DateInput;
  /** Seeds Up / Down on empty segments (default: now, read in the event handler). */
  readonly placeholderValue?: DateInput;
}

/** A date field: `granularity` `'year' | 'month' | 'day'` (default `'day'`); values are `PlainDate`. */
export interface DateFieldDateProps extends DateFieldShared {
  readonly granularity?: 'year' | 'month' | 'day';
  readonly value?: DateInput | null;
  readonly defaultValue?: DateInput | null;
  readonly onValueChange?: (value: PlainDate | null, details: FieldChangeDetails) => void;
  /** Rejects single dates (the field becomes invalid). */
  readonly isDateDisabled?: (date: PlainDate) => boolean;
}

/** A date-time field: `granularity` `'hour' | 'minute' | 'second'`; values are `PlainDateTime`. */
export interface DateFieldDateTimeProps extends DateFieldShared {
  readonly granularity: 'hour' | 'minute' | 'second';
  readonly value?: DateTimeInput | null;
  readonly defaultValue?: DateTimeInput | null;
  readonly onValueChange?: (value: PlainDateTime | null, details: FieldChangeDetails) => void;
  readonly isDateDisabled?: (date: PlainDateTime) => boolean;
}

export type DateFieldProps = DateFieldDateProps | DateFieldDateTimeProps;

/** A segmented date (or date-time) input: one spinbutton per segment, in the locale's order. */
export function DateField(props: DateFieldProps) {
  const { isDateDisabled, granularity = 'day', className, size, ...rest } = props;
  return (
    <SegmentedField
      {...(rest as Omit<DateFieldDateProps, 'className' | 'granularity' | 'isDateDisabled'>)}
      data-size={size ?? 'md'}
      kind="date"
      granularity={granularity}
      isDisabled={isDateDisabled as ((v: never) => boolean) | undefined}
      className={className ? `salmon-date-field ${className}` : 'salmon-date-field'}
    />
  );
}
