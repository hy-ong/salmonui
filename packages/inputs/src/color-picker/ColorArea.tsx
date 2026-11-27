'use client';

import { useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { cx } from '../internal/field/field.js';
import { assignRef } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { fraction2D, keyMove } from '@salmonui/core/internal/pointer-drag';
import { isRtl, type Color } from './color.js';
import { describe, styleOf, useColorControl, type ColorPaint, type ColorPartProps } from './control.js';

export interface ColorAreaProps extends ColorPartProps {
  /** Step of the arrow keys in percent; Shift and Page keys use ten times it. Default 1. */
  readonly step?: number | undefined;
  /** The root element. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

const pct = (n: number): number => Math.round(n);

/**
 * Saturation (inline axis) by brightness (block axis) of the current hue: a CSS-gradient square with a thumb and two
 * visually hidden range inputs, so assistive technology meets two APG
 * sliders. Arrow keys move along their axis (mirrored in right-to-left
 * content), Shift and Page keys take large steps, Home / End jump to the
 * ends of the focused channel. The square renders at its size on the
 * server; nothing is measured until a pointer press.
 */
export function ColorArea(props: ColorAreaProps): ReactNode {
  const t = useLocaleText('colorArea', props.localeText);
  const sat = t?.saturation ?? 'Saturation';
  const bri = t?.brightness ?? 'Brightness';
  const paintOf = (c: Color): ColorPaint => {
    const name = describe(c, t);
    return {
      vars: { '--salmon-color-area-hue': `hsl(${c.hue} 100% 50%)`, '--salmon-color-area-x': `${c.saturation}%`, '--salmon-color-area-y': `${c.brightness}%`, '--salmon-color-area-color': c.toString('hex') },
      ranges: [
        [pct(c.saturation), `${sat} ${pct(c.saturation)}%, ${name}`],
        [pct(c.brightness), `${bri} ${pct(c.brightness)}%, ${name}`],
      ],
    };
  };
  const control = useColorControl(props, paintOf);
  const { color } = control;
  const p = paintOf(color);
  const xRef = useRef<HTMLInputElement | null>(null);
  const yRef = useRef<HTMLInputElement | null>(null);
  const step = props.step ?? 1;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = keyMove(event.key, 'horizontal', isRtl(event.currentTarget));
    if (!move || props.disabled) return;
    event.preventDefault();
    const arrow = event.key.startsWith('Arrow');
    const x = arrow ? event.key === 'ArrowLeft' || event.key === 'ArrowRight' : event.target === xRef.current;
    const current = x ? color.saturation : color.brightness;
    const big = event.shiftKey || move.type === 'page' ? step * 10 : step;
    const next = move.type === 'min' ? 0 : move.type === 'max' ? 100 : Math.round(current / step) * step + (move as { direction: 1 | -1 }).direction * big;
    const clamped = Math.min(100, Math.max(0, next));
    (x ? xRef : yRef).current?.focus();
    control.step(color.with(x ? { saturation: clamped } : { brightness: clamped }));
  };

  const range = (x: boolean, el: typeof xRef): ReactNode => (
    <input
      ref={el}
      type="range"
      className="salmon-visually-hidden"
      min={0}
      max={100}
      step={step}
      tabIndex={x ? undefined : -1}
      value={p.ranges[x ? 0 : 1]![0]}
      aria-label={x ? sat : bri}
      aria-valuetext={p.ranges[x ? 0 : 1]![1]}
      disabled={props.disabled}
      onChange={(e) => control.step(color.with(x ? { saturation: Number(e.currentTarget.value) } : { brightness: Number(e.currentTarget.value) }))}
    />
  );

  return (
    <div
      ref={(el) => {
        control.rootRef.current = el;
        assignRef(props.ref as never, el);
      }}
      id={props.id}
      role="group"
      aria-label={props['aria-labelledby'] ? undefined : (props['aria-label'] ?? 'Color')}
      aria-labelledby={props['aria-labelledby']}
      className={cx('salmon-color-area', props.className)}
      style={styleOf(p, props.style)}
      data-disabled={props.disabled ? '' : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={(event) =>
        control.onPointerDown(
          event,
          (cx, cy, rect, rtl, base) => {
            const [fx, fy] = fraction2D(cx, cy, rect, rtl);
            return base.with({ saturation: fx * 100, brightness: fy * 100 });
          },
          xRef.current,
        )
      }
    >
      <div className="salmon-color-area-thumb" aria-hidden="true" />
      {range(true, xRef)}
      {range(false, yRef)}
      {props.name ? <input type="hidden" name={props.name} form={props.form} value={color.toString(props.valueFormat ?? 'hexa')} disabled={props.disabled} /> : null}
    </div>
  );
}
