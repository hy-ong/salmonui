// TreeMap: a weighted hierarchy from flat (grouped by `levels`)
// or hierarchical data, squarified or slice-and-dice tilings with four
// render directions, group headers, leaf labels with overflow strategies,
// data colors by group, field, range, value or opacity scales, drill-down
// with the `path` triad and breadcrumbs, selection, hover highlight, a
// store-driven tooltip, the APG Tree View keyboard model and a nested list
// as the accessible equivalent.

import { useId, useMemo, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { findNode, hierarchy, layoutFrame, lineHeight, n2, numberFormatter, pct as vizPct, r2, readField, rectAt, seriesColor, textWidth, toNumber, treemapLayout, truncateText, wrapText, type TreemapRect, type TreeNode } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { VizFigure } from '../internal/viz/figure.js';
import { changeEvent, FocusAnnouncement, FrameTitles, pointerSource, surfaceStyle, toDrawing, toggleIn, useFrame, useVizInstance, type Frame, type VizChangeSource } from '../internal/viz/frame.js';
import { LegendButtons, LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import { useVizSelector } from '../internal/viz/store.js';
import { VizTooltip } from '../internal/viz/tooltip.js';
import type { TreeMapColorScale, TreeMapHeaderOptions, TreeMapItem, TreeMapPath, TreeMapProps } from './types.js';

const ROOT: TreeMapPath = [];
const NO_PATHS: readonly TreeMapPath[] = [];
const samePath = (a: TreeMapPath, b: TreeMapPath) => a.length === b.length && a.every((k, i) => k === b[i]);
const BREADCRUMB = 28;
const PARENT_BAND = lineHeight('sm') + 8;

/** Color (range, value) or opacity (opacity) of a node on the scale; undefined keeps the group color. */
function scaleOf(scale: TreeMapColorScale, node: TreeNode<unknown>): { color?: string; opacity?: number } {
  const raw = scale.field && node.item ? readField(node.item, scale.field) : node.value;
  if (scale.kind === 'value') {
    const color = scale.stops.find((s) => String(s.value) === String(raw))?.color;
    return color ? { color } : {};
  }
  const v = typeof raw === 'number' ? raw : toNumber(raw);
  if (!Number.isFinite(v)) return {};
  if (scale.kind === 'range') {
    let color = scale.stops[0]?.color;
    for (const s of scale.stops) if (v >= Number(s.value)) color = s.color;
    return color ? { color } : {};
  }
  // Opacity (desaturation): the first stop's color from 30 % opacity at the first stop value to full at the last.
  const lo = Number(scale.stops[0]?.value ?? 0);
  const hi = Number(scale.stops[scale.stops.length - 1]?.value ?? 1);
  const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 1;
  const color = scale.stops[0]?.color;
  return { ...(color ? { color } : {}), opacity: r2(0.3 + 0.7 * t) };
}

export function TreeMap(props: TreeMapProps): ReactNode {
  const locale = useLocale(props.locale);
  const text = { treeMap: 'Tree map', path: 'Tree map path', all: 'All', legend: 'Legend', ...useLocaleText('treeMap', props.text) };
  const idBase = useId();
  const frame = useFrame(props);
  const { store, size } = frame;
  const [path, setPath] = useControllableState(props.path, props.defaultPath ?? ROOT, props.onPathChange, 'path');
  const [selected, setSelected] = useControllableState(props.selectedItems, props.defaultSelectedItems ?? NO_PATHS, props.onSelectedItemsChange, 'selectedItems');
  const { data, weightField, childrenField, levels, leaves } = props;
  const labelField = leaves?.labelField;
  const root = useMemo(() => {
    const groupBy = levels?.flatMap((l) => (l.groupBy === undefined ? [] : [typeof l.groupBy === 'function' ? l.groupBy : (d: unknown) => String(readField(d, l.groupBy as string) ?? '')]));
    return hierarchy<unknown>(data, {
      weight: (d) => (typeof d === 'number' ? d : toNumber(readField(d, weightField ?? 'value'))),
      key: (d, i) => (labelField ? String(readField(d, labelField) ?? i) : String(i + 1)),
      children: childrenField ? (d) => readField(d, childrenField) as readonly unknown[] | undefined : undefined,
      groupBy: groupBy && groupBy.length ? groupBy : undefined,
    });
  }, [data, weightField, childrenField, levels, labelField]);
  const current = findNode(root, path) ?? root;
  const currentPath = current === root ? ROOT : path;
  const valueFmt = typeof leaves?.format === 'function' ? leaves.format : numberFormatter(locale, 1, leaves?.format ?? { maximumFractionDigits: 2 });

  // Colors: top-level group slot, then field, scale and getItemStyle overrides.
  const colorCache = new Map<TreeNode<unknown>, string>();
  const topIndex = (n: TreeNode<unknown>) => root.children.findIndex((c) => c.key === n.path[0]);
  const toItem = (n: TreeNode<unknown>, color: string): TreeMapItem => ({ path: n.path, label: n.key, value: n.value, depth: n.depth, leaf: n.children.length === 0, datum: n.item, color });
  const colorOf = (n: TreeNode<unknown>): string => {
    let c = colorCache.get(n);
    if (c) return c;
    c = seriesColor(Math.max(0, topIndex(n)), props.palette);
    const own = props.colorField && n.item ? readField(n.item, props.colorField) : undefined;
    if (typeof own === 'string') c = own;
    if (props.colorScale) c = scaleOf(props.colorScale, n).color ?? c;
    const styled = props.getItemStyle?.(toItem(n, c))?.color;
    if (styled) c = styled;
    colorCache.set(n, c);
    return c;
  };

  const legendOpt = props.legend;
  const legendCfg = typeof legendOpt === 'object' ? legendOpt : {};
  const legendItems: VizLegendItem[] = legendOpt ? current.children.map((c) => ({ id: c.key, label: c.key, color: colorOf(c), shape: 'rectangle', hidden: false })) : [];
  const layout = layoutFrame({ width: size.width, height: size.height, title: props.title, subtitle: props.subtitle, legend: legendItems.length ? { position: legendCfg.position ?? 'bottom', items: legendItems, title: legendCfg.title } : null });
  const top = layout.plot.y + (props.breadcrumbs ? BREADCRUMB : 0);
  const parents = props.showParentLevels ? currentPath.length : 0;
  const plot = { x: layout.plot.x, y: top + parents * PARENT_BAND, width: layout.plot.width, height: Math.max(1, layout.plot.height - (top - layout.plot.y) - parents * PARENT_BAND) };
  const headerH = (depth: number): number => {
    const lvl = props.levels?.[current.depth + depth - 1];
    const h = lvl?.header ?? true;
    return h === false ? 0 : lineHeight('sm') + 6;
  };
  const rects = treemapLayout(current, {
    width: plot.width,
    height: plot.height,
    tiling: props.layout,
    direction: props.direction,
    leafGap: props.leaves?.gap,
    levels: Array.from({ length: 8 }, (_, d) => ({ gap: props.levels?.[current.depth + d]?.gap, header: headerH(d + 1) })),
  }).map((r) => ({ ...r, x: r.x + plot.x, y: r.y + plot.y }));

  const selection = props.selection;
  const selMode = typeof selection === 'object' ? (selection.mode ?? 'item') : 'item';
  const multiple = typeof selection === 'object' ? selection.multiple === true : false;
  const drill = props.drill ?? 'click';
  const isSel = (p: TreeMapPath) => selected.some((s) => samePath(s, p));
  // Keyboard targets: the children of the drilled node (APG tree siblings).
  const siblings = rects.flatMap((r, i) => (r.node.depth === current.depth + 1 ? [i] : []));

  const drillTo = (p: TreeMapPath, source: VizChangeSource, reason: 'drill' | 'breadcrumb' | 'keyboard') => {
    setPath(p, changeEvent(source, reason));
    store.set({ focus: -1, hover: -1, tip: null });
  };
  const activate = (i: number, source: VizChangeSource, viaKeyboard = false) => {
    const r = rects[i];
    if (!r) return;
    const ev = changeEvent(source, viaKeyboard ? 'keyboard' : 'click');
    const item = toItem(r.node, colorOf(r.node));
    props.onItemClick?.(item, ev);
    // Drill into the top-level group under the current node that holds the target.
    const groupPath = r.node.path.slice(0, current.depth + 1);
    const group = findNode(root, groupPath);
    if (drill === 'click' && group && group.children.length > 0 && !viaKeyboard) {
      drillTo(groupPath, source, 'drill');
      return;
    }
    if (selection) {
      const target = selMode === 'group' ? groupPath : r.node.path;
      setSelected(toggleIn(selected, target, samePath, multiple), ev);
    }
  };
  const hoverAt = (i: number, x: number, y: number) => {
    if (store.get().hover === i) return;
    store.set({ hover: i, tip: i >= 0 ? { x, y } : null });
    const r = rects[i];
    props.onItemHover?.(r ? toItem(r.node, colorOf(r.node)) : null);
  };
  // Leaves first so the innermost rectangle wins; headers belong to their group.
  const hit = (x: number, y: number) => rectAt(rects, x, y);
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    hoverAt(hit(p.x, p.y), p.x, p.y);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    const i = hit(p.x, p.y);
    if (i >= 0) activate(i, pointerSource((event.nativeEvent as globalThis.PointerEvent).pointerType));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cur = store.get().focus;
    const pos = siblings.indexOf(cur);
    let next = -1;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = siblings[pos < 0 ? 0 : Math.min(siblings.length - 1, pos + 1)] ?? -1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = siblings[pos < 0 ? 0 : Math.max(0, pos - 1)] ?? -1;
        break;
      case 'Home':
        next = siblings[0] ?? -1;
        break;
      case 'End':
        next = siblings[siblings.length - 1] ?? -1;
        break;
      case 'Enter': {
        event.preventDefault();
        const r = rects[cur];
        if (!r) return;
        if (drill === 'click' && r.node.children.length > 0) drillTo(r.node.path, 'keyboard', 'keyboard');
        else activate(cur, 'keyboard', true);
        return;
      }
      case ' ':
        event.preventDefault();
        if (cur >= 0) activate(cur, 'keyboard', true);
        return;
      case 'Backspace':
      case 'Escape':
        // Drill out; at the root Escape only closes the tooltip.
        event.preventDefault();
        if (currentPath.length) drillTo(currentPath.slice(0, -1), 'keyboard', 'keyboard');
        else store.set({ tip: null });
        return;
      default:
        return;
    }
    event.preventDefault();
    const r = rects[next];
    if (r) store.set({ focus: next, hover: -1, tip: { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 20) } });
  };

  const summary =
    props.description ??
    (current.children.length === 0
      ? 'Tree map. No data.'
      : `Tree map${currentPath.length ? ` of ${currentPath.join(' / ')}` : ''}, ${current.children.length} ${current.children.length === 1 ? 'item' : 'items'}, total ${valueFmt(current.value)}. ` +
        current.children
          .slice(0, 8)
          .map((c) => `${c.key}: ${valueFmt(c.value)}`)
          .join('; ') +
        '.');
  useVizInstance(props.ref, frame, {
    name: 'tree-map',
    csv: () => {
      const rows: string[][] = [];
      const walk = (n: TreeNode<unknown>) => {
        if (n !== current) rows.push([n.path.join(' / '), n.key, valueFmt(n.value)]);
        n.children.forEach(walk);
      };
      walk(current);
      return { columns: ['Path', 'Label', 'Value'], rows };
    },
  });
  const describeNode = (n: TreeNode<unknown>) => `${n.key}: ${valueFmt(n.value)}${n.children.length ? `, ${n.children.length} items` : ''}`;
  const pct = (v: number, t: number) => vizPct(v, t || 1);
  const crumbs = [props.rootLabel ?? text.all, ...currentPath];

  return (
    <VizFigure
      family="salmon-tree-map"
      className={props.className}
      style={props.style}
      rootRef={frame.rootRef}
      surfaceRef={frame.surfaceRef}
      surfaceStyle={surfaceStyle(props.width, props.height)}
      idBase={idBase}
      title={props.title}
      subtitle={props.subtitle}
      summary={summary}
      table={null}
      announcement={<FocusAnnouncement frame={frame} describe={(i) => (rects[i] ? describeNode(rects[i].node) : '')} />}
      extra={{ id: props.id, onClick: props.onClick, onDoubleClick: props.onDoubleClick, onContextMenu: props.onContextMenu, onPointerMove: props.onPointerMove }}
    >
      <svg viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} aria-hidden="true" focusable="false">
        <FrameTitles frame={layout} />
        {Array.from({ length: parents }, (_, k) => (
          <g key={`p${k}`} className="salmon-tree-map-parent">
            <rect x={n2(plot.x)} y={n2(top + k * PARENT_BAND)} width={n2(plot.width)} height={n2(PARENT_BAND - 2)} />
            <text x={n2(plot.x + 6)} y={n2(top + k * PARENT_BAND + PARENT_BAND / 2)} dominantBaseline="central">
              {currentPath[k]}
            </text>
          </g>
        ))}
        <g className="salmon-viz-marks">
          {rects.map((r) => {
            const item = toItem(r.node, colorOf(r.node));
            const opacity = props.colorScale?.kind === 'opacity' && r.leaf ? scaleOf(props.colorScale, r.node).opacity : undefined;
            return <TreeRect key={r.node.path.join('\u0000')} r={r} item={item} opacity={opacity} props={props} selected={isSel(r.node.path)} format={valueFmt} level={props.levels?.[r.node.depth - 1]?.header} />;
          })}
        </g>
        <TreeFocus frame={frame} rects={rects} siblings={siblings} highlight={props.highlight !== false} />
        {layout.legend ? <LegendSvg layout={layout.legend} items={legendItems} page={0} /> : null}
      </svg>
      {rects.map((r) => {
        // HTML content: leaf `render` over the leaf, header `render` over the header band.
        const h = props.levels?.[r.node.depth - 1]?.header;
        const render = r.leaf ? props.leaves?.render : typeof h === 'object' ? h.render : undefined;
        return render ? (
          <div key={r.node.path.join('\u0000')} className="salmon-tree-map-content" style={{ left: pct(r.x, size.width), top: pct(r.y, size.height), width: pct(r.width, size.width), height: pct(r.leaf ? r.height : r.header, size.height) }}>
            {render(toItem(r.node, colorOf(r.node)))}
          </div>
        ) : null;
      })}
      <div
        className="salmon-viz-plot"
        style={{ inset: 0 }}
        tabIndex={0}
        role="group"
        aria-roledescription={text.treeMap.toLowerCase()}
        aria-label={props.title ?? text.treeMap}
        onPointerMove={onPointerMove}
        onPointerLeave={() => hoverAt(-1, 0, 0)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onBlur={() => store.set({ focus: -1, tip: null })}
      />
      {props.breadcrumbs ? (
        <nav className="salmon-tree-map-breadcrumbs" aria-label={text.path} style={{ top: pct(layout.plot.y, size.height), left: pct(layout.plot.x, size.width) }}>
          <ol>
            {crumbs.map((c, k) => (
              <li key={k}>
                {k === crumbs.length - 1 ? (
                  <span aria-current="location">{c}</span>
                ) : (
                  <button type="button" onClick={(e) => drillTo(currentPath.slice(0, k), e.detail === 0 ? 'keyboard' : 'pointer', 'breadcrumb')}>
                    {c}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {layout.legend ? (
        <LegendButtons
          layout={layout.legend}
          items={legendItems}
          width={size.width}
          height={size.height}
          page={0}
          label={legendCfg.title ?? text.legend}
          toggle={false}
          onHighlight={legendCfg.mode === 'interactive' ? (id) => store.set({ legendHover: id === null ? -1 : current.children.findIndex((c) => c.key === id) }) : undefined}
        />
      ) : null}
      {props.tooltip !== false ? <TreeTooltip frame={frame} rects={rects} idBase={idBase} render={typeof props.tooltip === 'object' ? props.tooltip.render : undefined} item={(r) => toItem(r.node, colorOf(r.node))} format={valueFmt} /> : null}
      <TreeList node={current} format={valueFmt} label={props.title ?? text.treeMap} />
    </VizFigure>
  );
}

const LABEL_PAD = 4;

function TreeRect({ r, item, opacity, props, selected, format, level }: { readonly r: TreemapRect<unknown>; readonly item: TreeMapItem; readonly opacity: number | undefined; readonly props: TreeMapProps; readonly selected: boolean; readonly format: (v: number) => string; readonly level: boolean | TreeMapHeaderOptions | undefined }): ReactNode {
  const lh = lineHeight('sm');
  const leaf = r.leaf;
  const cls = leaf ? 'salmon-tree-map-leaf' : 'salmon-tree-map-group';
  let label: ReactNode = null;
  if (!leaf && r.header > 0 && !(typeof level === 'object' && level.render)) {
    const text = typeof level === 'object' && level.format ? level.format(item) : item.label;
    const align = typeof level === 'object' ? (level.align ?? 'start') : 'start';
    const t = truncateText(text, Math.max(0, r.width - LABEL_PAD * 2));
    const x = align === 'center' ? r.x + r.width / 2 : align === 'end' ? r.x + r.width - LABEL_PAD : r.x + LABEL_PAD;
    if (t)
      label = (
        <text className="salmon-tree-map-header" x={n2(x)} y={n2(r.y + r.header / 2)} dominantBaseline="central" textAnchor={align === 'center' ? 'middle' : align === 'end' ? 'end' : 'start'}>
          {t}
        </text>
      );
  } else if (leaf && !props.leaves?.render) {
    const text = props.leaves?.showValue ? `${item.label} ${format(item.value)}` : item.label;
    const room = r.width - LABEL_PAD * 2;
    const overflow = props.leaves?.labelOverflow ?? 'trim';
    let lines: string[] = [];
    if (r.height >= lh + 2 && room > 0) {
      if (textWidth(text) <= room) lines = [text];
      else if (overflow === 'trim') lines = [truncateText(text, room)].filter((s) => s.length > 0);
      else if (overflow === 'wrapWord' || overflow === 'wrap') lines = wrapText(text, room, 'sm', Math.max(1, Math.floor((r.height - 4) / lh)));
    }
    if (lines.length) {
      const pos = props.leaves?.labelPosition ?? 'topStart';
      const v = pos.startsWith('top') ? 'top' : pos.startsWith('bottom') ? 'bottom' : 'center';
      const h = pos.endsWith('Start') ? 'start' : pos.endsWith('End') ? 'end' : 'center';
      const x = h === 'start' ? r.x + LABEL_PAD : h === 'end' ? r.x + r.width - LABEL_PAD : r.x + r.width / 2;
      const block = lines.length * lh;
      const y0 = v === 'top' ? r.y + LABEL_PAD + lh / 2 : v === 'bottom' ? r.y + r.height - LABEL_PAD - block + lh / 2 : r.y + r.height / 2 - block / 2 + lh / 2;
      label = (
        <text className="salmon-tree-map-label" textAnchor={h === 'start' ? 'start' : h === 'end' ? 'end' : 'middle'} dominantBaseline="central">
          {lines.map((l, k) => (
            <tspan key={k} x={n2(x)} y={n2(y0 + k * lh)}>
              {l}
            </tspan>
          ))}
        </text>
      );
    }
  }
  return (
    <g className={cls} data-depth={r.node.depth} data-selected={selected ? '' : undefined} data-path={r.node.path.join('/')}>
      <rect className="salmon-viz-mark" x={n2(r.x)} y={n2(r.y)} width={n2(r.width)} height={n2(r.height)} style={opacity === undefined ? { fill: item.color } : { fill: item.color, fillOpacity: opacity }} />
      {label}
    </g>
  );
}

function TreeFocus({ frame, rects, siblings, highlight }: { readonly frame: Frame; readonly rects: readonly TreemapRect<unknown>[]; readonly siblings: readonly number[]; readonly highlight: boolean }): ReactNode {
  const hover = useVizSelector(frame.store, (s) => s.hover);
  const focus = useVizSelector(frame.store, (s) => s.focus);
  const legend = useVizSelector(frame.store, (s) => s.legendHover);
  const box = (r: TreemapRect<unknown> | undefined, cls: string) => (r ? <rect key={cls} className={cls} x={n2(r.x)} y={n2(r.y)} width={n2(r.width)} height={n2(r.height)} /> : null);
  const legendRect = legend >= 0 ? rects[siblings[legend] ?? -1] : undefined;
  return (
    <g className="salmon-tree-map-overlay">
      {highlight ? box(rects[hover], 'salmon-tree-map-hover') : null}
      {box(legendRect, 'salmon-tree-map-hover')}
      {box(rects[focus], 'salmon-viz-focus-mark')}
    </g>
  );
}


function TreeTooltip({ frame, rects, idBase, render, item, format }: { readonly frame: Frame; readonly rects: readonly TreemapRect<unknown>[]; readonly idBase: string; readonly render: ((item: TreeMapItem) => ReactNode) | undefined; readonly item: (r: TreemapRect<unknown>) => TreeMapItem; readonly format: (v: number) => string }): ReactNode {
  const tip = useVizSelector(frame.store, (s) => s.tip);
  const target = useVizSelector(frame.store, (s) => (s.hover >= 0 ? s.hover : s.focus));
  const r = rects[target];
  if (!tip || !r) return null;
  const it = item(r);
  return (
    <VizTooltip x={tip.x} y={tip.y} width={frame.size.width} height={frame.size.height} id={`${idBase}-tip`}>
      {render ? (
        render(it)
      ) : (
        <div className="salmon-viz-tooltip-row">
          <span className="salmon-viz-tooltip-swatch" style={{ background: it.color }} />
          <span>{it.path.join(' / ')}</span>
          <span className="salmon-viz-tooltip-value">{format(it.value)}</span>
        </div>
      )}
    </VizTooltip>
  );
}

/** Accessible equivalent: the hierarchy as a nested list. */
function TreeList({ node, format, label }: { readonly node: TreeNode<unknown>; readonly format: (v: number) => string; readonly label: string }): ReactNode {
  const list = (n: TreeNode<unknown>, depth: number): ReactNode =>
    n.children.length ? (
      <ul>
        {n.children.slice(0, 500).map((c) => (
          <li key={c.key}>
            {`${c.key}: ${format(c.value)}`}
            {depth < 6 ? list(c, depth + 1) : null}
          </li>
        ))}
      </ul>
    ) : null;
  return (
    <div className="salmon-visually-hidden" aria-label={label} role="region">
      {list(node, 0)}
    </div>
  );
}
