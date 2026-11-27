// PieChart: pie, doughnut, semi and partial pies,
// concentric rings, explosion, small-slice grouping and inside / outside
// labels with connectors, on the shared accumulation figure. Layout comes
// from `viz:accumulation` (pure), arcs from `viz:geometry`.

import type { ReactNode } from 'react';
import { arcAt, arcPath, explodeOffset, groupSmall, lineHeight, n2, pieLabels, pieLayout, polar, textWidth, truncateText, type ArcRegion } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { changeEvent, type Frame } from '../internal/viz/frame.js';
import { useVizSelector } from '../internal/viz/store.js';
import { AccumulationFigure, place, sizeOf, type AccLabel, type AccMark, type AccRing } from './Accumulation.js';
import type { AccumulationPoint, PieChartProps } from './types.js';

const EMPTY: readonly number[] = [];

export function PieChart(props: PieChartProps): ReactNode {
  const small = props.size === 'small';
  const explode = props.explode;
  const explodeOpts = typeof explode === 'object' ? explode : {};
  const [exploded, setExploded] = useControllableState(props.explodedPoints, props.defaultExplodedPoints ?? EMPTY, props.onExplodedPointsChange, 'explodedPoints');
  const labelsOpt = props.labels;
  const labelsOn = labelsOpt !== false;
  const labelCfg = typeof labelsOpt === 'object' ? labelsOpt : {};
  const group = props.groupSmall;
  const text = useLocaleText('pieChart', props.text);
  return (
    <AccumulationFigure
      base={props}
      series={props.series}
      family="salmon-pie-chart"
      kind={props.innerRadius ? (text?.doughnutChart ?? 'Doughnut chart') : (text?.pieChart ?? 'Pie chart')}
      legend={text?.legend ?? 'Legend'}
      noun="slices"
      small={small}
      labels={labelsOn}
      prepare={
        group
          ? (rings) =>
              rings.map((ring): AccRing => {
                const g = groupSmall(
                  ring.items.map((it) => it.value),
                  group,
                );
                if (!g.grouped.length) return ring;
                return { ...ring, items: [...g.kept.map((i) => ring.items[i] as AccRing['items'][number]), { index: ring.items.length, label: group.label ?? text?.others ?? 'Others', value: g.other, datum: null, color: 'var(--salmon-text-secondary)' }] };
              })
          : undefined
      }
      onActivate={explode ? (ref, source) => setExploded(exploded.includes(ref.index) ? exploded.filter((i) => i !== ref.index) : [...exploded, ref.index], changeEvent(source, source === 'keyboard' ? 'keyboard' : 'click')) : undefined}
      geometry={(input, frame) => {
        const { plot } = input;
        const half = Math.min(plot.width, plot.height) / 2;
        const outside = labelsOn && !small && labelCfg.position !== 'inside';
        // Room for outside labels and connectors.
        const fallback = half * (outside ? 0.7 : 0.9);
        const R = Math.max(1, sizeOf(props.radius, half, fallback));
        const inner = Math.max(0, Math.min(R - 1, sizeOf(props.innerRadius, R, 0)));
        const cx = plot.x + sizeOf(props.center?.x, plot.width, plot.width / 2);
        const cy = plot.y + sizeOf(props.center?.y, plot.height, plot.height / 2);
        const rings = input.rings;
        const band = (R - inner) / rings.length;
        const offset = explodeOpts.offset ?? 10;
        const marks: AccMark[] = [];
        const regions: ArcRegion[] = [];
        const labelInputs: { slice: ReturnType<typeof pieLayout>[number]; width: number; height: number; text: string; key: string }[] = [];
        const lh = lineHeight('sm');
        rings.forEach((ring, r) => {
          const r0 = inner + band * r;
          const r1 = r0 + band;
          const slices = pieLayout(
            ring.items.map((it) => it.value),
            { startAngle: props.startAngle, endAngle: props.endAngle, padAngle: props.padAngle, hidden: new Set(ring.items.flatMap((it, k) => (input.hidden.has(it.index) ? [k] : []))) },
          );
          for (const s of slices) {
            const it = ring.items[s.index] as AccRing['items'][number];
            const point: AccumulationPoint = { series: r, index: it.index, label: it.label, value: it.value, fraction: s.fraction, color: it.color, datum: it.datum };
            const ex = explode && (explodeOpts.all || exploded.includes(it.index)) && r === rings.length - 1 ? explodeOffset(s, offset) : { dx: 0, dy: 0 };
            const a = polar(cx, cy, (r0 + r1) / 2, s.mid);
            marks.push({ point, d: arcPath(cx, cy, r0, r1, s.start, s.end), dx: ex.dx, dy: ex.dy, ax: a.x + ex.dx, ay: a.y + ex.dy });
            regions.push({ cx: cx + ex.dx, cy: cy + ex.dy, inner: r0, outer: r1, start: s.start, end: s.end });
            if (r === rings.length - 1) {
              const text = truncateText(input.labelOf(point), labelCfg.maxWidth ?? 140);
              labelInputs.push({ slice: s, width: textWidth(text), height: lh, text, key: `${r}-${it.index}` });
            }
          }
        });
        const labels: AccLabel[] = [];
        if (labelsOn && !small) {
          const boxes = pieLabels(labelInputs, { cx, cy, radius: R, innerRadius: rings.length > 1 ? R - band : inner, position: labelCfg.position ?? 'auto', lineHeight: lh + 2, bounds: input.plot });
          boxes.forEach((b, k) => {
            const li = labelInputs[k];
            if (!li || b.hidden) return;
            const c = b.connector;
            const connector = c
              ? labelCfg.connector === 'curve'
                ? `M${n2(c[0]!.x)},${n2(c[0]!.y)}Q${n2(c[1]!.x)},${n2(c[1]!.y)} ${n2(c[2]!.x)},${n2(c[2]!.y)}`
                : `M${n2(c[0]!.x)},${n2(c[0]!.y)}L${n2(c[1]!.x)},${n2(c[1]!.y)}L${n2(c[2]!.x)},${n2(c[2]!.y)}`
              : null;
            labels.push({ key: li.key, x: b.x, y: b.y, anchor: b.anchor, text: li.text, inside: b.inside, connector });
          });
        }
        const center = props.centerLabel;
        const overlay =
          center !== undefined && center !== null ? (
            <PieCenter frame={frame} marks={marks} render={center} total={rings[rings.length - 1]?.items.reduce((s2, it) => s2 + (input.hidden.has(it.index) || !(it.value > 0) ? 0 : it.value), 0) ?? 0} left={place(cx, frame.size.width)} top={place(cy, frame.size.height)} />
          ) : null;
        return { marks, labels, hit: (x, y) => arcAt(regions, x, y), overlay };
      }}
    />
  );
}

interface PieCenterProps {
  readonly frame: Frame;
  readonly marks: readonly AccMark[];
  readonly render: NonNullable<PieChartProps['centerLabel']>;
  readonly total: number;
  readonly left: string;
  readonly top: string;
}

/** Doughnut center label: updates with the hovered or focused slice. */
function PieCenter({ frame, marks, render, total, left, top }: PieCenterProps): ReactNode {
  const active = useVizSelector(frame.store, (s) => (s.hover >= 0 ? s.hover : s.focus));
  const point = marks[active]?.point ?? null;
  return (
    <div className="salmon-pie-chart-center" style={{ left, top }} aria-hidden="true">
      {typeof render === 'function' ? render({ point, total }) : render}
    </div>
  );
}
