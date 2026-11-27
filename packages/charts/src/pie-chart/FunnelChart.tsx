// FunnelChart: funnel and pyramid segments from
// `viz:accumulation` `funnelLayout`, first value on top, on the shared
// accumulation figure (legend, tooltip, selection, keyboard, table).

import type { ReactNode } from 'react';
import { funnelLayout, lineHeight, n2, pointInPolygon, textWidth, truncateText } from '#viz';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { AccumulationFigure, sizeOf, type AccLabel, type AccMark } from './Accumulation.js';
import type { AccumulationPoint, FunnelChartProps } from './types.js';

export function FunnelChart(props: FunnelChartProps): ReactNode {
  const shape = props.shape ?? 'funnel';
  const labelsOpt = props.labels;
  const text = useLocaleText('funnelChart', props.text);
  const outside = typeof labelsOpt === 'object' && labelsOpt.position === 'outside';
  return (
    <AccumulationFigure
      base={props}
      family="salmon-funnel-chart"
      kind={shape === 'pyramid' ? (text?.pyramidChart ?? 'Pyramid chart') : (text?.funnelChart ?? 'Funnel chart')}
      legend={text?.legend ?? 'Legend'}
      noun="segments"
      labels={labelsOpt !== false}
      geometry={(input) => {
        const { plot } = input;
        const ring = input.rings[0];
        if (!ring) return { marks: [], labels: [], hit: () => -1 };
        // Outside labels take the end third of the plot.
        const W = outside ? plot.width * 0.62 : plot.width;
        const hidden = new Set(ring.items.flatMap((it, k) => (input.hidden.has(it.index) ? [k] : [])));
        const segs = funnelLayout(
          ring.items.map((it) => it.value),
          { shape, width: W, height: plot.height, neckWidth: sizeOf(props.neckWidth, W, W * 0.2), neckHeight: sizeOf(props.neckHeight, plot.height, plot.height * 0.2), gap: props.gap, mode: props.mode, variant: props.variant, hidden },
        );
        const marks: AccMark[] = [];
        const polys: number[][] = [];
        const labels: AccLabel[] = [];
        const decor: ReactNode[] = [];
        const lh = lineHeight('sm');
        for (const s of segs) {
          const it = ring.items[s.index] as (typeof ring.items)[number];
          const point: AccumulationPoint = { series: 0, index: it.index, label: it.label, value: it.value, fraction: s.fraction, color: it.color, datum: it.datum };
          const pts = s.points.map((p) => ({ x: p.x + plot.x, y: p.y + plot.y }));
          const d = `M${pts.map((p) => `${n2(p.x)},${n2(p.y)}`).join('L')}Z`;
          marks.push({ point, d, dx: 0, dy: 0, ax: s.cx + plot.x, ay: s.cy + plot.y });
          polys.push(pts.flatMap((p) => [p.x, p.y]));
          if (s.connector) decor.push(<path key={it.index} className="salmon-funnel-chart-connector" d={`M${s.connector.map((p) => `${n2(p.x + plot.x)},${n2(p.y + plot.y)}`).join('L')}Z`} style={{ fill: it.color }} />);
          const text = input.labelOf(point);
          const segW = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
          if (outside) {
            const x = plot.x + W + 12;
            const right = Math.max(...pts.filter((p) => Math.abs(p.y - (s.top + plot.y)) < 0.01).map((p) => p.x));
            labels.push({ key: String(it.index), x, y: s.cy + plot.y, anchor: 'start', text: truncateText(text, plot.width - W - 16), inside: false, connector: `M${n2(right)},${n2(s.cy + plot.y)}H${n2(x - 4)}` });
          } else if (s.bottom - s.top >= lh && textWidth(text) <= segW * 0.9) {
            labels.push({ key: String(it.index), x: s.cx + plot.x, y: s.cy + plot.y, anchor: 'middle', text, inside: true, connector: null });
          }
        }
        return { marks, labels, decor, hit: (x, y) => polys.findIndex((p) => pointInPolygon(x, y, p)) };
      }}
    />
  );
}
