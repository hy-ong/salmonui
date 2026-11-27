// SankeyChart: flows between nodes laid out by `viz:sankey`
// (columns, relaxation, link bands), horizontal or vertical, node and link
// data colors with source / target / gradient link colors, labels, a node
// legend, adjacent highlight, store-driven tooltips for nodes and links,
// click and hover callbacks, the node / link keyboard model with live
// announcements and a source / target / value table.

import { useId, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { layoutFrame, lineHeight, n2, numberFormatter, rectAt, sankeyLayout, sankeyLinkAt, seriesColor, tableModel, textWidth, truncateText, type SankeyLayout } from '#viz';
import { VizFigure } from '../internal/viz/figure.js';
import { FocusAnnouncement, FrameTitles, pointerSource, surfaceStyle, toDrawing, useFrame, useVizInstance, type Frame } from '../internal/viz/frame.js';
import { LegendButtons, LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import { useVizSelector } from '../internal/viz/store.js';
import { VizTooltip } from '../internal/viz/tooltip.js';
import type { SankeyChartProps, SankeyLinkInfo, SankeyNodeInfo } from './types.js';

interface Model {
  readonly layout: SankeyLayout;
  readonly nodes: readonly SankeyNodeInfo[];
  readonly links: readonly SankeyLinkInfo[];
  readonly linkColors: readonly string[];
  readonly linkOpacity: readonly (number | undefined)[];
  /** Plot offset of the layout box. */
  readonly ox: number;
  readonly oy: number;
}

export function SankeyChart(props: SankeyChartProps): ReactNode {
  const locale = useLocale(props.locale);
  const text = { sankeyChart: 'Sankey chart', legend: 'Legend', source: 'Source', target: 'Target', value: 'Value', ...useLocaleText('sankeyChart', props.text) };
  const idBase = useId();
  const frame = useFrame(props);
  const { store, size } = frame;
  const vertical = props.orientation === 'vertical';
  const curvature = props.curvature ?? 0.5;
  const format = typeof props.format === 'function' ? props.format : numberFormatter(locale, 1, props.format ?? { maximumFractionDigits: 2 });
  const legendOpt = props.legend;
  const legendCfg = typeof legendOpt === 'object' ? legendOpt : {};
  const nodeColor = (i: number) => props.nodes[i]?.color ?? seriesColor(i);
  const legendItems: VizLegendItem[] = legendOpt ? props.nodes.map((n, i) => ({ id: n.id, label: n.label ?? n.id, color: nodeColor(i), shape: 'rectangle', hidden: false })) : [];
  const frameLayout = layoutFrame({ width: size.width, height: size.height, title: props.title, subtitle: props.subtitle, legend: legendItems.length ? { position: legendCfg.position ?? 'bottom', items: legendItems, title: legendCfg.title } : null });
  const plot = frameLayout.plot;
  const labelsOpt = props.labels ?? true;
  const outside = labelsOpt !== false && (typeof labelsOpt !== 'object' || labelsOpt.position !== 'inside');
  // Outside labels of the first and last column need room along the flow (horizontal only).
  // With `formatLabel` the drawn text (often the label plus its value) sets the room, measured
  // with each node's flow total, which the layout computes the same way.
  const labelText = (n: (typeof props.nodes)[number], i: number): string => {
    const label = n.label ?? n.id;
    if (!props.formatLabel) return label;
    let into = 0;
    let out = 0;
    for (const l of props.links) {
      if (l.target === n.id) into += l.value;
      if (l.source === n.id) out += l.value;
    }
    return props.formatLabel({ index: i, id: n.id, label, value: Math.max(into, out), column: 0, color: nodeColor(i) });
  };
  const labelRoom = outside && !vertical ? Math.min(120, Math.max(0, ...props.nodes.map((n, i) => textWidth(labelText(n, i))))) + 8 : 0;
  const box = { x: plot.x, y: plot.y, width: Math.max(1, plot.width - labelRoom), height: plot.height };
  const layout = sankeyLayout(props.nodes, props.links, { width: box.width, height: box.height, orientation: props.orientation, nodeWidth: props.nodeWidth, nodePadding: props.nodePadding, curvature });
  const nodes: SankeyNodeInfo[] = layout.nodes.map((n) => {
    const base: SankeyNodeInfo = { index: n.index, id: n.id, label: props.nodes[n.index]?.label ?? n.id, value: n.value, column: n.column, color: nodeColor(n.index) };
    const c = props.getNodeStyle?.(base)?.color;
    return c ? { ...base, color: c } : base;
  });
  const links: SankeyLinkInfo[] = layout.links.map((l) => ({ index: l.index, source: nodes[l.source] as SankeyNodeInfo, target: nodes[l.target] as SankeyNodeInfo, value: l.value }));
  const linkStyle = links.map((l) => props.getLinkStyle?.(l));
  const mode = props.linkColor ?? 'source';
  const model: Model = {
    layout,
    nodes,
    links,
    linkColors: links.map((l, k) => linkStyle[k]?.color ?? (mode === 'target' ? l.target.color : mode === 'gradient' ? `url(#${idBase}-g${k})` : l.source.color)),
    linkOpacity: linkStyle.map((s) => s?.opacity),
    ox: box.x,
    oy: box.y,
  };
  const N = nodes.length;
  const originRef = useRef(-1);

  // Targets: 0..N-1 nodes, N.. links.
  const hit = (x: number, y: number) => {
    const lx = x - model.ox;
    const ly = y - model.oy;
    const n = rectAt(
      layout.nodes.map((b) => ({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 })),
      lx,
      ly,
      1,
    );
    if (n >= 0) return n;
    const l = sankeyLinkAt(layout.links, lx, ly, vertical, curvature);
    return l >= 0 ? N + l : -1;
  };
  const anchor = (t: number): { x: number; y: number } => {
    if (t < N) {
      const b = layout.nodes[t];
      return b ? { x: model.ox + (b.x0 + b.x1) / 2, y: model.oy + b.y0 } : { x: 0, y: 0 };
    }
    const l = layout.links[t - N];
    return l ? { x: model.ox + (l.from.x + l.to.x) / 2, y: model.oy + (l.from.y + l.to.y) / 2 } : { x: 0, y: 0 };
  };
  const emitHover = (t: number) => {
    if (t >= 0 && t < N) {
      props.onNodeHover?.(nodes[t] ?? null);
      props.onLinkHover?.(null);
    } else if (t >= N) {
      props.onLinkHover?.(links[t - N] ?? null);
      props.onNodeHover?.(null);
    } else {
      props.onNodeHover?.(null);
      props.onLinkHover?.(null);
    }
  };
  const hoverAt = (t: number, x: number, y: number) => {
    if (store.get().hover === t) return;
    store.set({ hover: t, tip: t >= 0 ? { x, y } : null });
    emitHover(t);
  };
  const activate = (t: number, source: 'pointer' | 'keyboard' | 'touch') => {
    if (t < 0) return;
    if (t < N) props.onNodeClick?.(nodes[t] as SankeyNodeInfo, { source });
    else props.onLinkClick?.(links[t - N] as SankeyLinkInfo, { source });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    hoverAt(hit(p.x, p.y), p.x, p.y);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    activate(hit(p.x, p.y), pointerSource((event.nativeEvent as globalThis.PointerEvent).pointerType) as 'pointer' | 'touch');
  };
  const nodeLinks = (n: number) => {
    const b = layout.nodes[n];
    return b ? [...b.sourceLinks, ...b.targetLinks] : [];
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!N) return;
    const cur = store.get().focus;
    let next = cur;
    const forward = vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    const along = vertical ? ['ArrowRight', 'ArrowLeft'] : ['ArrowDown', 'ArrowUp'];
    if (cur >= N) {
      // Inside a node's links: cycle them; Escape returns to the node.
      const origin = originRef.current;
      const list = nodeLinks(origin);
      const pos = list.indexOf(cur - N);
      if (event.key === 'Escape') {
        next = origin;
      } else if (along.includes(event.key) || forward.includes(event.key)) {
        const step = event.key === along[0] || event.key === forward[0] ? 1 : -1;
        next = N + (list[(pos + step + list.length) % list.length] as number);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(cur, 'keyboard');
        return;
      } else return;
    } else if (cur < 0) {
      if (![...forward, ...along, 'Home', 'End'].includes(event.key)) return;
      next = event.key === 'End' ? N - 1 : 0;
    } else {
      const b = layout.nodes[cur];
      if (!b) return;
      const sameCol = layout.nodes.filter((n) => n.column === b.column).sort((a, c) => (vertical ? a.x0 - c.x0 : a.y0 - c.y0));
      const k = sameCol.indexOf(b);
      if (event.key === along[0]) next = (sameCol[Math.min(sameCol.length - 1, k + 1)] ?? b).index;
      else if (event.key === along[1]) next = (sameCol[Math.max(0, k - 1)] ?? b).index;
      else if (event.key === forward[0] || event.key === forward[1]) {
        const col = b.column + (event.key === forward[0] ? 1 : -1);
        const mid = vertical ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2;
        let best = -1;
        let dist = Number.POSITIVE_INFINITY;
        for (const n of layout.nodes) {
          if (n.column !== col) continue;
          const d = Math.abs((vertical ? (n.x0 + n.x1) / 2 : (n.y0 + n.y1) / 2) - mid);
          if (d < dist) {
            dist = d;
            best = n.index;
          }
        }
        if (best < 0) return;
        next = best;
      } else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = N - 1;
      else if (event.key === 'Enter') {
        event.preventDefault();
        const list = nodeLinks(cur);
        activate(cur, 'keyboard');
        if (list.length) {
          originRef.current = cur;
          next = N + (list[0] as number);
        } else return;
      } else if (event.key === ' ') {
        event.preventDefault();
        activate(cur, 'keyboard');
        return;
      } else if (event.key === 'Escape') {
        if (store.get().tip) store.set({ tip: null });
        return;
      } else return;
    }
    event.preventDefault();
    store.set({ focus: next, hover: -1, tip: anchor(next) });
    emitHover(next);
  };

  const describe = (t: number): string => {
    if (t < 0) return '';
    if (t < N) {
      const n = nodes[t] as SankeyNodeInfo;
      const b = layout.nodes[t];
      return `${n.label}: ${format(n.value)}, ${b?.targetLinks.length ?? 0} incoming, ${b?.sourceLinks.length ?? 0} outgoing`;
    }
    const l = links[t - N] as SankeyLinkInfo;
    return `${l.source.label} to ${l.target.label}: ${format(l.value)}`;
  };
  const summary =
    props.description ??
    (N === 0 ? 'Sankey chart. No data.' : `Sankey chart, ${N} nodes, ${links.length} flows, ${layout.columns} columns. ` + links.slice(0, 8).map((l) => `${l.source.label} to ${l.target.label}: ${format(l.value)}`).join('; ') + '.');
  const table = tableModel(props.title ?? text.sankeyChart, [text.source, text.target, text.value], links.length, (r, c) => {
    const l = links[r] as SankeyLinkInfo;
    return c === 0 ? l.source.label : c === 1 ? l.target.label : format(l.value);
  });
  useVizInstance(props.ref, frame, { name: 'sankey-chart', csv: () => ({ columns: table.columns, rows: table.rows }) });
  const tooltipCfg = typeof props.tooltip === 'object' ? props.tooltip : {};

  return (
    <VizFigure
      family="salmon-sankey-chart"
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
      announcement={<FocusAnnouncement frame={frame} describe={describe} />}
      extra={props.id ? { id: props.id, 'data-orientation': vertical ? 'vertical' : 'horizontal' } : { 'data-orientation': vertical ? 'vertical' : 'horizontal' }}
    >
      <svg viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} aria-hidden="true" focusable="false">
        <FrameTitles frame={frameLayout} />
        {mode === 'gradient' ? (
          <defs>
            {layout.links.map((l, k) => (
              <linearGradient key={k} id={`${idBase}-g${k}`} gradientUnits="userSpaceOnUse" x1={n2(l.from.x)} y1={n2(l.from.y)} x2={n2(l.to.x)} y2={n2(l.to.y)}>
                <stop offset="0" style={{ stopColor: links[k]?.source.color }} />
                <stop offset="1" style={{ stopColor: links[k]?.target.color }} />
              </linearGradient>
            ))}
          </defs>
        ) : null}
        <SankeyMarks frame={frame} model={model} highlight={props.highlight !== false} labels={labelsOpt !== false} outside={outside} vertical={vertical} formatLabel={props.formatLabel} />
        {frameLayout.legend ? <LegendSvg layout={frameLayout.legend} items={legendItems} page={0} /> : null}
      </svg>
      <div
        className="salmon-viz-plot"
        style={{ inset: 0 }}
        tabIndex={0}
        role="group"
        aria-roledescription={text.sankeyChart.toLowerCase()}
        aria-label={props.title ?? text.sankeyChart}
        onPointerMove={onPointerMove}
        onPointerLeave={() => hoverAt(-1, 0, 0)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onBlur={() => store.set({ focus: -1, tip: null })}
      />
      {frameLayout.legend ? (
        <LegendButtons
          layout={frameLayout.legend}
          items={legendItems}
          width={size.width}
          height={size.height}
          page={0}
          label={legendCfg.title ?? text.legend}
          toggle={false}
          onHighlight={(id) => store.set({ legendHover: id === null ? -1 : props.nodes.findIndex((n) => n.id === id) })}
        />
      ) : null}
      {props.tooltip !== false ? (
        <SankeyTooltip frame={frame} idBase={idBase} model={model} format={format} renderNode={tooltipCfg.renderNode} renderLink={tooltipCfg.renderLink} />
      ) : null}
    </VizFigure>
  );
}


function SankeyMarks({ frame, model, highlight, labels, outside, vertical, formatLabel }: { readonly frame: Frame; readonly model: Model; readonly highlight: boolean; readonly labels: boolean; readonly outside: boolean; readonly vertical: boolean; readonly formatLabel: ((n: SankeyNodeInfo) => string) | undefined }): ReactNode {
  const hover = useVizSelector(frame.store, (s) => s.hover);
  const focus = useVizSelector(frame.store, (s) => s.focus);
  const legend = useVizSelector(frame.store, (s) => s.legendHover);
  const { layout, ox, oy } = model;
  const N = layout.nodes.length;
  const active = legend >= 0 ? legend : hover >= 0 ? hover : focus;
  // Adjacent set of the active node or link.
  let liveNodes: Set<number> | null = null;
  let liveLinks: Set<number> | null = null;
  if (highlight && active >= 0) {
    liveNodes = new Set();
    liveLinks = new Set();
    if (active < N) {
      liveNodes.add(active);
      const b = layout.nodes[active];
      for (const k of [...(b?.sourceLinks ?? []), ...(b?.targetLinks ?? [])]) {
        liveLinks.add(k);
        const l = layout.links[k];
        if (l) {
          liveNodes.add(l.source);
          liveNodes.add(l.target);
        }
      }
    } else {
      const l = layout.links[active - N];
      if (l) {
        liveLinks.add(active - N);
        liveNodes.add(l.source);
        liveNodes.add(l.target);
      }
    }
  }
  const lh = lineHeight('sm');
  const maxCol = Math.max(0, ...layout.nodes.map((n) => n.column));
  const focusMark = focus >= 0 ? (focus < N ? layout.nodes[focus] : null) : null;
  const focusLink = focus >= N ? layout.links[focus - N] : null;
  return (
    <g transform={`translate(${n2(ox)},${n2(oy)})`}>
      <g className="salmon-viz-marks salmon-sankey-chart-links">
        {layout.links.map((l, k) => (
          <path key={k} className="salmon-viz-mark salmon-sankey-chart-link" d={l.path} style={{ stroke: model.linkColors[k], strokeWidth: l.width, strokeOpacity: model.linkOpacity[k] }} data-source={model.nodes[l.source]?.id} data-target={model.nodes[l.target]?.id} data-dimmed={liveLinks && !liveLinks.has(k) ? '' : undefined} />
        ))}
      </g>
      <g className="salmon-viz-marks salmon-sankey-chart-nodes">
        {layout.nodes.map((b) => (
          <rect key={b.id} className="salmon-viz-mark salmon-sankey-chart-node" x={n2(b.x0)} y={n2(b.y0)} width={n2(b.x1 - b.x0)} height={n2(Math.max(1, b.y1 - b.y0))} style={{ fill: model.nodes[b.index]?.color }} data-id={b.id} data-dimmed={liveNodes && !liveNodes.has(b.index) ? '' : undefined} />
        ))}
      </g>
      {labels ? (
        <g className="salmon-sankey-chart-labels">
          {layout.nodes.map((b) => {
            const info = model.nodes[b.index] as SankeyNodeInfo;
            const text = truncateText(formatLabel ? formatLabel(info) : info.label, 120);
            if (vertical) {
              return (
                <text key={b.id} x={n2((b.x0 + b.x1) / 2)} y={n2(outside ? (b.column === maxCol ? b.y0 - 4 : b.y1 + lh * 0.8) : (b.y0 + b.y1) / 2)} textAnchor="middle" dominantBaseline={outside ? undefined : 'central'} className="salmon-sankey-chart-label">
                  {text}
                </text>
              );
            }
            // Outside labels sit after the node; the layout keeps room for the last column's labels.
            const x = outside ? b.x1 + 6 : (b.x0 + b.x1) / 2;
            return (
              <text key={b.id} x={n2(x)} y={n2((b.y0 + b.y1) / 2)} textAnchor={outside ? 'start' : 'middle'} dominantBaseline="central" className="salmon-sankey-chart-label">
                {text}
              </text>
            );
          })}
        </g>
      ) : null}
      {focusMark ? <rect className="salmon-viz-focus-mark" x={n2(focusMark.x0 - 2)} y={n2(focusMark.y0 - 2)} width={n2(focusMark.x1 - focusMark.x0 + 4)} height={n2(focusMark.y1 - focusMark.y0 + 4)} /> : null}
      {focusLink ? <path className="salmon-viz-focus-mark" d={focusLink.path} style={{ strokeWidth: 2 }} /> : null}
    </g>
  );
}

function SankeyTooltip({ frame, idBase, model, format, renderNode, renderLink }: { readonly frame: Frame; readonly idBase: string; readonly model: Model; readonly format: (v: number) => string; readonly renderNode: ((n: SankeyNodeInfo) => ReactNode) | undefined; readonly renderLink: ((l: SankeyLinkInfo) => ReactNode) | undefined }): ReactNode {
  const tip = useVizSelector(frame.store, (s) => s.tip);
  const target = useVizSelector(frame.store, (s) => (s.hover >= 0 ? s.hover : s.focus));
  if (!tip || target < 0) return null;
  const N = model.nodes.length;
  const node = target < N ? model.nodes[target] : undefined;
  const link = target >= N ? model.links[target - N] : undefined;
  if (!node && !link) return null;
  return (
    <VizTooltip x={tip.x} y={tip.y} width={frame.size.width} height={frame.size.height} id={`${idBase}-tip`}>
      {node ? (
        renderNode ? (
          renderNode(node)
        ) : (
          <div className="salmon-viz-tooltip-row">
            <span className="salmon-viz-tooltip-swatch" style={{ background: node.color }} />
            <span>{node.label}</span>
            <span className="salmon-viz-tooltip-value">{format(node.value)}</span>
          </div>
        )
      ) : link ? (
        renderLink ? (
          renderLink(link)
        ) : (
          <div className="salmon-viz-tooltip-row">
            <span>
              {link.source.label} → {link.target.label}
            </span>
            <span className="salmon-viz-tooltip-value">{format(link.value)}</span>
          </div>
        )
      ) : null}
    </VizTooltip>
  );
}
