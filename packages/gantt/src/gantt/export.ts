// Gantt export and print: a lazy chunk loaded
// by the first `exportTo*` / `print` call. Excel and CSV are the grid pane's
// Data Grid exports (tree rows as outline levels); PDF builds a vector
// drawing model of both panes (columns, rows, timeline tiers, bars,
// connectors, shading) for `exportGanttPdf` of `@salmonui/export/gantt`,
// loaded through `exportWriters.pdf`. Print shows the rendered panes with the
// print stylesheet.

import { gridEvent } from '@salmonui/core/internal/events';
import { DAY } from '@salmonui/core/internal/timeline/axis';
import { tierCells, xOf } from '../internal/timeline/scale.js';
import { barOf, connectorPath, createFormatters } from './chart.js';
import { buildColumns } from './columns.js';
import type { GanttInstance } from './instance.js';
import type { GanttExportEvent, GanttExportFile, GanttGridExportOptions, GanttPdfExportOptions } from './types.js';

type Writer = (model: unknown, options: unknown) => Promise<GanttExportFile<Uint8Array>>;

function before<Row>(g: GanttInstance<Row>, format: 'excel' | 'csv' | 'pdf', fileName: string): boolean {
  if (!g.props.onBeforeExport) return true;
  const e = gridEvent<GanttExportEvent>('beforeExport', 'api', { format, fileName });
  g.props.onBeforeExport(e);
  return !e.defaultPrevented;
}

const after = <Row>(g: GanttInstance<Row>, format: 'excel' | 'csv' | 'pdf', fileName: string): void => g.props.onExport?.(gridEvent<GanttExportEvent>('export', 'api', { format, fileName }));

export async function exportExcel<Row>(g: GanttInstance<Row>, o: GanttGridExportOptions<Row> & { sheetName?: string }): Promise<GanttExportFile<Uint8Array> | null> {
  const name = o.fileName ?? 'Gantt.xlsx';
  if (!before(g, 'excel', name) || !g.gridApi) return null;
  const file = await g.gridApi.exportToExcel({ ...o, fileName: name, download: false });
  if (file) after(g, 'excel', name);
  return file as GanttExportFile<Uint8Array> | null;
}

export async function exportCsv<Row>(g: GanttInstance<Row>, o: GanttGridExportOptions<Row> & { separator?: string; escapeFormulas?: boolean }): Promise<GanttExportFile<string> | null> {
  const name = o.fileName ?? 'Gantt.csv';
  if (!before(g, 'csv', name) || !g.gridApi) return null;
  const file = await g.gridApi.exportToCsv({ ...o, fileName: name, download: false });
  if (file) after(g, 'csv', name);
  return file as GanttExportFile<string> | null;
}

/** Resolved theme colors of the chart parts (the exported PDF follows the theme seeds). */
function colors<Row>(g: GanttInstance<Row>) {
  const el = g.chartRoot;
  const read = (name: string, fallback: string): string => {
    if (!el || typeof getComputedStyle !== 'function') return fallback;
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  };
  return {
    bar: read('--salmon-gantt-export-bar', '#5b8def'),
    progress: read('--salmon-gantt-export-progress', '#2f5fc4'),
    parent: read('--salmon-gantt-export-parent', '#4a5568'),
    milestone: read('--salmon-gantt-export-milestone', '#4a5568'),
    baseline: read('--salmon-gantt-export-baseline', '#e07a5f'),
    critical: read('--salmon-gantt-export-critical', '#d64545'),
    connector: read('--salmon-gantt-export-connector', '#5f6b7a'),
    weekend: '#f2f4f7',
    holiday: '#fde8e8',
    marker: '#d64545',
    text: '#1f2933',
    headerText: '#1f2933',
    headerBackground: '#f5f7fa',
    line: '#d9dee5',
    background: '#ffffff',
  };
}

