// Frame layout: `layoutFrame`
// places the title, subtitle, legend and axis blocks around the plot
// rectangle for a given size. Pure and deterministic: text sizes come from
// the estimate table, so the server markup equals the first client render.

import { lineHeight, textWidth, truncateText, type FontSize } from './text.js';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Nominal server size: the given width, else 600. */
export const NOMINAL_WIDTH = 600;
export const NOMINAL_HEIGHT = 300;

/** System-owned spacing. */
export const FRAME_PADDING = 8;
export const TICK_SIZE = 5;
export const LABEL_GAP = 4;
export const AXIS_TITLE_GAP = 6;

export type LegendPosition = 'top' | 'bottom' | 'start' | 'end';

export interface LegendItemSpec {
  readonly label: string;
}

export interface LegendSpec {
  readonly position: LegendPosition | 'auto';
  readonly items: readonly LegendItemSpec[];
  readonly title?: string | undefined;
  /** Ellipsis beyond this width (the full text stays in the accessible name). */
  readonly maxLabelWidth?: number | undefined;
  /** Fixed column count for top / bottom legends. */
  readonly columns?: number | undefined;
  /** `'page'` limits a top / bottom legend to `maxRows` rows per page. */
  readonly overflow?: 'wrap' | 'page' | undefined;
  readonly maxRows?: number | undefined;
}

export interface LegendItemBox {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Display text (possibly truncated). */
  readonly text: string;
  readonly page: number;
}

export interface LegendLayout extends Rect {
  readonly position: LegendPosition;
  readonly items: readonly LegendItemBox[];
  readonly pages: number;
  readonly title?: { readonly x: number; readonly y: number; readonly text: string } | undefined;
}

export type AxisSide = 'top' | 'bottom' | 'left' | 'right';

export interface AxisBlockSpec {
  readonly id: string;
  readonly side: AxisSide;
  /** Label block thickness perpendicular to the axis (rotated labels included); 0 when labels are hidden. */
  readonly labelThickness: number;
  readonly title?: string | undefined;
  readonly hidden?: boolean | undefined;
  /** Labels and ticks drawn inside the plot take no room. */
  readonly inside?: boolean | undefined;
}

export interface AxisBlock extends Rect {
  readonly id: string;
  readonly side: AxisSide;
  /** Pixel of the axis line (x for left / right, y for top / bottom). */
  readonly line: number;
}

export interface FrameSpec {
  readonly width: number;
  readonly height: number;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly legend?: LegendSpec | null | undefined;
  readonly axes?: readonly AxisBlockSpec[] | undefined;
  /** Extra room kept around the plot (half a marker, edge labels). */
  readonly plotInset?: number | undefined;
}

export interface FrameLayout {
  readonly width: number;
  readonly height: number;
  readonly title?: { readonly x: number; readonly y: number; readonly text: string } | undefined;
  readonly subtitle?: { readonly x: number; readonly y: number; readonly text: string } | undefined;
  readonly legend?: LegendLayout | undefined;
  readonly plot: Rect;
  readonly axes: ReadonlyMap<string, AxisBlock>;
}

const TITLE_SIZE: FontSize = 'lg';
const SUBTITLE_SIZE: FontSize = 'sm';
const LEGEND_SIZE: FontSize = 'sm';
export const LEGEND_SYMBOL = 10;
export const LEGEND_SYMBOL_GAP = 6;
export const LEGEND_ITEM_GAP = 16;
export const LEGEND_ROW_GAP = 4;
/** Room kept for the legend pager (two arrows and the page count) beside paged rows. */
export const LEGEND_PAGER_WIDTH = 68;

