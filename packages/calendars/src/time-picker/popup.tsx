'use client';

// TimePicker popup (lazy chunk): the time list in
// the picker popup, and the `aria-activedescendant` bridge on the focused
// segment while it is open. Loaded when idle after mount (TimePicker.tsx).

import type { RefObject } from 'react';
import { PickerPopup, useActiveDescendant, type PickerPopupProps } from '../internal/picker-popup.js';
import { TimeList, type TimeListProps } from '../internal/TimeList.js';

export interface TimePickerPopupProps extends TimeListProps {
  readonly shell: Omit<PickerPopupProps, 'children'>;
  /** The field control that keeps DOM focus. */
  readonly controlRef: RefObject<HTMLElement | null>;
}

export function TimePickerPopup(props: TimePickerPopupProps) {
  const { shell, controlRef, ...list } = props;
  useActiveDescendant(true, controlRef, list.id, list.active >= 0 ? `${list.id}-${list.active}` : null);
  return (
    <PickerPopup {...shell}>
      <TimeList {...list} />
    </PickerPopup>
  );
}
