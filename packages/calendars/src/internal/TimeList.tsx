'use client';

// The time listbox of TimePicker and of the DatePicker time part, in their
// lazy popup chunks. Lists over 200
// options are windowed with the shared virtual list math; the scroll position
// never enters React state.

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { PlainTime, PlainTimeLike } from '@salmonui/core/internal/dates/index';
import { nextWindow, revealOffset, windowRange } from '@salmonui/core/internal/collection/virtual';
import { compareTimes, timeListKey, VIRTUAL_THRESHOLD, type TimeOptionContext } from './time-list.js';
import type { ReactNode } from 'react';

/** Options in view before the first measurement (a 240 px list of 32 px options). */
const VISIBLE = 8;

export interface TimeListProps {
  readonly id: string;
  readonly options: readonly PlainTime[];
  readonly selected: PlainTimeLike | null;
  readonly active: number;
  readonly format: (t: PlainTime) => string;
  readonly isDisabled?: ((t: PlainTime) => boolean) | undefined;
  readonly renderOption?: ((ctx: TimeOptionContext) => ReactNode) | undefined;
  readonly onSelect: (t: PlainTime, event: MouseEvent | KeyboardEvent) => void;
  readonly onActiveChange: (index: number) => void;
  readonly 'aria-label': string;
  readonly className?: string | undefined;
}

export function TimeList(props: TimeListProps) {
  const { options, active } = props;
  const count = options.length;
  const virtual = count > VIRTUAL_THRESHOLD;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [itemHeight, setItemHeight] = useState(32);
  // The mounted window (shared virtual list math, internal/collection/virtual.ts): commits only when it changes.
  const [range, setRange] = useState(() => windowRange(count, Math.max(0, active - 4), VISIBLE));
  const syncRange = (): void => {
    const el = scroller.current;
    if (!el) return;
    const visible = Math.max(1, Math.ceil(el.clientHeight / itemHeight));
    setRange((r) => nextWindow(r, count, Math.floor(el.scrollTop / itemHeight), visible));
  };
  // Measure once per open and scroll the active (selected) option into view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[role="option"]');
    const measured = first?.offsetHeight;
    if (measured && measured !== 32) setItemHeight(measured);
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || active < 0) return;
    const offset = revealOffset(active, itemHeight, el.scrollTop, el.clientHeight);
    if (offset !== null) el.scrollTop = offset;
    if (virtual) syncRange();
  }, [active, virtual, itemHeight]);

  const [start, end] = virtual ? [range.first, range.last] : [0, count];
  const indexes: number[] = [];
  if (virtual && active >= 0 && active < start) indexes.push(active);
  for (let i = start; i < end; i++) indexes.push(i);
  if (virtual && active >= end && active < count) indexes.push(active);
  const h = itemHeight;

  const option = (i: number) => {
    const t = options[i] as PlainTime;
    const text = props.format(t);
    const selected = props.selected !== null && compareTimes(t, props.selected) === 0;
    const disabled = Boolean(props.isDisabled?.(t));
    const outside = virtual && (i < start || i >= end);
    return (
      <div
        key={i}
        id={`${props.id}-${i}`}
        role="option"
        className="salmon-time-list__option"
        aria-selected={selected}
        aria-disabled={disabled || undefined}
        aria-setsize={virtual ? count : undefined}
        aria-posinset={virtual ? i + 1 : undefined}
        data-active={i === active ? '' : undefined}
        data-selected={selected ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        // An active option outside the window stays mounted but out of the flow.
        style={outside ? { position: 'absolute', insetBlockStart: i * h, inlineSize: '100%' } : undefined}
        onPointerDown={(e) => e.preventDefault()}
        onPointerMove={() => {
          if (!disabled && i !== active) props.onActiveChange(i);
        }}
        onClick={(e) => {
          if (!disabled) props.onSelect(t, e);
        }}
      >
        {props.renderOption ? props.renderOption({ time: t, text, selected, disabled, index: i }) : text}
      </div>
    );
  };

  return (
    <div
      ref={scroller}
      id={props.id}
      role="listbox"
      aria-label={props['aria-label']}
      // The scrolling list is a tab stop of its own (axe scrollable-region-focusable): the list keys
      // work on it as on the field; a key already handled by a container (the DateTimePicker time part) stops there.
      tabIndex={0}
      aria-activedescendant={active >= 0 ? `${props.id}-${active}` : undefined}
      onKeyDown={(e) => {
        const next = timeListKey(e.key, count, active, (i) => Boolean(props.isDisabled?.(options[i] as PlainTime)));
        if (next === null) return;
        e.preventDefault();
        if (next !== 'select') return next >= 0 ? props.onActiveChange(next) : undefined;
        const t = options[active];
        if (t) props.onSelect(t, e);
      }}
      className={props.className ? `salmon-time-list ${props.className}` : 'salmon-time-list'}
      data-virtual={virtual ? '' : undefined}
      onScroll={virtual ? syncRange : undefined}
    >
      {virtual ? (
        <div className="salmon-time-list__sizer" style={{ blockSize: count * h, position: 'relative' }}>
          <div style={{ transform: `translateY(${start * h}px)` }}>{indexes.filter((i) => i >= start && i < end).map(option)}</div>
          {indexes.filter((i) => i < start || i >= end).map(option)}
        </div>
      ) : (
        indexes.map(option)
      )}
    </div>
  );
}
