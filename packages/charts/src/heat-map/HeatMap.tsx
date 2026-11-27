// HeatMap: a matrix of colored cells with category, numeric or
// time axes, multi-level labels, gradient or step color scales of data
// colors (default the derived sequential palette), a gradient or list
// legend, rect or bubble cells, selection, a store-driven tooltip and the
// cell keyboard model. From 10,000 cells (`renderer: 'auto'`) the cells move
// to a lazy canvas layer; axes, labels and the legend stay SVG.

import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { arcPath, lineHeight, n2, numberFormatter, pct, rotatedBox, tableModel, textWidth, type HeatMatrix } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { VizFigure } from '../internal/viz/figure.js';
import { changeEvent, FocusAnnouncement, FrameTitles, pointerSource, surfaceStyle, toDrawing, toggleIn, useFrame, useVizInstance, type Frame, type VizChangeSource } from '../internal/viz/frame.js';
import { LegendButtons, LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import { useVizSelector } from '../internal/viz/store.js';
import { VizTooltip } from '../internal/viz/tooltip.js';
import { buildMatrix, cellAt, cellColors, cellOf, EMPTY_COLOR, heatLayout, type HeatColors, type HeatLayout } from './model.js';
import type { HeatMapCell, HeatMapCellRef, HeatMapProps } from './types.js';

const EMPTY_REFS: readonly HeatMapCellRef[] = [];
const EMPTY_NUMS: readonly number[] = [];
const sameCell = (a: HeatMapCellRef, b: HeatMapCellRef) => a.x === b.x && a.y === b.y;
/** `renderer: 'auto'` switches to canvas at this many cells. */
export const HEAT_MAP_CANVAS_THRESHOLD = 10_000;

export function HeatMap(props: HeatMapProps): ReactNode {
  const locale = useLocale(props.locale);
  const text = { heatMap: 'Heat map', legend: 'Legend', column: 'Column', row: 'Row', value: 'Value', noValue: 'No value', ...useLocaleText('heatMap', props.text) };
  const idBase = useId();
  const frame = useFrame(props);
  const { store, size } = frame;
  const [selected, setSelected] = useControllableState(props.selectedCells, props.defaultSelectedCells ?? EMPTY_REFS, props.onSelectedCellsChange, 'selectedCells');
  const [hiddenList, setHidden] = useControllableState(props.hiddenItems, props.defaultHiddenItems ?? EMPTY_NUMS, props.onHiddenItemsChange, 'hiddenItems');
  const hidden = new Set(hiddenList);
  const { data, xField, yField, valueField, sizeField, xAxis, yAxis, colorScale, getCellStyle } = props;
  // Matrix and colors are O(cells): recomputed only when their inputs change, never on hover or focus.
  const m = useMemo(() => buildMatrix({ data, xField, yField, valueField, sizeField, xAxis, yAxis }), [data, xField, yField, valueField, sizeField, xAxis, yAxis]);
  const colors = useMemo(() => {
    const base = cellColors(m, { data, colorScale }, new Set(hiddenList));
    if (!getCellStyle) return base;
    const list = base.colors.slice();
    for (let i = 0; i < list.length; i++) {
      const c = getCellStyle(cellOf(m, base, i))?.color;
      if (c) list[i] = c;
    }
    return { ...base, colors: list };
  }, [m, data, colorScale, hiddenList, getCellStyle]);
  const legendOpts = typeof props.legend === 'object' ? props.legend : {};
  const legendOn = props.legend !== false && m.values.length > 0;
  const valueFmt = numberFormatter(locale, 1, { maximumFractionDigits: 2 });
  const legendFmt = legendOpts.format ?? valueFmt;
  const stepItems: VizLegendItem[] =
    colors.kind === 'steps'
      ? colors.stops.map((s, i) => {
          const next = colors.stops[i + 1];
          return { id: String(i), label: s.label ?? (next ? `${legendFmt(s.value)} – ${legendFmt(next.value)}` : `≥ ${legendFmt(s.value)}`), color: s.color, shape: 'rectangle', hidden: hidden.has(i) };
        })
      : [];
  const layout = heatLayout(m, props, size, legendOn && colors.kind === 'steps' ? stepItems : null, legendOn && colors.kind === 'gradient', locale);
  const cellsOpt = props.cells ?? {};
  const cellFmt = typeof cellsOpt.format === 'function' ? cellsOpt.format : numberFormatter(locale, 1, cellsOpt.format ?? { maximumFractionDigits: 2 });
  const total = m.columns * m.rows;
  const renderer = props.renderer ?? 'auto';
  const canvas = renderer === 'canvas' || (renderer === 'auto' && total >= HEAT_MAP_CANVAS_THRESHOLD);
  const labelOf = (cell: HeatMapCell) => (props.formatCell ? props.formatCell(cell) : Number.isFinite(cell.value) ? cellFmt(cell.value) : '');
  const xTitle = props.xAxis?.title ?? text.column;
  const yTitle = props.yAxis?.title ?? text.row;
  const describeCell = (cell: HeatMapCell) => `${layout.yLabels[cell.y]}, ${layout.xLabels[cell.x]}: ${Number.isFinite(cell.value) ? labelOf(cell) || valueFmt(cell.value) : text.noValue}`;
  const [lo, hi] = colors.extent;
  const summary =
    props.description ??
    (total === 0 ? 'Heat map. No data.' : `Heat map, ${m.rows} rows by ${m.columns} columns, values from ${valueFmt(lo)} to ${valueFmt(hi)}.`);
  const table = tableModel(props.title ?? text.heatMap, [yTitle, xTitle, text.value], total, (r, c) => {
    const cell = cellOf(m, colors, r);
    return c === 0 ? (layout.yLabels[cell.y] as string) : c === 1 ? (layout.xLabels[cell.x] as string) : Number.isFinite(cell.value) ? labelOf(cell) || valueFmt(cell.value) : text.noValue;
  });
  useVizInstance(props.ref, frame, { name: 'heat-map', csv: () => ({ columns: table.columns, rows: table.rows }) });
  const selection = props.selection;
  const multiple = typeof selection === 'object' ? selection.multiple === true : false;

  const activate = (i: number, source: VizChangeSource) => {
    if (i < 0 || i >= total) return;
    const cell = cellOf(m, colors, i);
    const ev = changeEvent(source, source === 'keyboard' ? 'keyboard' : 'click');
    if (selection) setSelected(toggleIn(selected, { x: cell.x, y: cell.y }, sameCell, multiple), ev);
    props.onCellClick?.(cell, ev);
  };
  const hoverAt = (i: number, x: number, y: number) => {
    if (store.get().hover === i) return;
    store.set({ hover: i, tip: i >= 0 ? { x, y } : null });
    props.onCellHover?.(i >= 0 ? cellOf(m, colors, i) : null);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    hoverAt(cellAt(layout, m, p.x, p.y), p.x, p.y);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    activate(cellAt(layout, m, p.x, p.y), pointerSource((event.nativeEvent as globalThis.PointerEvent).pointerType));
  };
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    const i = cellAt(layout, m, p.x, p.y);
    if (i >= 0) props.onCellDoubleClick?.(cellOf(m, colors, i));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!total) return;
    const cur = store.get().focus;
    const key = event.key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (cur >= 0) activate(cur, 'keyboard');
      return;
    }
    if (key === 'Escape') {
      if (store.get().tip) {
        event.preventDefault();
        store.set({ tip: null });
      }
      return;
    }
    // Arrows follow the drawing: a reversed axis flips its arrows. The first arrow focuses the first cell.
    const step = cur < 0 ? 0 : 1;
    const dx = props.xAxis?.reversed ? -step : step;
    const dy = props.yAxis?.reversed ? -step : step;
    let nx = cur < 0 ? 0 : cur % m.columns;
    let ny = cur < 0 ? 0 : Math.floor(cur / m.columns);
    if (key === 'ArrowRight') nx += dx;
    else if (key === 'ArrowLeft') nx -= dx;
    else if (key === 'ArrowDown') ny += dy;
    else if (key === 'ArrowUp') ny -= dy;
    else if (key === 'Home' || key === 'End') {
      nx = key === 'End' ? m.columns - 1 : 0;
      if (event.ctrlKey) ny = key === 'End' ? m.rows - 1 : 0;
    } else if (key === 'PageUp') ny = 0;
    else if (key === 'PageDown') ny = m.rows - 1;
    else return;
    event.preventDefault();
    nx = Math.max(0, Math.min(m.columns - 1, nx));
    ny = Math.max(0, Math.min(m.rows - 1, ny));
    const i = ny * m.columns + nx;
    store.set({ focus: i, hover: -1, tip: { x: layout.xs.map(nx), y: layout.ys.map(ny) } });
  };

  return (
    <VizFigure
      family="salmon-heat-map"
      className={props.className}
      style={props.style}
      rootRef={frame.rootRef}
      surfaceRef={frame.surfaceRef}
      surfaceStyle={surfaceStyle(props.width, props.height)}
      idBase={idBase}
      title={props.title}
      subtitle={props.subtitle}
      summary={summary}
      table={table}
      showTable={props.showDataTable}
      tableSummary={(n) => `${n} more cells not shown`}
      announcement={<FocusAnnouncement frame={frame} describe={(i) => (i < total ? describeCell(cellOf(m, colors, i)) : '')} />}
      extra={{ id: props.id, 'data-renderer': canvas ? 'canvas' : 'svg' }}
    >
      <svg viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} aria-hidden="true" focusable="false">
        <FrameTitles frame={layout.frame} />
        {canvas ? null : <HeatCells m={m} colors={colors} layout={layout} props={props} labelOf={labelOf} />}
        <HeatAxes m={m} layout={layout} props={props} />
        {legendOn && colors.kind === 'gradient' && layout.gradient ? <GradientLegend id={`${idBase}-grad`} layout={layout} colors={colors} props={props} format={legendFmt} /> : null}
        {layout.frame.legend ? <LegendSvg layout={layout.frame.legend} items={stepItems} page={0} /> : null}
        <SelectionMarks selected={selected} layout={layout} />
        <HoverMark frame={frame} layout={layout} m={m} highlight={cellsOpt.highlight !== false} />
      </svg>
      {canvas ? <HeatCanvas m={m} colors={colors} layout={layout} size={size} props={props} /> : null}
      <div
        className="salmon-viz-plot"
        style={{ inset: 0 }}
        tabIndex={0}
        role="group"
        aria-roledescription={text.heatMap.toLowerCase()}
        aria-label={props.title ?? text.heatMap}
        onPointerMove={onPointerMove}
        onPointerLeave={() => hoverAt(-1, 0, 0)}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onBlur={() => store.set({ focus: -1, tip: null })}
      />
      {layout.frame.legend ? (
        <LegendButtons
          layout={layout.frame.legend}
          items={stepItems}
          width={size.width}
          height={size.height}
          page={0}
          label={legendOpts.title ?? text.legend}
          toggle={legendOpts.toggle !== false}
          onToggle={legendOpts.toggle === false ? undefined : (id, event) => setHidden(toggleIn(hiddenList, Number(id)), changeEvent((event as MouseEvent).detail === 0 ? 'keyboard' : 'pointer', 'legend'))}
        />
      ) : null}
      {props.tooltip !== false ? <HeatTooltip frame={frame} m={m} colors={colors} layout={layout} props={props} describe={labelOf} idBase={idBase} noValue={text.noValue} /> : null}
    </VizFigure>
  );
}