/** Places legend items in rows (top / bottom) or a column (start / end) inside `room`. */
export function layoutLegend(spec: LegendSpec, position: LegendPosition, room: Size): { width: number; height: number; items: LegendItemBox[]; pages: number; titleHeight: number } {
  const lh = lineHeight(LEGEND_SIZE);
  const itemH = Math.max(lh, LEGEND_SYMBOL) + 2;
  const titleHeight = spec.title ? lh + LEGEND_ROW_GAP : 0;
  const maxLabel = spec.maxLabelWidth ?? (position === 'start' || position === 'end' ? Math.max(40, room.width * 0.25) : Math.max(40, room.width - LEGEND_SYMBOL - LEGEND_SYMBOL_GAP));
  const texts = spec.items.map((it) => truncateText(it.label, maxLabel, LEGEND_SIZE));
  const widths = texts.map((t) => LEGEND_SYMBOL + LEGEND_SYMBOL_GAP + textWidth(t, LEGEND_SIZE));
  const items: LegendItemBox[] = [];
  if (position === 'start' || position === 'end') {
    const colW = Math.ceil(Math.max(0, ...widths));
    const perPage = Math.max(1, Math.floor((room.height - titleHeight + LEGEND_ROW_GAP) / (itemH + LEGEND_ROW_GAP)));
    texts.forEach((text, i) => {
      const page = Math.floor(i / perPage);
      const row = i % perPage;
      items.push({ index: i, x: 0, y: titleHeight + row * (itemH + LEGEND_ROW_GAP), width: widths[i] as number, height: itemH, text, page });
    });
    const pages = Math.max(1, Math.ceil(texts.length / perPage));
    const rows = Math.min(texts.length, perPage);
    return { width: Math.max(colW, spec.title ? textWidth(spec.title, LEGEND_SIZE, true) : 0), height: titleHeight + rows * itemH + Math.max(0, rows - 1) * LEGEND_ROW_GAP, items, pages, titleHeight };
  }
  // Rows: greedy wrap, or a fixed column grid. Paged rows leave room for the pager after them.
  const avail = room.width - (spec.overflow === 'page' ? LEGEND_PAGER_WIDTH : 0);
  const maxRows = spec.overflow === 'page' ? Math.max(1, spec.maxRows ?? 2) : Number.POSITIVE_INFINITY;
  let x = 0;
  let row = 0;
  let rowWidths: number[] = [0];
  const colW = spec.columns ? Math.ceil(Math.max(0, ...widths)) + LEGEND_ITEM_GAP : 0;
  texts.forEach((text, i) => {
    const w = widths[i] as number;
    const advance = spec.columns ? colW : w + LEGEND_ITEM_GAP;
    const wrap = spec.columns ? i > 0 && i % spec.columns === 0 : x > 0 && x + w > avail;
    if (wrap) {
      row++;
      x = 0;
      rowWidths.push(0);
    }
    const page = Math.floor(row / maxRows);
    items.push({ index: i, x, y: titleHeight + (row % maxRows) * (itemH + LEGEND_ROW_GAP), width: w, height: itemH, text, page });
    x += advance;
    rowWidths[row] = x - (spec.columns ? colW - w : LEGEND_ITEM_GAP);
  });
  const rows = Math.min(row + 1, maxRows);
  const pages = Math.max(1, Math.ceil((row + 1) / maxRows));
  // Center each row horizontally.
  const width = Math.min(avail, Math.max(0, ...rowWidths));
  rowWidths = rowWidths.map((w) => Math.min(w, avail));
  const centered = items.map((it) => {
    const r = Math.round((it.y - titleHeight) / (itemH + LEGEND_ROW_GAP)) + it.page * maxRows;
    const offset = (width - (rowWidths[r] ?? width)) / 2;
    return { ...it, x: it.x + offset };
  });
  return { width, height: titleHeight + rows * itemH + Math.max(0, rows - 1) * LEGEND_ROW_GAP, items: centered, pages, titleHeight };
}

/** Thickness of an axis block (ticks, labels, title) perpendicular to its line. */
export function axisThickness(spec: AxisBlockSpec): number {
  if (spec.hidden) return 0;
  const title = spec.title ? lineHeight('sm') + AXIS_TITLE_GAP : 0;
  if (spec.inside) return title;
  return TICK_SIZE + LABEL_GAP + spec.labelThickness + title;
}

type TitleBox = { readonly x: number; readonly y: number; readonly text: string } | undefined;

/** Title and subtitle at the top of a drawing `width` wide (start aligned); `top` is where the content below them starts. */
export function layoutTitles(width: number, title?: string, subtitle?: string): { title: TitleBox; subtitle: TitleBox; top: number } {
  let top = FRAME_PADDING;
  const line = (text: string | undefined, size: FontSize): TitleBox => {
    if (!text) return undefined;
    const lh = lineHeight(size);
    const box = { x: FRAME_PADDING, y: top + lh * 0.8, text: truncateText(text, width - 2 * FRAME_PADDING, size) };
    top += lh + 2;
    return box;
  };
  const t = line(title, TITLE_SIZE);
  const s = line(subtitle, SUBTITLE_SIZE);
  return { title: t, subtitle: s, top: t || s ? top + 6 : top };
}

/**
 * Lays out the frame: title block on top (start aligned), legend on
 * its side, axis blocks stacked outward from the plot, plot rectangle last.
 */
