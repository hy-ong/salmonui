'use client';

// TimeField: a segmented time
// input (hour, minute, optional second, day period on a 12-hour clock),
// the field the TimePicker composes. Values are `PlainTime`.

import type { PlainTime, TimeInput } from '@salmonui/core/internal/dates/index';
import { SegmentedField } from './SegmentedField.js';
import type { FieldBaseProps, FieldChangeDetails } from './types.js';

export interface TimeFieldProps extends FieldBaseProps {
  /** Deepest segment. Default `'minute'`. */
  readonly granularity?: 'hour' | 'minute' | 'second';
  readonly value?: TimeInput | null;
  readonly defaultValue?: TimeInput | null;
  readonly onValueChange?: (value: PlainTime | null, details: FieldChangeDetails) => void;
  readonly min?: TimeInput;
  readonly max?: TimeInput;
  /** Seeds Up / Down on empty segments (default: now, read in the event handler). */
  readonly placeholderValue?: TimeInput;
  /** Rejects single times (the field becomes invalid). */
  readonly isTimeDisabled?: (time: PlainTime) => boolean;
}

/** A segmented time input: one spinbutton per segment, in the locale's order and hour cycle. */
export function TimeField(props: TimeFieldProps) {
  const { isTimeDisabled, granularity = 'minute', className, size, ...rest } = props;
  return (
    <SegmentedField
      {...(rest as Omit<TimeFieldProps, 'className' | 'granularity' | 'isTimeDisabled'>)}
      data-size={size ?? 'md'}
      kind="time"
      granularity={granularity}
      isDisabled={isTimeDisabled as ((v: never) => boolean) | undefined}
      className={className ? `salmon-time-field salmon-date-field ${className}` : 'salmon-time-field salmon-date-field'}
    />
  );
}