interface PartProps {
  readonly m: HeatMatrix;
  readonly layout: HeatLayout;
  readonly props: HeatMapProps;
}

function HeatCells({ m, colors, layout, props, labelOf }: PartProps & { readonly colors: HeatColors; readonly labelOf: (c: HeatMapCell) => string }): ReactNode {
  const cellsOpt = props.cells ?? {};
  const shape = cellsOpt.shape ?? 'rect';
  const bubble = cellsOpt.bubble ?? 'size';
  const bw = layout.xs.bandwidth;
  const bh = layout.ys.bandwidth;
  const lh = lineHeight('sm');
  let sMax = 0;
  if (shape === 'bubble') {
    const src = m.sizes ?? m.values;
    for (let i = 0; i < src.length; i++) {
      const v = Math.abs(src[i] as number);
      if (v === v && v > sMax) sMax = v;
    }
  }
  const [lo, hi] = colors.extent;
  const out: ReactNode[] = [];
  const labels: ReactNode[] = [];
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.columns; x++) {
      const i = y * m.columns + x;
      const v = m.values[i] as number;
      const color = colors.colors[i] as string;
      const x0 = layout.xs.start(x);
      const y0 = layout.ys.start(y);
      const empty = v !== v;
      const hiddenStep = colors.steps && !empty && color === EMPTY_COLOR;
      if (shape === 'rect' || empty) {
        out.push(<rect key={i} className="salmon-heat-map-cell" x={n2(x0)} y={n2(y0)} width={n2(bw)} height={n2(bh)} style={{ fill: color }} data-empty={empty ? '' : undefined} data-hidden={hiddenStep ? '' : undefined} />);
      } else {
        const cx = x0 + bw / 2;
        const cy = y0 + bh / 2;
        const R = Math.min(bw, bh) / 2 - 1;
        const sv = m.sizes ? (m.sizes[i] as number) : v;
        const sizeR = sMax > 0 && sv === sv ? R * Math.sqrt(Math.abs(sv) / sMax) : R;
        const fill = bubble === 'size' ? 'var(--salmon-chart-1)' : color;
        if (bubble === 'sector') {
          const t = hi > lo ? (v - lo) / (hi - lo) : 1;
          out.push(<path key={i} className="salmon-heat-map-cell" d={arcPath(cx, cy, 0, R, 0, Math.max(0.0001, t) * Math.PI * 2)} style={{ fill }} />);
        } else out.push(<circle key={i} className="salmon-heat-map-cell" cx={n2(cx)} cy={n2(cy)} r={n2(Math.max(0.5, bubble === 'color' ? R : sizeR))} style={{ fill }} />);
      }
      if (cellsOpt.labels && !empty && !hiddenStep) {
        const text = labelOf({ x, y, xKey: m.xKeys[x] as string, yKey: m.yKeys[y] as string, value: v, size: m.sizes ? (m.sizes[i] as number) : null, color });
        if (text && textWidth(text) <= bw - 2 && lh <= bh) {
          labels.push(
            <text key={`l${i}`} className="salmon-heat-map-label" x={n2(x0 + bw / 2)} y={n2(y0 + bh / 2)} textAnchor="middle" dominantBaseline="central">
              {text}
            </text>,
          );
        }
      }
    }
  }
  return (
    <g className="salmon-viz-marks salmon-heat-map-cells">
      {out}
      {labels}
    </g>
  );
}

