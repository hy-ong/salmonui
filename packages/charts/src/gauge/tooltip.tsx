'use client';

// Gauge tooltip, a lazy chunk mounted on the first hover (hover state is
// client only, so the server markup never carries it): the hovered pointer,
// range or annotation, its label and its value text.

import type { ReactNode } from 'react';
import type { ValueFormatter } from '#viz';
import { VizTooltip } from '../internal/viz/tooltip.js';
import type { GaugeTooltipContext, GaugeTooltipTarget } from './Gauge.js';
import type { GaugeModel } from './layout.js';

export interface GaugeTipProps {
  readonly model: GaugeModel;
  readonly hover: { readonly kind: GaugeTooltipTarget; readonly id: string };
  readonly render?: ((ctx: GaugeTooltipContext) => ReactNode) | undefined;
  /** Accessible name and value text of the pointer at an index. */
  readonly name: (index: number) => string;
  readonly text: (index: number, value: number) => string;
  readonly fmt: ValueFormatter;
  readonly width: number;
  readonly height: number;
}

export default function GaugeTip({ model, hover, render, name, text, fmt, width, height }: GaugeTipProps): ReactNode {
  const pm = hover.kind === 'pointer' ? model.pointers.find((p) => p.id === hover.id) : undefined;
  const rm = hover.kind === 'range' ? model.axes.flatMap((a) => a.ranges).find((r) => r.id === hover.id) : undefined;
  const am = hover.kind === 'annotation' ? model.axes.flatMap((a) => a.annotations).find((a) => a.id === hover.id) : undefined;
  const ctx: GaugeTooltipContext | null = pm
    ? { target: 'pointer', id: pm.id, value: pm.value, label: name(pm.index) }
    : rm
      ? { target: 'range', id: rm.id, from: rm.from, to: rm.to, label: rm.label }
      : am && (am.label || render)
        ? { target: 'annotation', id: am.id, label: am.label ?? '' }
        : null;
  if (!ctx) return null;
  return (
    <VizTooltip x={pm ? pm.hx : rm ? rm.ax : am!.x} y={pm ? pm.hy : rm ? rm.ay : am!.y} width={width} height={height}>
      {render ? render(ctx) : (
        <span className="salmon-viz-tooltip-row">
          {ctx.label}
          {am ? null : <>: <span className="salmon-viz-tooltip-value">{pm ? text(pm.index, pm.value) : `${fmt(rm!.from)}–${fmt(rm!.to)}`}</span></>}
        </span>
      )}
    </VizTooltip>
  );
}
