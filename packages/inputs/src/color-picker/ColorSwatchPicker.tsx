'use client';

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { colorName, hslColor, isRtl, toColor, type Color } from './color.js';
import type { ColorChangeSource } from './control.js';
import { ColorSwatch } from './ColorSwatch.js';

/** A palette entry: a color string, or a color with its accessible name. */
export type ColorSwatchItem = string | { readonly value: string; readonly label?: string | undefined };

/** A labelled group of palette entries. */
export interface ColorSwatchGroup {
  readonly label: string;
  readonly colors: readonly ColorSwatchItem[];
}

/** Second argument of `onValueChange`. */
export interface SwatchChangeDetails {
  readonly source: ColorChangeSource;
  readonly reason: 'select' | 'reset';
  /** The picked color (null for "no color"). */
  readonly color: Color | null;
}

/** Argument of `renderSwatch`. */
export interface SwatchRenderContext {
  readonly color: Color | null;
  readonly value: string | null;
  readonly label: string;
  readonly selected: boolean;
  readonly index: number;
}

export interface ColorSwatchPickerProps {
  /** Flat entries or labelled groups. Default: a 10-column palette of grays and 9 hues in 5 shades. */
  readonly colors?: readonly ColorSwatchItem[] | readonly ColorSwatchGroup[] | undefined;
  /** Swatches per row. Default 10. */
  readonly columns?: number | undefined;
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly onValueChange?: ((value: string | null, details: SwatchChangeDetails) => void) | undefined;
  /** Adds a "no color" swatch first; picking it sets `null`. */
  readonly clearable?: boolean | undefined;
  /** Replaces the swatch inside each option. */
  readonly renderSwatch?: ((ctx: SwatchRenderContext) => ReactNode) | undefined;
  /** Name of a hidden input carrying the value (`''` for no color). */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly localeText?: { readonly noColor?: string; readonly colorName?: (color: Color) => string } | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  /** The listbox element. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

let palette: readonly ColorSwatchItem[] | null = null;
/** The default palette: one gray row and five shade rows of nine hues (computed once, a constant). */
export function defaultSwatches(): readonly ColorSwatchItem[] {
  if (palette) return palette;
  const out: string[] = [];
  for (let i = 0; i < 10; i++) out.push(hslColor(0, 0, 100 - (i * 100) / 9).toString('hex'));
  for (const l of [85, 70, 50, 35, 20]) {
    out.push(hslColor(0, 0, l).toString('hex'));
    for (const h of [0, 30, 50, 90, 140, 180, 210, 240, 290]) out.push(hslColor(h, l === 50 ? 85 : 70, l).toString('hex'));
  }
  return (palette = out);
}

interface Cell {
  readonly value: string | null;
  readonly color: Color | null;
  readonly label: string;
  readonly row: number;
  readonly col: number;
  readonly group: number;
}

const isGroups = (colors: readonly ColorSwatchItem[] | readonly ColorSwatchGroup[]): colors is readonly ColorSwatchGroup[] => colors.length > 0 && typeof colors[0] === 'object' && 'colors' in (colors[0] as object);
const norm = (value: string | null): string | null => (value === null ? null : (toColor(value)?.toString('hexa') ?? value));

/**
 * A palette as an APG listbox laid out as a grid: one tab stop (roving tabindex), arrows move by cell and
 * row (ArrowLeft / ArrowRight mirrored in right-to-left content), Home / End
 * to the row ends, Ctrl+Home / Ctrl+End to the first and last swatch, Enter
 * or Space (or a click) selects. Groups are labelled `role="group"`s.
 */
export function ColorSwatchPicker(props: ColorSwatchPickerProps): ReactNode {
  const id = useId();
  const columns = Math.max(1, props.columns ?? 10);
  const [initial] = useState(props.defaultValue ?? null);
  const [value, setValue] = useControllableState<string | null, [SwatchChangeDetails]>(props.value, initial, props.onValueChange, 'ColorSwatchPicker value');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const t = useLocaleText('colorSwatchPicker', props.localeText);
  const name = t?.colorName ?? colorName;
  const source = props.colors ?? defaultSwatches();
  const groups: { label: string | null; colors: readonly ColorSwatchItem[] }[] = isGroups(source) ? source.map((g) => ({ label: g.label, colors: g.colors })) : [{ label: null, colors: source }];

  const cells: Cell[] = [];
  groups.forEach((g, gi) => {
    const items: (ColorSwatchItem | null)[] = gi === 0 && props.clearable ? [null, ...g.colors] : [...g.colors];
    items.forEach((item, i) => {
      const raw = item === null ? null : typeof item === 'string' ? item : item.value;
      const color = raw === null ? null : toColor(raw);
      const label = item === null ? (t?.noColor ?? 'No color') : (typeof item === 'object' && item.label) || (color ? name(color) : raw!);
      cells.push({ value: raw, color, label, row: Math.floor(i / columns), col: i % columns, group: gi });
    });
  });
  const selectedKey = norm(value);
  const selectedIndex = cells.findIndex((c) => (c.value === null ? value === null && props.clearable === true : norm(c.value) === selectedKey));
  const [active, setActive] = useState(-1);
  const focusIndex = active >= 0 && active < cells.length ? active : Math.max(0, selectedIndex);

  useFormReset(rootRef, () => setValue(initial, { source: 'api', reason: 'reset', color: toColor(initial) }));

  const select = (i: number, s: ColorChangeSource): void => {
    const cell = cells[i];
    if (!cell || props.disabled) return;
    setActive(i);
    setValue(cell.value, { source: s, reason: 'select', color: cell.color });
  };

  const moveTo = (i: number): void => {
    setActive(i);
    rootRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[i]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (props.disabled) return;
    const k = event.key;
    const cur = cells[focusIndex];
    if (!cur) return;
    if (k === 'Enter' || k === ' ') {
      event.preventDefault();
      select(focusIndex, 'keyboard');
      return;
    }
    const rtl = isRtl(event.currentTarget);
    let to = -1;
    if (k === 'ArrowRight' || k === 'ArrowLeft') to = focusIndex + ((k === 'ArrowRight') !== rtl ? 1 : -1);
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      const down = k === 'ArrowDown';
      // The next row in the group, else the first (or last) row of the adjacent group.
      let row = cur.row + (down ? 1 : -1);
      let group = cur.group;
      if (!cells.some((c) => c.group === group && c.row === row)) {
        group += down ? 1 : -1;
        const rows = cells.filter((c) => c.group === group).map((c) => c.row);
        row = down ? 0 : Math.max(-1, ...rows);
      }
      const line = cells.map((c, i) => [c, i] as const).filter(([c]) => c.group === group && c.row === row);
      to = line.length ? line[Math.min(cur.col, line.length - 1)]![1] : -1;
    } else if (k === 'Home' || k === 'End') {
      if (event.ctrlKey || event.metaKey) to = k === 'Home' ? 0 : cells.length - 1;
      else {
        const line = cells.map((c, i) => [c, i] as const).filter(([c]) => c.group === cur.group && c.row === cur.row);
        to = (k === 'Home' ? line[0] : line[line.length - 1])![1];
      }
    } else return;
    event.preventDefault();
    if (to >= 0 && to < cells.length) moveTo(to);
  };