function HeatAxes({ m, layout, props }: PartProps): ReactNode {
  const { plot, xs, ys, xPlan } = layout;
  const lh = lineHeight('sm');
  const xInterval = Math.max(1, props.xAxis?.interval ?? 1);
  const yInterval = Math.max(1, props.yAxis?.interval ?? 1);
  const top = layout.xSide === 'top';
  const end = layout.ySide === 'right';
  const xy = top ? plot.y - 6 : plot.y + plot.height + 6 + lh * 0.8;
  const xl: ReactNode[] = [];
  for (let i = 0; i < m.columns; i++) {
    if (i % xInterval || xPlan.hidden[i / xInterval]) continue;
    const cx = xs.map(i);
    const lines = xPlan.lines[i / xInterval] ?? [];
    if (xPlan.angle) {
      const ty = top ? plot.y - 6 : plot.y + plot.height + 6;
      xl.push(
        <text key={i} x={n2(cx)} y={n2(ty)} textAnchor="end" dominantBaseline="central" transform={`rotate(${xPlan.angle} ${n2(cx)} ${n2(ty)})`}>
          {lines[0]}
        </text>,
      );
    } else
      xl.push(
        <text key={i} x={n2(cx)} y={n2(xy)} textAnchor="middle">
          {lines.map((l, k) => (
            <tspan key={k} x={n2(cx)} dy={k ? lh : 0}>
              {l}
            </tspan>
          ))}
        </text>,
      );
  }
  const yl: ReactNode[] = [];
  for (let j = 0; j < m.rows; j++) {
    if (j % yInterval) continue;
    yl.push(
      <text key={j} x={n2(end ? plot.x + plot.width + 6 : plot.x - 6)} y={n2(ys.map(j))} textAnchor={end ? 'start' : 'end'} dominantBaseline="central">
        {layout.yLabels[j]}
      </text>,
    );
  }
  const xThick = xPlan.angle ? rotatedBox(Math.max(0, ...layout.xLabels.map((l) => textWidth(l))), lh, xPlan.angle).height : xPlan.thickness;
  const groupsX = (props.xAxis?.labelGroups ?? []).map((g, k) => {
    const a = Math.min(xs.start(g.from), xs.start(g.to));
    const b = Math.max(xs.start(g.from), xs.start(g.to)) + xs.bandwidth;
    const gy = top ? plot.y - xThick - 10 : plot.y + plot.height + xThick + 10;
    return (
      <g key={`gx${k}`} className="salmon-heat-map-label-group">
        <path className="salmon-viz-tick" d={`M${n2(a + 1)},${n2(gy)}H${n2(b - 1)}`} />
        <text x={n2((a + b) / 2)} y={n2(top ? gy - 4 : gy + lh * 0.9)} textAnchor="middle">
          {g.text}
        </text>
      </g>
    );
  });
  const yw = Math.max(0, ...layout.yLabels.map((l) => textWidth(l)));
  const groupsY = (props.yAxis?.labelGroups ?? []).map((g, k) => {
    const a = Math.min(ys.start(g.from), ys.start(g.to));
    const b = Math.max(ys.start(g.from), ys.start(g.to)) + ys.bandwidth;
    const gx = end ? plot.x + plot.width + yw + 12 : plot.x - yw - 12;
    return (
      <g key={`gy${k}`} className="salmon-heat-map-label-group">
        <path className="salmon-viz-tick" d={`M${n2(gx)},${n2(a + 1)}V${n2(b - 1)}`} />
        <text x={n2(end ? gx + 4 : gx - 4)} y={n2((a + b) / 2)} textAnchor={end ? 'start' : 'end'} dominantBaseline="central">
          {g.text}
        </text>
      </g>
    );
  });
  return (
    <g className="salmon-heat-map-axes">
      <g className="salmon-heat-map-axis" data-axis="x">
        {xl}
        {groupsX}
        {props.xAxis?.title ? (
          <text className="salmon-viz-axis-title" x={n2(plot.x + plot.width / 2)} y={n2(top ? plot.y - xThick - (groupsX.length ? layout.groupRow : 0) - 12 : plot.y + plot.height + xThick + (groupsX.length ? layout.groupRow : 0) + lh + 8)} textAnchor="middle">
            {props.xAxis.title}
          </text>
        ) : null}
      </g>
      <g className="salmon-heat-map-axis" data-axis="y">
        {yl}
        {groupsY}
        {props.yAxis?.title ? (
          <text className="salmon-viz-axis-title" x={0} y={0} textAnchor="middle" transform={`translate(${n2(end ? plot.x + plot.width + yw + 22 + (groupsY.length ? layout.groupRow : 0) : plot.x - yw - 14 - (groupsY.length ? layout.groupRow : 0))} ${n2(plot.y + plot.height / 2)}) rotate(-90)`}>
            {props.yAxis.title}
          </text>
        ) : null}
      </g>
    </g>
  );
}