export function layoutFrame(spec: FrameSpec): FrameLayout {
  const width = Math.max(1, spec.width);
  const height = Math.max(1, spec.height);
  let top = FRAME_PADDING;
  let bottom = height - FRAME_PADDING;
  let left = FRAME_PADDING;
  let right = width - FRAME_PADDING;
  // The title block of `layoutTitles` (same positions), inline: calling it costs every frame family about
  // 30 bytes of gzip, and only the Gauge, which has no frame, needs the block alone.
  let title: FrameLayout['title'];
  let subtitle: FrameLayout['subtitle'];
  if (spec.title) {
    const lh = lineHeight(TITLE_SIZE);
    title = { x: left, y: top + lh * 0.8, text: truncateText(spec.title, right - left, TITLE_SIZE) };
    top += lh + 2;
  }
  if (spec.subtitle) {
    const lh = lineHeight(SUBTITLE_SIZE);
    subtitle = { x: left, y: top + lh * 0.8, text: truncateText(spec.subtitle, right - left, SUBTITLE_SIZE) };
    top += lh + 2;
  }
  if (title || subtitle) top += 6;

  let legend: LegendLayout | undefined;
  if (spec.legend && spec.legend.items.length > 0) {
    const position: LegendPosition = spec.legend.position === 'auto' ? 'bottom' : spec.legend.position;
    const room = { width: right - left, height: bottom - top };
    const l = layoutLegend(spec.legend, position, room);
    let x = left;
    let y = top;
    // A paged row legend is centered together with its pager.
    const pager = l.pages > 1 ? LEGEND_PAGER_WIDTH : 0;
    if (position === 'top' || position === 'bottom') {
      x = left + (room.width - l.width - pager) / 2;
      if (position === 'top') top += l.height + 10;
      else {
        y = bottom - l.height;
        bottom -= l.height + 10;
      }
    } else if (position === 'start') {
      y = top + (room.height - l.height) / 2;
      left += l.width + 12;
    } else {
      x = right - l.width;
      y = top + (room.height - l.height) / 2;
      right -= l.width + 12;
    }
    legend = {
      position,
      x,
      y,
      width: l.width,
      height: l.height,
      pages: l.pages,
      items: l.items.map((it) => ({ ...it, x: x + it.x, y: y + it.y })),
      title: spec.legend.title ? { x, y: y + lineHeight('sm') * 0.8, text: spec.legend.title } : undefined,
    };
  }

  const inset = spec.plotInset ?? 0;
  const axes = new Map<string, AxisBlock>();
  const bySide: Record<AxisSide, AxisBlockSpec[]> = { top: [], bottom: [], left: [], right: [] };
  for (const a of spec.axes ?? []) bySide[a.side].push(a);
  const thick = (side: AxisSide) => bySide[side].reduce((sum, a) => sum + axisThickness(a), 0);
  const plot: Rect = {
    x: left + thick('left') + inset,
    y: top + thick('top') + inset,
    width: Math.max(1, right - left - thick('left') - thick('right') - inset * 2),
    height: Math.max(1, bottom - top - thick('top') - thick('bottom') - inset * 2),
  };
  // Stack each side outward from the plot edge.
  let edge = plot.x - inset;
  for (const a of bySide.left) {
    const t = axisThickness(a);
    axes.set(a.id, { id: a.id, side: 'left', x: edge - t, y: plot.y, width: t, height: plot.height, line: edge });
    edge -= t;
  }
  edge = plot.x + plot.width + inset;
  for (const a of bySide.right) {
    const t = axisThickness(a);
    axes.set(a.id, { id: a.id, side: 'right', x: edge, y: plot.y, width: t, height: plot.height, line: edge });
    edge += t;
  }
  edge = plot.y + plot.height + inset;
  for (const a of bySide.bottom) {
    const t = axisThickness(a);
    axes.set(a.id, { id: a.id, side: 'bottom', x: plot.x, y: edge, width: plot.width, height: t, line: edge });
    edge += t;
  }
  edge = plot.y - inset;
  for (const a of bySide.top) {
    const t = axisThickness(a);
    axes.set(a.id, { id: a.id, side: 'top', x: plot.x, y: edge - t, width: plot.width, height: t, line: edge });
    edge -= t;
  }
  return { width, height, title, subtitle, legend, plot, axes };
}

/** Splits a plot rectangle into pane rows and columns by relative or pixel sizes. */
export function splitPanes(plot: Rect, rows: readonly (number | string)[] = [1], columns: readonly (number | string)[] = [1], gap = 12): Rect[][] {
  const sizes = (list: readonly (number | string)[], total: number): number[] => {
    const avail = total - gap * Math.max(0, list.length - 1);
    let fixed = 0;
    let weight = 0;
    for (const s of list) {
      if (typeof s === 'string' && s.endsWith('px')) fixed += Number.parseFloat(s);
      else if (typeof s === 'string' && s.endsWith('%')) fixed += (Number.parseFloat(s) / 100) * avail;
      else weight += typeof s === 'number' ? s : 1;
    }
    return list.map((s) => {
      if (typeof s === 'string' && s.endsWith('px')) return Number.parseFloat(s);
      if (typeof s === 'string' && s.endsWith('%')) return (Number.parseFloat(s) / 100) * avail;
      return weight ? (Math.max(0, avail - fixed) * (typeof s === 'number' ? s : 1)) / weight : 0;
    });
  };
  const hs = sizes(rows.length ? rows : [1], plot.height);
  const ws = sizes(columns.length ? columns : [1], plot.width);
  const out: Rect[][] = [];
  let y = plot.y;
  for (const h of hs) {
    const row: Rect[] = [];
    let x = plot.x;
    for (const w of ws) {
      row.push({ x, y, width: w, height: h });
      x += w + gap;
    }
    out.push(row);
    y += h + gap;
  }
  return out;
}