  const option = (cell: Cell, i: number): ReactNode => {
    const selected = i === selectedIndex;
    const ctx: SwatchRenderContext = { color: cell.color, value: cell.value, label: cell.label, selected, index: i };
    return (
      <div
        key={i}
        id={`${id}o${i}`}
        role="option"
        aria-selected={selected}
        aria-label={cell.label}
        aria-disabled={props.disabled || undefined}
        tabIndex={i === focusIndex && !props.disabled ? 0 : -1}
        className="salmon-color-swatch-picker-option"
        data-selected={selected ? '' : undefined}
        onClick={(e) => select(i, e.detail === 0 ? 'keyboard' : 'pointer')}
        onFocus={() => setActive(i)}
      >
        {props.renderSwatch ? props.renderSwatch(ctx) : <ColorSwatch color={cell.color} aria-label="" />}
      </div>
    );
  };

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        assignRef(props.ref as never, el);
      }}
      id={props.id}
      role="listbox"
      aria-label={props['aria-labelledby'] ? undefined : (props['aria-label'] ?? 'Colors')}
      aria-labelledby={props['aria-labelledby']}
      aria-disabled={props.disabled || undefined}
      className={cx('salmon-color-swatch-picker', props.className)}
      style={{ '--salmon-color-swatch-picker-columns': columns, ...props.style } as CSSProperties}
      data-disabled={props.disabled ? '' : undefined}
      onKeyDown={onKeyDown}
    >
      {groups.map((g, gi) => {
        const list = cells.flatMap((c, i) => (c.group === gi ? [option(c, i)] : []));
        return g.label === null ? (
          <div key={gi} className="salmon-color-swatch-picker-grid">
            {list}
          </div>
        ) : (
          <div key={gi} role="group" aria-labelledby={`${id}g${gi}`} className="salmon-color-swatch-picker-group">
            <div id={`${id}g${gi}`} className="salmon-color-swatch-picker-label">
              {g.label}
            </div>
            <div className="salmon-color-swatch-picker-grid">{list}</div>
          </div>
        );
      })}
      {props.name ? <input type="hidden" name={props.name} form={props.form} value={value ?? ''} disabled={props.disabled} /> : null}
    </div>
  );
}
