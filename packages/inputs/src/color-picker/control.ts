'use client';

// State and pointer drag shared by ColorArea and ColorSlider. The drag runs on the
// internal pointer-drag primitive (one rect read at pointerdown, one move per
// frame). While an uncontrolled part is dragged its markup is painted
// directly (CSS variables, range input values) and React state is written
// once at the end, so a drag renders nothing; a controlled part reports each
// frame through `onValueChange` and renders what its owner passes back.

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useFormReset } from '@salmonui/core/internal/form';
import { usePointerDrag, type DragRect } from '@salmonui/core/internal/pointer-drag';
import { colorName, isRtl, rgbColor, toColor, type Color, type ColorFormat, type ColorInput } from './color.js';

/** Where a change came from. */
export type ColorChangeSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Second argument of `onValueChange` / `onValueCommit` of ColorArea and ColorSlider. */
export interface ColorChangeDetails {
  readonly source: ColorChangeSource;
  /** `'drag'` pointer drag (rAF-throttled), `'step'` keyboard or assistive technology step, `'reset'` form reset. */
  readonly reason: 'drag' | 'step' | 'reset';
}

/** Strings of the color parts; `colorName` and `hueName` replace the English descriptions in `aria-valuetext`. */
export interface ColorPartLocaleText {
  readonly saturation?: string;
  readonly brightness?: string;
  readonly hue?: string;
  readonly alpha?: string;
  readonly colorName?: (color: Color) => string;
  /** Name of a hue (0-360 degrees) in the hue slider's `aria-valuetext` ("120°, green"). */
  readonly hueName?: (hue: number) => string;
}

/** Props shared by ColorArea and ColorSlider. */
export interface ColorPartProps {
  /** Controlled color: a string or a `Color` (a `Color` keeps the hue of grays). */
  readonly value?: ColorInput | undefined;
  readonly defaultValue?: ColorInput | undefined;
  /** Every change; during a pointer drag at most once per animation frame. */
  readonly onValueChange?: ((color: Color, details: ColorChangeDetails) => void) | undefined;
  /** The end of a drag, and every keyboard step. */
  readonly onValueCommit?: ((color: Color, details: ColorChangeDetails) => void) | undefined;
  /** Name of a hidden input carrying the color in `valueFormat`. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  /** Format of the hidden input value. Default `'hexa'`. */
  readonly valueFormat?: ColorFormat | undefined;
  readonly disabled?: boolean | undefined;
  readonly localeText?: ColorPartLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  readonly id?: string | undefined;
}

/** `#008000ff`, the default value. */
export const DEFAULT_COLOR: Color = rgbColor(0, 128, 0);

export const describe = (color: Color, text: ColorPartLocaleText | undefined): string => (text?.colorName ?? colorName)(color);

const same = (a: Color, b: Color): boolean => a.hue === b.hue && a.saturation === b.saturation && a.brightness === b.brightness && a.alpha === b.alpha;

/** A painted channel: its CSS variables on the root and the range inputs' values and texts, in DOM order. */
export interface ColorPaint {
  readonly vars: Readonly<Record<string, string>>;
  readonly ranges: readonly (readonly [value: number, text: string])[];
}

function paint(root: HTMLElement, p: ColorPaint, hidden: string): void {
  for (const key in p.vars) root.style.setProperty(key, p.vars[key] as string);
  const ranges = root.querySelectorAll<HTMLInputElement>('input[type="range"]');
  p.ranges.forEach(([value, text], i) => {
    const el = ranges[i];
    if (!el) return;
    el.value = String(value);
    el.setAttribute('aria-valuetext', text);
  });
  const named = root.querySelector<HTMLInputElement>('input[type="hidden"]');
  if (named) named.value = hidden;
}

export interface ColorControl {
  readonly color: Color;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  /** A discrete change (keyboard, range input): change then commit. */
  readonly step: (next: Color) => void;
  /** Starts a pointer drag on `event.currentTarget`; `pick` maps a pointer position to a color. */
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>, pick: (x: number, y: number, rect: DragRect, rtl: boolean, base: Color) => Color, focus: HTMLElement | null) => void;
}

/** State of a ColorArea or ColorSlider; `paintOf` maps a color to its CSS variables and range values. */
export function useColorControl(props: ColorPartProps, paintOf: (color: Color) => ColorPaint): ColorControl {
  const [initial] = useState<Color>(() => toColor(props.defaultValue) ?? DEFAULT_COLOR);
  const [inner, setInner] = useState<Color>(initial);
  // The last color this part reported: a controlled string that serializes the same keeps its hue.
  const [kept, setKept] = useState<Color | null>(null);
  const controlled = props.value !== undefined;
  const parsed = controlled ? toColor(props.value) : null;
  const color = parsed ? (kept && kept.equals(parsed) ? kept : parsed) : inner;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const drag = usePointerDrag();
  const format = props.valueFormat ?? 'hexa';

  const report = (next: Color, source: ColorChangeSource, reason: ColorChangeDetails['reason'], commit: boolean): void => {
    if (controlled && typeof props.value === 'string') setKept(next);
    const details = props.onValueChange || (commit && props.onValueCommit) ? Object.freeze({ source, reason }) : null;
    if (details) {
      props.onValueChange?.(next, details);
      if (commit) props.onValueCommit?.(next, details);
    }
  };

  useFormReset(rootRef, () => {
    if (!controlled) setInner(initial);
    report(initial, 'api', 'reset', false);
  });

  return {
    color,
    rootRef,
    step: (next) => {
      if (props.disabled || same(next, color)) return;
      if (!controlled) setInner(next);
      report(next, 'keyboard', 'step', true);
    },
    onPointerDown: (event, pick, focus) => {
      if (props.disabled) return;
      const root = rootRef.current;
      const base = color;
      const rtl = isRtl(root);
      const source: ColorChangeSource = event.pointerType === 'touch' || event.pointerType === 'pen' ? 'touch' : 'pointer';
      let last = base;
      const apply = (e: PointerEvent, rect: DragRect): void => {
        const next = pick(e.clientX, e.clientY, rect, rtl, base);
        if (same(next, last)) return;
        last = next;
        if (!controlled && root) paint(root, paintOf(next), next.toString(format));
        report(next, source, 'drag', false);
      };
      const session = drag.start(event, {
        onStart: (e, rect) => {
          focus?.focus({ preventScroll: true });
          apply(e, rect);
        },
        onMove: apply,
        onEnd: () => {
          if (!controlled) setInner(last);
          if (props.onValueCommit && !same(last, base)) props.onValueCommit(last, Object.freeze({ source, reason: 'drag' }));
        },
      });
      // Keeps focus on the range input and prevents text selection.
      if (session) event.preventDefault();
    },
  };
}

/** The style of a part's root: `className` / `style` passthrough plus its paint variables. */
export const styleOf = (p: ColorPaint, style: CSSProperties | undefined): CSSProperties => ({ ...(p.vars as CSSProperties), ...style });