/** The vector model of both panes. */
export function pdfModel<Row>(g: GanttInstance<Row>, o: GanttPdfExportOptions<Row>) {
  const scale = g.scale;
  const p = g.props;
  const formatters = createFormatters(p.locale ?? 'en-US', p.dateFormat);
  const c = colors(g);
  const columns = buildColumns(g, p).filter((col) => !col.hidden);
  const rows = g.visibleRows();
  const rowHeight = p.rowHeight ?? 36;
  const taskbarHeight = p.taskbarHeight ?? Math.round(rowHeight * 0.6);
  const top = Math.round((rowHeight - taskbarHeight) / 2);
  const index = new Map<string, number>();
  rows.forEach((r, i) => index.set(g.idOf(r), i));
  const text = (row: Row, col: (typeof columns)[number]): string => {
    const raw = col.valueGetter ? col.valueGetter(row) : col.field ? (row as Record<string, unknown>)[col.field] : '';
    let t = raw instanceof Date ? formatters.date(g.wall(raw) ?? 0) : raw === null || raw === undefined ? '' : String(raw);
    if (col.field === g.fields.progress) t = `${Math.round(Number(raw) || 0)}%`;
    if (o.cell && col.field) {
      const ctx = { task: row, field: col.field, value: raw, text: t };
      o.cell(ctx);
      t = ctx.text;
    }
    return t;
  };
  const headers = columns.map((col) => {
    const ctx = { field: col.field ?? col.id ?? '', text: col.header ?? col.field ?? '' };
    o.headerCell?.(ctx);
    return { header: ctx.text, width: typeof col.width === 'number' ? col.width : 120, ...(col.align === 'end' ? { align: 'end' as const } : {}) };
  });
  const tiers = [scale.level.top, scale.level.bottom]
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((spec, i) => ({
      cells: tierCells(scale, spec, 0, scale.width).map((cell) => {
        const ctx = { date: new Date(cell.start), tier: (i === 0 && scale.level.top ? 'top' : 'bottom') as 'top' | 'bottom', text: formatters.tier(cell.start, i === 0 && scale.level.top ? 'top' : 'bottom', spec) };
        o.timelineCell?.(ctx);
        return { x: cell.x, width: cell.width, text: ctx.text };
      }),
    }));
  const bars: unknown[] = [];
  const connectors: unknown[] = [];
  rows.forEach((row, i) => {
    const id = g.idOf(row);
    const s = g.engine.getSchedule(id);
    if (!s) return;
    const box = barOf(scale, s);
    const critical = !!g.critical?.has(id);
    const info = g.info(id);
    const ctx = { task: row, info: info as NonNullable<typeof info>, color: critical ? c.critical : s.parent ? c.parent : c.bar, progressColor: c.progress };
    o.taskbar?.(ctx);
    if (!box) {
      bars.push({ row: i, kind: 'unscheduled', x: xOf(scale, g.projectRange().start), width: scale.level.unitWidth, top, height: taskbarHeight, progress: 0, color: c.line, progressColor: c.line });
      return;
    }
    const kind = s.milestone ? 'milestone' : s.parent ? 'parent' : 'task';
    bars.push({
      row: i,
      kind,
      x: s.milestone ? box.x - taskbarHeight / 2 : box.x,
      width: s.milestone ? taskbarHeight : box.width,
      top,
      height: taskbarHeight,
      progress: s.progress,
      color: s.milestone ? c.milestone : ctx.color,
      progressColor: ctx.progressColor,
      critical,
      ...(s.segments && s.segments.length > 1 ? { segments: s.segments.map((seg) => ({ x: xOf(scale, seg.start), width: xOf(scale, seg.end) - xOf(scale, seg.start) })) } : {}),
      label: String((row as Record<string, unknown>)[g.fields.title] ?? ''),
    });
    const t = g.engine.getTask(id);
    if (p.baselines && t?.baselineStart != null) {
      const bs = t.baselineStart;
      const be = t.baselineEnd ?? bs;
      bars.push({ row: i, kind: 'baseline', x: xOf(scale, bs), width: Math.max(2, xOf(scale, be) - xOf(scale, bs)), top: top + taskbarHeight + 2, height: 4, progress: 0, color: c.baseline, progressColor: c.baseline });
    }
    for (const dep of t?.predecessors ?? []) {
      const fi = index.get(dep.id);
      const fs = g.engine.getSchedule(dep.id);
      if (fi === undefined || !fs) continue;
      const fb = barOf(scale, fs);
      if (!fb) continue;
      const fromEnd = dep.type === 'fs' || dep.type === 'ff';
      const toStart = dep.type === 'fs' || dep.type === 'ss';
      const x1 = fromEnd ? fb.x + fb.width : fb.x;
      const x2 = toStart ? box.x : box.x + box.width;
      const path = connectorPath(x1, fi * rowHeight + rowHeight / 2, fromEnd, x2, i * rowHeight + rowHeight / 2, toStart, rowHeight / 2).d;
      const points: [number, number][] = [];
      let cx = 0;
      let cy = 0;
      for (const m of path.matchAll(/([MHV])(-?[\d.]+)(?:\s(-?[\d.]+))?/g)) {
        if (m[1] === 'M') {
          cx = Number(m[2]);
          cy = Number(m[3]);
        } else if (m[1] === 'H') cx = Number(m[2]);
        else cy = Number(m[2]);
        points.push([cx, cy]);
      }
      connectors.push({ points, color: critical && g.critical?.has(dep.id) ? c.critical : c.connector });
    }
  });
  const shades: unknown[] = [];
  if (p.highlightWeekends) {
    for (let d = Math.floor(scale.start / DAY); d * DAY < scale.end; d++) {
      const wd = (((d + 4) % 7) + 7) % 7;
      if (wd === 0 || wd === 6) shades.push({ x: xOf(scale, d * DAY), width: DAY * scale.pxPerMs, color: c.weekend });
    }
  }
  for (const h of p.holidays ?? []) {
    const s = g.wall(h.start);
    if (s === null) continue;
    const e = (g.wall(h.end ?? h.start) ?? s) + DAY;
    shades.push({ x: xOf(scale, Math.floor(s / DAY) * DAY), width: (Math.floor(e / DAY) - Math.floor(s / DAY)) * DAY * scale.pxPerMs, color: c.holiday, ...(h.label ? { label: h.label } : {}) });
  }
  const markers = (p.markers ?? []).flatMap((m) => {
    const w = g.wall(m.date);
    return w === null ? [] : [{ x: xOf(scale, w), color: c.marker, ...(m.label ? { label: m.label } : {}) }];
  });
  return {
    title: p['aria-label'] ?? g.text('label'),
    direction: g.isRtl() ? 'rtl' : 'ltr',
    columns: headers,
    rows: rows.map((row) => {
      const s = g.engine.getSchedule(g.idOf(row));
      return { cells: columns.map((col) => text(row, col)), depth: s?.level ?? 0, parent: s?.parent ?? false, height: rowHeight };
    }),
    chartWidth: scale.width,
    headerHeight: 56,
    tiers,
    bars,
    connectors,
    shades,
    markers,
    colors: { text: c.text, headerText: c.headerText, headerBackground: c.headerBackground, line: c.line, background: c.background },
  };
}