function GradientLegend({ id, layout, colors, props, format }: { readonly id: string; readonly layout: HeatLayout; readonly colors: HeatColors; readonly props: HeatMapProps; readonly format: (v: number) => string }): ReactNode {
  const g = layout.gradient;
  if (!g) return null;
  const vertical = g.height > g.width;
  const stops = colors.stops;
  const lo = (stops[0]?.value ?? 0) as number;
  const hi = (stops[stops.length - 1]?.value ?? 1) as number;
  const span = hi - lo || 1;
  const mode = (typeof props.legend === 'object' ? props.legend.labels : undefined) ?? 'edge';
  const shown = mode === 'none' ? [] : mode === 'all' ? stops : [stops[0], stops[stops.length - 1]].filter((s) => s !== undefined);
  const lh = lineHeight('sm');
  return (
    <g className="salmon-heat-map-legend" data-kind="gradient">
      <defs>
        <linearGradient id={id} x1="0" y1={vertical ? '1' : '0'} x2={vertical ? '0' : '1'} y2="0">
          {stops.map((s, i) => (
            <stop key={i} offset={n2((s.value - lo) / span)} style={{ stopColor: s.color }} />
          ))}
        </linearGradient>
      </defs>
      <rect x={n2(g.x)} y={n2(g.y)} width={n2(g.width)} height={n2(g.height)} fill={`url(#${id})`} rx={2} />
      {shown.map((s, i) => {
        const t = ((s as { value: number }).value - lo) / span;
        return vertical ? (
          <text key={i} x={n2(g.x + g.width + 6)} y={n2(g.y + g.height - t * g.height)} dominantBaseline="central">
            {s?.label ?? format((s as { value: number }).value)}
          </text>
        ) : (
          <text key={i} x={n2(g.x + t * g.width)} y={n2(g.y + g.height + lh)} textAnchor={t <= 0 ? 'start' : t >= 1 ? 'end' : 'middle'}>
            {s?.label ?? format((s as { value: number }).value)}
          </text>
        );
      })}
    </g>
  );
}

