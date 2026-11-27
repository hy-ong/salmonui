// Sparkline: a static SVG
// with `role="img"` and an automatic summary. No store, no ResizeObserver
// and no listener at rest, so hundreds fit in Data Grid cells. With
// `tooltip` the SVG becomes focusable and the tooltip chunk loads on the
// first pointer enter or focus.

import { lazy, Suspense, useState, type ReactElement, type ReactNode } from 'react';
import { useLocale } from '@salmonui/core/internal/locale';
import { n2, polylineAreaPath, polylinePath } from '#viz';
import { warnLowContrastDataColors } from '../internal/data-colors.js';
import { sparkModel, sparkSummary, type SparkPoint } from './model.js';
import type { SparklinePointKind, SparklineProps } from './types.js';

// Read inline (not internal/dev.ts `DEV`): bundlers replace it textually, so the branch folds away in production
// builds even when dev.ts lands in a chunk shared with lazy chunks (an imported binding does not fold).
declare const process: { readonly env: { readonly NODE_ENV?: string } };

const SparklineTooltip = lazy(() => import('./tooltip.js'));

const SEED: Record<SparklinePointKind, string> = {
  high: 'var(--salmon-color-success)',
  low: 'var(--salmon-color-danger)',
  first: 'var(--salmon-color-primary)',
  last: 'var(--salmon-color-primary)',
  negative: 'var(--salmon-color-danger)',
};
const ORDER: readonly SparklinePointKind[] = ['negative', 'first', 'last', 'low', 'high'];

export function Sparkline(props: SparklineProps): ReactNode {
  const { className, style, ref, id, tooltip } = props;
  const type = props.type ?? 'line';
  const m = sparkModel(props, useLocale(props.locale));
  // Null at rest; the pointer x that armed the lazy chunk (null when armed by focus).
  const [armed, setArmed] = useState<{ readonly x: number | null } | null>(null);
  const color = props.color ?? 'var(--salmon-color-primary)';
  const highlight = (p: SparkPoint): string | null => {
    let c: string | null = null;
    for (const k of ORDER) {
      const h = props.highlights?.[k];
      if (h && p.kinds.includes(k)) c = h === true ? SEED[k] : h;
    }
    return c;
  };
  const pick = (sel: SparklineProps['markers'], p: SparkPoint) => sel === 'all' || (Array.isArray(sel) && p.kinds.some((k) => (sel as readonly SparklinePointKind[]).includes(k)));
  const styleOf = (p: SparkPoint) => props.getPointStyle?.(p);
  const label = props.label ?? sparkSummary(m);
  const { width: W, height: H } = m;

  const marks: ReactElement[] = [];
  const texts: ReactNode[] = [];
  if (type === 'line' || type === 'area') {
    const xs = m.points.map((p) => p.px);
    const ys = m.points.map((p) => p.py);
    if (type === 'area') marks.push(<path key="area" className="salmon-sparkline-area" d={polylineAreaPath(xs, ys, m.base ?? H)} style={{ fill: color }} />);
    marks.push(<path key="line" className="salmon-sparkline-line" d={polylinePath(xs, ys)} style={{ stroke: color }} />);
    // Markers draw over the line.
    for (const p of m.points) {
      const s = styleOf(p);
      const hc = highlight(p);
      if (s?.hidden || !(pick(props.markers, p) || hc)) continue;
      marks.push(<circle key={`m${p.index}`} className="salmon-sparkline-marker" cx={p.px} cy={p.py} r={2} style={{ fill: s?.color ?? hc ?? color }} />);
    }
  } else {
    for (const p of m.points) {
      const s = styleOf(p);
      if (s?.hidden || !p.bar) continue;
      const fill = s?.color ?? highlight(p) ?? (type === 'winLoss' && p.y === 0 && props.tieColor ? props.tieColor : props.palette?.length ? props.palette[p.index % props.palette.length] : type === 'winLoss' && p.y < 0 ? 'var(--salmon-color-danger)' : color);
      marks.push(<rect key={p.index} className="salmon-sparkline-bar" x={p.bar.x} y={p.bar.y} width={p.bar.w} height={p.bar.h} style={{ fill }} />);
    }
  }
  if (props.labels) {
    for (const p of m.points) {
      if (!pick(props.labels, p)) continue;
      const above = p.py > 10;
      texts.push(
        <text key={`l${p.index}`} className="salmon-sparkline-label" x={p.px} y={n2(above ? p.py - 3 : p.py + 9)} textAnchor="middle">
          {m.format(p.y)}
        </text>,
      );
    }
  }

  // the entrance transition (`@salmonui/charts/viz-animations.css`) keys on `data-animate`, set from a
  // ref callback, which runs on commit only: never in server markup, no effect and no listener at rest.
  const animate = (el: SVGGElement | null) => {
    el?.toggleAttribute('data-animate', props.animated !== false);
    // the development-only data-color contrast check (dropped from production builds).
    if (process.env.NODE_ENV !== 'production') warnLowContrastDataColors(el?.ownerSVGElement);
  };
  // the opt-in canvas layer (`canvasRenderer` from `@salmonui/charts/sparkline/canvas`); `auto` switches
  // at 20,000 points. Without the renderer the marks stay SVG.
  const renderer = props.renderer;
  const canvas = renderer === 'canvas' || (renderer === 'auto' && m.points.length >= 2e4) ? props.canvasRenderer : undefined;
  // Hover, click and keyboard handling live in the lazy chunk, armed on the first pointer enter or focus.
  const interactive = Boolean(tooltip) || Boolean(props.onPointHover) || Boolean(props.onPointClick);
  const arm =
    interactive && !armed
      ? (event: object) => {
          const x = (event as { readonly clientX?: unknown }).clientX;
          setArmed({ x: typeof x === 'number' ? x : null });
        }
      : undefined;

  return (
    <svg
      ref={ref}
      id={id}
      className={className ? `salmon-sparkline ${className}` : 'salmon-sparkline'}
      style={style}
      data-type={type}
      role="img"
      aria-label={label}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      tabIndex={tooltip ? 0 : undefined}
      onPointerEnter={arm}
      onFocus={arm}
    >
      {props.bands?.map((b, i) => {
        const y0 = m.yOf(b.to);
        const y1 = m.yOf(b.from);
        return <rect key={`b${i}`} className="salmon-sparkline-band" x={0} y={n2(Math.min(y0, y1))} width={W} height={n2(Math.abs(y1 - y0))} style={b.color ? { fill: b.color } : undefined} />;
      })}
      {m.base !== null && props.baseline !== undefined ? <line className="salmon-sparkline-axis" x1={0} x2={W} y1={m.base} y2={m.base} /> : null}
      <g ref={animate} className="salmon-sparkline-marks">
        {canvas ? (
          // the canvas mark layer, sized in drawing px; empty in server markup, drawn on commit.
          <foreignObject width={W} height={H}>
            <canvas ref={(el) => void (el && canvas(el, marks, W, H))} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />
          </foreignObject>
        ) : (
          marks
        )}
        {texts}
      </g>
      {armed ? (
        <Suspense fallback={null}>
          <SparklineTooltip startX={armed.x} model={m} options={typeof tooltip === 'object' ? tooltip : {}} show={Boolean(tooltip)} onPointHover={props.onPointHover} onPointClick={props.onPointClick} />
        </Suspense>
      ) : null}
    </svg>
  );
}
