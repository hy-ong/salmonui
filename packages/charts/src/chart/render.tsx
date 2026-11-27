// SVG rendering of a chart model: marks are `aria-hidden` with the
// rest of the drawing (the accessible table carries the data); colors are
// inline `style` values so `var(--salmon-*)` resolves through CSS; state
// attributes (`data-selected`, `data-dimmed`) are styling hooks.

import type { ReactNode } from 'react';
import { lineHeight, n2, TICK_SIZE, LABEL_GAP, type LegendLayout } from '#viz';
import { LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import type { AxisModel, ChartModel, MarkLabel, MarkPath } from './model.js';

export interface ChartSvgProps {
  readonly model: ChartModel;
  readonly clipId: string;
  /** Marks go to the canvas layer instead. */
  readonly canvas: boolean;
  readonly legendItems: readonly VizLegendItem[];
  readonly legendPage: number;
  readonly selected: ReadonlySet<string>;
  readonly dimmed: ReadonlySet<string>;
  /** Series under legend hover or focus (`data-highlighted`). */
  readonly highlighted?: string | null | undefined;
  readonly emptyText: string;
  readonly renderEmpty?: (() => ReactNode) | undefined;
  /** Custom marker and data label content per point, or undefined. */
  readonly pointContent?: ((kind: 'marker' | 'label', seriesId: string, index: number) => ReactNode) | undefined;
  /** Legend items drawn as HTML content instead. */
  readonly legendCustom?: ReadonlySet<number> | undefined;
}

const at = (x: number, y: number) => `translate(${n2(x)} ${n2(y)})`;

function Path({ m, selected, dimmed }: { m: MarkPath; selected?: boolean; dimmed?: boolean }): ReactNode {
  return (
    <path
      d={m.d}
      className={m.className ? `salmon-viz-mark salmon-chart-${m.className}` : 'salmon-viz-mark'}
      style={{ fill: m.fill ?? 'none', stroke: m.stroke, strokeWidth: m.strokeWidth, strokeDasharray: m.dash, opacity: m.opacity }}
      data-index={m.index}
      data-selected={selected ? '' : undefined}
      data-dimmed={dimmed ? '' : undefined}
    />
  );
}

function Label({ l, className }: { l: MarkLabel; className: string }): ReactNode {
  return (
    <text className={className} x={n2(l.x)} y={n2(l.y)} textAnchor={l.anchor} transform={l.angle ? `rotate(${l.angle} ${n2(l.x)} ${n2(l.y)})` : undefined}>
      {l.text}
    </text>
  );
}

function AxisView({ a }: { a: AxisModel }): ReactNode {
  if (a.hidden) return null;
  const lh = lineHeight('sm');
  const horizontal = a.side === 'top' || a.side === 'bottom';
  const dir = a.side === 'bottom' || a.side === 'right' ? 1 : -1;
  const o = a.options;
  const inside = o.labelPosition === 'inside';
  const tickDir = (o.tickPosition ?? o.labelPosition) === 'inside' ? -dir : dir;
  let ticks = '';
  for (const t of a.ticks) ticks += horizontal ? `M${n2(t.pos)},${n2(a.line)}v${tickDir * TICK_SIZE}` : `M${n2(a.line)},${n2(t.pos)}h${tickDir * TICK_SIZE}`;
  const b = a.block;
  const axisLine = horizontal ? `M${n2(b.x)},${n2(a.line)}H${n2(b.x + b.width)}` : `M${n2(a.line)},${n2(b.y)}V${n2(b.y + b.height)}`;
  const labelOffset = TICK_SIZE + LABEL_GAP;
  const L = a.labelLine;
  // Custom label content: SVG text content in place of the formatted text.
  const content = (t: AxisModel['ticks'][number], k: number, fallback: ReactNode): ReactNode => (o.renderLabel ? o.renderLabel({ axisId: a.id, value: a.scale.kind === 'category' || a.scale.kind === 'timeCategory' ? a.scale.domain[t.value] : a.scale.kind === 'time' ? new Date(t.value) : t.value, text: t.text.join(' '), index: k }) : fallback);
  const tx = (x: number, y: number, title: number) => `rotate(${title} ${n2(x)} ${n2(y)})`;
  const titleX = horizontal ? b.x + b.width / 2 : dir > 0 ? b.x + b.width - 4 : b.x + lh * 0.8;
  const titleY = horizontal ? (dir > 0 ? b.y + b.height - 2 : b.y + lh) : b.y + b.height / 2;
  const titleAngle = o.titleAngle ?? (horizontal ? 0 : dir > 0 ? 90 : -90);
  const groupBase = L + dir * a.groupOffset;
  return (
    <g className="salmon-chart-axis" data-axis={a.id}>
      {o.line === false ? null : <path className="salmon-viz-axis-line" d={axisLine} />}
      {o.ticks === false ? null : <path className="salmon-viz-tick" d={ticks} />}
      {a.ticks.map((t, k) => {
        if (t.hidden) return null;
        if (horizontal) {
          const y = dir > 0 !== inside ? L + labelOffset + lh * 0.75 + t.row * lh : L - labelOffset - (t.text.length - 1) * lh - t.row * lh;
          if (a.angle) {
            const ay = dir > 0 ? L + labelOffset : L - labelOffset;
            return (
              <text key={t.key} data-tick={k} x={n2(t.pos)} y={n2(ay)} textAnchor="end" dominantBaseline="central" transform={tx(t.pos, ay, a.angle)}>
                {content(t, k, t.text[0])}
              </text>
            );
          }
          return (
            <text key={t.key} data-tick={k} x={n2(t.pos)} y={n2(y)} textAnchor="middle">
              {content(
                t,
                k,
                t.text.map((line, i) => (
                  <tspan key={i} x={n2(t.pos)} dy={i === 0 ? 0 : lh}>
                    {line}
                  </tspan>
                )),
              )}
            </text>
          );
        }
        const x = dir > 0 !== inside ? L + labelOffset : L - labelOffset;
        return (
          <text key={t.key} data-tick={k} x={n2(x)} y={n2(t.pos + lh * 0.32)} textAnchor={dir > 0 !== inside ? 'start' : 'end'}>
            {content(t, k, t.text[0])}
          </text>
        );
      })}
      {a.groups.map((g) => {
        // Multi-level labels: a bordered cell per level, one row (column) per group.
        const r0 = groupBase + dir * g.off;
        const r1 = r0 + dir * (horizontal ? g.size : 4);
        const mid = (g.a + g.b) / 2;
        const sides = g.border === 'none' ? '' : g.border === 'brace' || g.border === 'curlyBrace' ? (horizontal ? `M${n2(g.a + 1)},${n2(r0)}V${n2(r0 + dir * 4)}H${n2(g.b - 1)}V${n2(r0)}${g.border === 'curlyBrace' ? `M${n2(mid)},${n2(r0 + dir * 4)}v${dir * 3}` : ''}` : `M${n2(r0)},${n2(g.a + 1)}H${n2(r0 + dir * 4)}V${n2(g.b - 1)}H${n2(r0)}`) : horizontal ? `M${n2(g.a)},${n2(r0)}V${n2(r1)}M${n2(g.b)},${n2(r0)}V${n2(r1)}${g.border === 'noTop' || g.border === 'noTopBottom' ? '' : `M${n2(g.a)},${n2(r0)}H${n2(g.b)}`}${g.border === 'noTopBottom' ? '' : `M${n2(g.a)},${n2(r1)}H${n2(g.b)}`}` : `M${n2(r0)},${n2(g.a)}H${n2(r1)}M${n2(r0)},${n2(g.b)}H${n2(r1)}`;
        return (
          <g key={g.key} className="salmon-chart-label-group" data-group={g.key}>
            {sides ? <path className="salmon-viz-tick" d={sides} /> : null}
            <text x={n2(horizontal ? mid : r1 + dir * 4)} y={n2(horizontal ? (r0 + r1) / 2 + lh * 0.32 + (g.border === 'brace' || g.border === 'curlyBrace' ? dir * 3 : 0) : mid + lh * 0.32)} textAnchor={horizontal ? 'middle' : dir > 0 ? 'start' : 'end'}>
              {g.label}
            </text>
          </g>
        );
      })}
      {a.title ? (
        <text className="salmon-viz-axis-title" x={n2(titleX)} y={n2(titleY)} textAnchor="middle" transform={titleAngle ? tx(titleX, titleY, titleAngle) : undefined}>
          {a.title}
        </text>
      ) : null}
    </g>
  );
}

function grid(a: AxisModel, plot: ChartModel['plot']): string {
  if (a.grid === 'none') return '';
  const horizontal = a.side === 'top' || a.side === 'bottom';
  let d = '';
  const lines = a.grid === 'both' ? [...a.ticks.map((t) => t.pos), ...a.minor] : a.ticks.map((t) => t.pos);
  for (const p of lines) d += horizontal ? `M${n2(p)},${n2(plot.y)}V${n2(plot.y + plot.height)}` : `M${n2(plot.x)},${n2(p)}H${n2(plot.x + plot.width)}`;
  return d;
}

export function ChartSvg(props: ChartSvgProps): ReactNode {
  const { model, clipId } = props;
  const { plot, frame } = model;
  return (
    <svg className="salmon-chart-svg" viewBox={`0 0 ${model.width} ${model.height}`} width={model.width} height={model.height} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <rect x={n2(plot.x - 1)} y={n2(plot.y - 1)} width={n2(plot.width + 2)} height={n2(plot.height + 2)} />
        </clipPath>
      </defs>
      {frame.title ? (
        <text className="salmon-viz-title" x={n2(frame.title.x)} y={n2(frame.title.y)}>
          {frame.title.text}
        </text>
      ) : null}
      {frame.subtitle ? (
        <text className="salmon-viz-subtitle" x={n2(frame.subtitle.x)} y={n2(frame.subtitle.y)}>
          {frame.subtitle.text}
        </text>
      ) : null}
      <g className="salmon-chart-bands">{model.axes.flatMap((a) => a.bands.filter((b) => b.className !== 'over').map((b) => <Path key={b.key} m={b} />))}</g>
      <path className="salmon-viz-grid" d={model.decor?.grid ?? model.axes.map((a) => grid(a, plot)).join('')} />
      {props.canvas ? null : (
        <g className="salmon-chart-series" clipPath={`url(#${clipId})`}>
          {model.series.map((s) =>
            s.hidden ? null : (
              <g key={s.id} className="salmon-chart-series-group" data-series={s.id} data-type={s.type} data-dimmed={props.dimmed.has(s.id) ? '' : undefined} data-highlighted={props.highlighted === s.id ? '' : undefined}>
                {s.marks.map((m) => {
                  const custom = m.className === 'marker' && m.index !== undefined ? props.pointContent?.('marker', s.id, m.index) : undefined;
                  if (custom !== undefined && m.index !== undefined)
                    return (
                      <g key={m.key} className="salmon-viz-mark salmon-chart-custom-marker" data-index={m.index} transform={at(s.px[m.index] as number, s.py[m.index] as number)}>
                        {custom}
                      </g>
                    );
                  return <Path key={m.key} m={m} selected={m.index !== undefined && props.selected.has(`${s.id}:${m.index}`)} />;
                })}
              </g>
            ),
          )}
        </g>
      )}
      <g className="salmon-chart-bands-over">{model.axes.flatMap((a) => a.bands.filter((b) => b.className === 'over').map((b) => <Path key={b.key} m={b} />))}</g>
      {model.axes.map((a) => (
        <AxisView key={a.id} a={a} />
      ))}
      {model.decor ? (
        <g className="salmon-chart-axis" data-axis="polar">
          {model.decor.labels.map((l) => (
            <Label key={l.key} l={l} className="salmon-chart-polar-label" />
          ))}
        </g>
      ) : null}
      {model.axes.flatMap((a) =>
        a.lines.map((l) => (
          <g key={l.key} className="salmon-chart-axis-marker">
            <path d={l.d} className="salmon-viz-axis-line" style={{ stroke: l.color, strokeDasharray: l.dash }} />
            {l.label ? (
              <text x={n2(l.lx)} y={n2(l.ly)} textAnchor={a.side === 'top' || a.side === 'bottom' ? 'start' : 'end'}>
                {l.label}
              </text>
            ) : null}
          </g>
        )),
      )}
      <g className="salmon-chart-labels">
        {model.series.flatMap((s) =>
          s.hidden
            ? []
            : s.labels.map((l) => {
                const custom = l.index === undefined ? undefined : props.pointContent?.('label', s.id, l.index);
                return custom === undefined ? (
                  <Label key={`${s.id}-${l.key}`} l={l} className="salmon-chart-data-label" />
                ) : (
                  <g key={`${s.id}-${l.key}`} className="salmon-chart-data-label" transform={at(l.x, l.y)}>
                    {custom}
                  </g>
                );
              }),
        )}
        {model.stackLabels.map((l) => (
          <Label key={l.key} l={l} className="salmon-chart-stack-label" />
        ))}
      </g>
      {model.empty ? (
        props.renderEmpty ? null : (
          <text className="salmon-viz-empty" x={n2(plot.x + plot.width / 2)} y={n2(plot.y + plot.height / 2)} textAnchor="middle">
            {props.emptyText}
          </text>
        )
      ) : null}
      {frame.legend ? <LegendSvg layout={props.legendCustom?.size ? { ...frame.legend, items: frame.legend.items.filter((b) => !props.legendCustom?.has(b.index)) } : (frame.legend as LegendLayout)} items={props.legendItems} page={props.legendPage} /> : null}
    </svg>
  );
}