function SelectionMarks({ selected, layout }: { readonly selected: readonly HeatMapCellRef[]; readonly layout: HeatLayout }): ReactNode {
  if (!selected.length) return null;
  return (
    <g className="salmon-heat-map-selection">
      {selected.map((c) => (
        <rect key={`${c.x}-${c.y}`} className="salmon-heat-map-selected" x={n2(layout.xs.start(c.x) + 1)} y={n2(layout.ys.start(c.y) + 1)} width={n2(Math.max(0, layout.xs.bandwidth - 2))} height={n2(Math.max(0, layout.ys.bandwidth - 2))} data-x={c.x} data-y={c.y} />
      ))}
    </g>
  );
}

/** Hover and focus outline: the only part that re-renders on a target change. */
function HoverMark({ frame, layout, m, highlight }: { readonly frame: Frame; readonly layout: HeatLayout; readonly m: HeatMatrix; readonly highlight: boolean }): ReactNode {
  const hover = useVizSelector(frame.store, (s) => s.hover);
  const focus = useVizSelector(frame.store, (s) => s.focus);
  const marks: ReactNode[] = [];
  const box = (i: number, cls: string) => {
    const x = i % m.columns;
    const y = Math.floor(i / m.columns);
    return <rect key={cls} className={cls} x={n2(layout.xs.start(x))} y={n2(layout.ys.start(y))} width={n2(layout.xs.bandwidth)} height={n2(layout.ys.bandwidth)} />;
  };
  if (highlight && hover >= 0) marks.push(box(hover, 'salmon-heat-map-hover'));
  if (focus >= 0) marks.push(box(focus, 'salmon-viz-focus-mark'));
  return marks.length ? <g>{marks}</g> : null;
}