export async function exportPdf<Row>(g: GanttInstance<Row>, o: GanttPdfExportOptions<Row>): Promise<GanttExportFile<Uint8Array> | null> {
  const load = g.props.exportWriters?.pdf;
  if (!load) throw new Error('exportToPdf: the Gantt has no exportWriters.pdf loader (a dynamic import of @salmonui/export/gantt).');
  const name = o.fileName ?? 'Gantt.pdf';
  if (!before(g, 'pdf', name)) return null;
  const { exportGanttPdf } = await load();
  const options: Record<string, unknown> = { fileName: name };
  for (const k of ['pageSize', 'orientation', 'fitToWidth', 'header', 'footer', 'font'] as const) if (o[k] !== undefined) options[k] = o[k];
  const file = await (exportGanttPdf as Writer)(pdfModel(g, o), options);
  after(g, 'pdf', name);
  return file;
}

/** Prints the rendered panes (the print stylesheet hides the rest of the page). */
export function print<Row>(g: GanttInstance<Row>): void {
  const root = g.chartRoot?.closest<HTMLElement>('.salmon-gantt');
  const win = root?.ownerDocument.defaultView;
  if (!root || !win) return;
  root.setAttribute('data-printing', '');
  root.ownerDocument.documentElement.setAttribute('data-salmon-gantt-printing', '');
  const done = (): void => {
    root.removeAttribute('data-printing');
    root.ownerDocument.documentElement.removeAttribute('data-salmon-gantt-printing');
    win.removeEventListener('afterprint', done);
  };
  win.addEventListener('afterprint', done);
  win.print();
}
