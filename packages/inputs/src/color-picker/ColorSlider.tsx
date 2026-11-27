'use client';

import { useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { cx } from '../internal/field/field.js';
import { assignRef } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { fraction1D, keyMove } from '@salmonui/core/internal/pointer-drag';
import { hueName, isRtl, type Color } from './color.js';
import { styleOf, useColorControl, type ColorPaint, type ColorPartProps } from './control.js';

export interface ColorSliderProps extends ColorPartProps {
  /** The channel: `'hue'` (0-360 degrees) or `'alpha'` (0-100 percent). */
  readonly channel: 'hue' | 'alpha';
  /** Default `'horizontal'`; vertical sliders grow upward and never mirror. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** Arrow key step in channel units; Shift and Page keys use ten times it. Default 1. */
  readonly step?: number | undefined;
  /** The root element. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

/**
 * One channel of a color: a CSS-gradient
 * track with a thumb over a visually hidden range input (APG Slider).
 * `aria-valuetext` names the hue ("120°, green") or the opacity ("50%").
 * Horizontal sliders mirror in right-to-left content, keys included.
 */
export function ColorSlider(props: ColorSliderProps): ReactNode {
  const hue = props.channel === 'hue';
  const max = hue ? 360 : 100;
  const vertical = props.orientation === 'vertical';
  const t = useLocaleText('colorSlider', props.localeText);
  const label = hue ? (t?.hue ?? 'Hue') : (t?.alpha ?? 'Alpha');
  const valueOf = (c: Color): number => (hue ? c.hue : c.alpha * 100);
  const paintOf = (c: Color): ColorPaint => {
    const v = valueOf(c);
    const r = Math.round(v);
    return {
      vars: { '--salmon-color-slider-position': `${(v / max) * 100}%`, '--salmon-color-slider-color': c.toString('hex'), '--salmon-color-slider-thumb': hue ? `hsl(${c.hue} 100% 50%)` : c.toString('rgb') },
      ranges: [[r, hue ? `${r}°, ${(t?.hueName ?? hueName)(c.hue)}` : `${r}%`]],
    };
  };
  const control = useColorControl(props, paintOf);
  const { color } = control;
  const p = paintOf(color);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const step = props.step ?? 1;
  const set = (v: number): Color => color.with(hue ? { hue: v >= 360 ? 359.99 : v } : { alpha: v / 100 });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = keyMove(event.key, vertical ? 'vertical' : 'horizontal', isRtl(event.currentTarget));
    if (!move || props.disabled) return;
    event.preventDefault();
    const big = event.shiftKey || move.type === 'page' ? step * 10 : step;
    const next = move.type === 'min' ? 0 : move.type === 'max' ? max : Math.round(valueOf(color) / step) * step + (move as { direction: 1 | -1 }).direction * big;
    control.step(set(Math.min(max, Math.max(0, next))));
  };

  return (
    <div
      ref={(el) => {
        control.rootRef.current = el;
        assignRef(props.ref as never, el);
      }}
      id={props.id}
      className={cx('salmon-color-slider', props.className)}
      style={styleOf(p, props.style)}
      data-channel={props.channel}
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      data-disabled={props.disabled ? '' : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => control.onPointerDown(event, (x, y, rect, rtl) => set(fraction1D(x, y, rect, vertical ? 'vertical' : 'horizontal', rtl) * max), inputRef.current)}
    >
      <div className="salmon-color-slider-thumb" aria-hidden="true" />
      <input
        ref={inputRef}
        type="range"
        className="salmon-visually-hidden"
        min={0}
        max={max}
        step={step}
        value={p.ranges[0]![0]}
        aria-label={props['aria-labelledby'] ? undefined : (props['aria-label'] ?? label)}
        aria-labelledby={props['aria-labelledby']}
        aria-valuetext={p.ranges[0]![1]}
        aria-orientation={vertical ? 'vertical' : undefined}
        disabled={props.disabled}
        onChange={(e) => control.step(set(Number(e.currentTarget.value)))}
      />
      {props.name ? <input type="hidden" name={props.name} form={props.form} value={color.toString(props.valueFormat ?? 'hexa')} disabled={props.disabled} /> : null}
    </div>
  );
}