function HeatTooltip({ frame, m, colors, layout, props, describe, idBase, noValue }: PartProps & { readonly frame: Frame; readonly colors: HeatColors; readonly describe: (c: HeatMapCell) => string; readonly idBase: string; readonly noValue: string }): ReactNode {
  const tip = useVizSelector(frame.store, (s) => s.tip);
  const target = useVizSelector(frame.store, (s) => (s.hover >= 0 ? s.hover : s.focus));
  if (!tip || target < 0 || target >= m.values.length) return null;
  const cell = cellOf(m, colors, target);
  const opts = typeof props.tooltip === 'object' ? props.tooltip : {};
  const value = Number.isFinite(cell.value) ? describe(cell) || String(cell.value) : noValue;
  return (
    <VizTooltip x={tip.x} y={tip.y} width={frame.size.width} height={frame.size.height} id={`${idBase}-tip`}>
      {opts.render ? (
        opts.render(cell)
      ) : (
        <>
          <div className="salmon-viz-tooltip-header">
            {layout.yLabels[cell.y]} · {layout.xLabels[cell.x]}
          </div>
          <div className="salmon-viz-tooltip-row">
            <span className="salmon-viz-tooltip-swatch" style={{ background: cell.color }} />
            <span className="salmon-viz-tooltip-value">{value}</span>
          </div>
        </>
      )}
    </VizTooltip>
  );
}

/** Canvas cells: an empty sized canvas on the server, drawn after hydration by the lazy chunk. */
function HeatCanvas({ m, colors, layout, size, props }: PartProps & { readonly colors: HeatColors; readonly size: { width: number; height: number } }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  const { plot } = layout;
  const rx = Boolean(props.xAxis?.reversed);
  const ry = Boolean(props.yAxis?.reversed);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const draw = () =>
      void import('./canvas.js').then((mod) => {
        if (!cancelled) mod.drawHeatCells(el, { columns: m.columns, rows: m.rows, colors: colors.colors, reversedX: rx, reversedY: ry, width: plot.width, height: plot.height });
      });
    draw();
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', draw);
    return () => {
      cancelled = true;
      media?.removeEventListener?.('change', draw);
    };
  }, [m, colors, rx, ry, plot.width, plot.height]);
  return <canvas ref={ref} className="salmon-viz-canvas salmon-heat-map-canvas" aria-hidden="true" style={{ left: pct(plot.x, size.width), top: pct(plot.y, size.height), width: pct(plot.width, size.width), height: pct(plot.height, size.height) }} />;
}
