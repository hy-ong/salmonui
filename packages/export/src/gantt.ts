// `@salmonui/export/gantt`: the Gantt chart as a PDF,
// drawn with vector operators (rectangles, lines, filled polygons), never
// images. The caller resolves the layout in CSS px (grid columns, rows,
// timeline tiers, bars, connectors, shading, markers) and the colors; the
// writer scales px to points (0.75, or to the page width with `fitToWidth`),
// paginates rows into bands (a row never splits) and the chart into
// page-wide slices (the grid on the first slice of each band), repeats the timeline tiers on every page and clips the chart to
// its area. Text, fonts (Helvetica WinAnsi or an embedded TrueType `font`
// for non-Latin and RTL text), page sizes and the header / footer with
// `{page}` / `{pages}` come from the PDF writer.

import { concat, createSlicer, defaultYield, deflate, latin1 } from './bytes.js';
import { helpers, helvetica, n2, PAGE_SIZES, rgb, textString, type Face, type PdfPageSize } from './pdf-writer.js';
import type { EmbeddedFace, PdfFont, PdfFontData } from './pdf-fonts.js';

export type { PdfFont, PdfFontData, PdfPageSize } from './pdf-writer.js';

export type GanttPdfBarKind = 'task' | 'parent' | 'milestone' | 'baseline' | 'unscheduled';

/** One bar of the chart, in px; `row` indexes `GanttPdfModel.rows`, `top` / `height` are inside the row. */
export interface GanttPdfBar {
  readonly row: number;
  readonly kind: GanttPdfBarKind;
  readonly x: number;
  readonly width: number;
  readonly top: number;
  readonly height: number;
  /** 0..100. */
  readonly progress: number;
  /** `#rrggbb`. */
  readonly color: string;
  readonly progressColor: string;
  /** Outlined with `progressColor`. */
  readonly critical?: boolean;
  /** Split task parts (px from the chart start), joined by a dashed line. */
  readonly segments?: readonly { readonly x: number; readonly width: number }[];
  /** Drawn after the bar end. */
  readonly label?: string;
}

/** The laid-out Gantt chart to print, in CSS px. */
export interface GanttPdfModel {
  /** Document title (`/Title`). */
  readonly title?: string;
  readonly direction?: 'ltr' | 'rtl';
  /** Grid pane columns, px widths. */
  readonly columns: readonly { readonly header: string; readonly width: number; readonly align?: 'start' | 'center' | 'end' }[];
  /** One entry per exported row, top to bottom; `cells` aligned with `columns` (the first cell is indented by `depth`). */
  readonly rows: readonly { readonly cells: readonly string[]; readonly depth: number; readonly parent: boolean; readonly height: number }[];
  /** Chart width in px. */
  readonly chartWidth: number;
  /** Height of the timeline header (all tiers) and of the grid header row, px. */
  readonly headerHeight: number;
  /** Timeline header tiers, top to bottom; cells in px from the chart start. */
  readonly tiers: readonly { readonly cells: readonly { readonly x: number; readonly width: number; readonly text: string }[] }[];
  readonly bars: readonly GanttPdfBar[];
  /** Polylines in chart px (y from the top of the first row); the arrow is at the last point, along the last segment. */
  readonly connectors: readonly { readonly points: readonly (readonly [number, number])[]; readonly color: string }[];
  /** Weekend / holiday shading, px. */
  readonly shades: readonly { readonly x: number; readonly width: number; readonly color: string; readonly label?: string }[];
  /** Event markers, px. */
  readonly markers: readonly { readonly x: number; readonly color: string; readonly label?: string }[];
  readonly colors: { readonly text: string; readonly headerText: string; readonly headerBackground: string; readonly line: string; readonly background: string };
}

export interface GanttPdfOptions {
  /** Default `Gantt.pdf`. */
  readonly fileName?: string;
  /** A PDF writer page size (case-insensitive), or the size in points. Default `a4`. */
  readonly pageSize?: PdfPageSize | 'A4' | 'A3' | 'Letter' | 'Legal' | readonly [number, number] | { readonly width: number; readonly height: number };
  /** Default `landscape`. */
  readonly orientation?: 'portrait' | 'landscape';
  /** Scales the grid and the whole chart to the page width (one page per row band). Default false. */
  readonly fitToWidth?: boolean;
  /** Page header text; `{page}` and `{pages}` are replaced. */
  readonly header?: string;
  /** Page footer text; default `{page} / {pages}`. Empty string for none. */
  readonly footer?: string;
  /** TrueType font for all text (the PDF writer's `font`): needed outside WinAnsi and for RTL scripts. */
  readonly font?: PdfFont | PdfFontData;
}

export interface GanttPdfFile {
  readonly fileName: string;
  readonly mimeType: 'application/pdf';
  readonly data: Uint8Array;
}

type Pt = readonly [number, number];

/** Writes the Gantt chart as a PDF file. */
export async function exportGanttPdf(model: GanttPdfModel, options: GanttPdfOptions = {}): Promise<GanttPdfFile> {
  const slicer = createSlicer(25, defaultYield);
  const ps = options.pageSize;
  const base: Pt = Array.isArray(ps) ? (ps as Pt) : typeof ps === 'object' ? [(ps as { width: number }).width, (ps as { height: number }).height] : PAGE_SIZES[((ps as string | undefined) ?? 'a4').toLowerCase() as PdfPageSize] ?? PAGE_SIZES.a4;
  const landscape = options.orientation !== 'portrait';
  const pageW = landscape ? Math.max(base[0], base[1]) : Math.min(base[0], base[1]);
  const pageH = landscape ? Math.min(base[0], base[1]) : Math.max(base[0], base[1]);
  const margin = 36;
  const lineH = 15.2;
  const usableW = pageW - 2 * margin;
  const rtl = model.direction === 'rtl';
  const headerText = options.header ?? '';
  const footerText = options.footer ?? '{page} / {pages}';
  const c = model.colors;

  // --- fonts -------------------------------------------------------------------
  let regular: Face = helvetica(false);
  let bold: Face = helvetica(true);
  let embedded: { regular: EmbeddedFace; bold: EmbeddedFace | null } | null = null;
  if (options.font) {
    const { createEmbeddedFace } = await import('./pdf-fonts.js');
    const spec = options.font as PdfFont;
    const font: PdfFont = spec.regular ? spec : { regular: options.font as PdfFontData };
    const r = createEmbeddedFace(font.regular, rtl, helpers);
    const b = font.bold ? createEmbeddedFace(font.bold, rtl, helpers) : null;
    embedded = { regular: r, bold: b };
    regular = r;
    bold = b ?? r;
  }
  const fakeBold = embedded !== null && embedded.bold === null;

  // --- scale and horizontal slices ----------------------------------------------
  const gridPx = model.columns.reduce((s, col) => s + col.width, 0);
  const fitW = options.fitToWidth === true;
  const s = fitW ? usableW / Math.max(1, gridPx + model.chartWidth) : 0.75;
  const g = Math.min(1, usableW / Math.max(1e-9, gridPx * s));
  const colW = model.columns.map((col) => col.width * s * g);
  const gridW = gridPx * s * g;
  const chartW = model.chartWidth * s;
  const slices: { start: number; width: number }[] = [{ start: 0, width: fitW ? chartW : Math.max(0, usableW - gridW) }];
  for (let at = (slices[0] as { width: number }).width; !fitW && at < chartW - 0.01; at += usableW) slices.push({ start: at, width: usableW });
  const fs = Math.max(3, (8 * s) / 0.75);
  const pad = Math.max(1, (3 * s) / 0.75);

  // --- vertical bands ------------------------------------------------------------
  const headH = model.headerHeight * s;
  const bodyTop = pageH - margin - (headerText ? lineH : 0);
  const bodyBottom = margin + (footerText ? lineH : 0);
  const capacity = bodyTop - bodyBottom - headH;
  const tops: number[] = [0];
  for (const row of model.rows) tops.push((tops.at(-1) as number) + row.height);
  const bands: [number, number][] = [];
  for (let a = 0; a < model.rows.length; ) {
    let b = a + 1;
    while (b < model.rows.length && ((tops[b + 1] as number) - (tops[a] as number)) * s <= capacity + 1e-6) b++;
    bands.push([a, b]);
    a = b;
  }
  if (!bands.length) bands.push([0, 0]);
  const barsOf: number[][] = model.rows.map(() => []);
  model.bars.forEach((bar, i) => barsOf[bar.row]?.push(i));

  // --- drawing -------------------------------------------------------------------
  let ops: string[] = [];
  const color = (value: string, op: 'rg' | 'RG'): string => `${rgb(value) ?? '0 0 0'} ${op}`;
  const rect = (fill: string, x: number, y: number, w: number, h: number): void => {
    if (w > 0 && h > 0) ops.push(`${color(fill, 'rg')} ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
  };
  const path = (pts: readonly Pt[]): string => pts.map((p, i) => `${n2(p[0])} ${n2(p[1])} ${i ? 'l' : 'm'}`).join(' ');
  const line = (stroke: string, pts: readonly Pt[], width: number, dash = ''): void => {
    ops.push(`${color(stroke, 'RG')} ${n2(width)} w ${dash || '[] 0'} d ${path(pts)} S`);
  };
  const poly = (fill: string, pts: readonly Pt[]): void => {
    ops.push(`${color(fill, 'rg')} ${path(pts)} h f`);
  };
  /** Text in the box (x, y bottom, w, h); `start` / `end` follow the direction. */
  const text = (value: string, x: number, y: number, w: number, h: number, ink: string, align: 'start' | 'center' | 'end' = 'start', isBold = false, size = fs): void => {
    if (!value) return;
    const shown = (isBold ? bold : regular).fit(value, w - 2 * pad, size);
    if (!shown) return;
    const tx = align === 'center' ? x + (w - shown.w) / 2 : (align === 'end') !== rtl ? x + w - pad - shown.w : x + pad;
    const ty = n2(y + (h - size) / 2 + size * 0.22);
    const k = color(ink, 'rg');
    if (isBold && fakeBold) ops.push(`q BT /F1 ${n2(size)} Tf ${k} ${color(ink, 'RG')} 2 Tr ${n2(size * 0.025)} w ${n2(tx)} ${ty} Td ${shown.s} Tj ET Q`);
    else ops.push(`BT /${isBold ? 'F2' : 'F1'} ${n2(size)} Tf ${k} ${n2(tx)} ${ty} Td ${shown.s} Tj ET`);
  };

  // --- objects -------------------------------------------------------------------
  const objects: Uint8Array[] = [];
  const addObject = (id: number, body: string): void => {
    objects[id] = latin1(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const streamObject = async (id: number, content: string | Uint8Array, dict = ''): Promise<void> => {
    const raw = typeof content === 'string' ? latin1(content) : content;
    const packed = await deflate(raw, 'deflate');
    const data = packed ?? raw;
    objects[id] = concat([latin1(`${id} 0 obj\n<< /Length ${data.length}${packed ? ' /Filter /FlateDecode' : ''}${dict ? ` ${dict}` : ''} >>\nstream\n`), data, latin1('\nendstream\nendobj\n')]);
  };
  const pages = bands.length * slices.length;
  const idOf = (page: number): number => 4 + 2 * page;
  const pageText = (value: string, page: number): string => value.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages));

  let page = 0;
  for (const [a, b] of bands) {
    const bandTop = tops[a] as number;
    const rowsTop = bodyTop - headH;
    const bandBottom = rowsTop - ((tops[b] as number) - bandTop) * s;
    for (let si = 0; si < slices.length; si++) {
      const slice = slices[si] as { start: number; width: number };
      const withGrid = si === 0;
      page++;
      ops = [];
      const offset = withGrid ? gridW : 0;
      const chartLeft = rtl ? pageW - margin - offset - slice.width : margin + offset;
      const X = (px: number): number => (rtl ? pageW - margin - offset - (px * s - slice.start) : chartLeft + px * s - slice.start);
      const Y = (py: number): number => rowsTop - (py - bandTop) * s;
      const span = (x: number, w: number): [number, number] => {
        const p = X(x);
        const q = X(x + w);
        return [Math.min(p, q), Math.abs(q - p)];
      };
      const visible = (x: number, w: number): boolean => x * s < slice.start + slice.width && (x + w) * s > slice.start;
      const bandW = withGrid ? gridW + slice.width : slice.width;
      const left = rtl ? pageW - margin - bandW : margin;
      rect(c.background, left, bandBottom, bandW, bodyTop - bandBottom);

      // Grid pane (first slice of each band).
      if (withGrid && model.columns.length) {
        const gridLeft = rtl ? pageW - margin - gridW : margin;
        rect(c.headerBackground, gridLeft, rowsTop, gridW, headH);
        let acc = 0;
        const xs = colW.map((w) => {
          const x = rtl ? pageW - margin - acc - w : margin + acc;
          acc += w;
          return x;
        });
        model.columns.forEach((col, k) => text(col.header, xs[k] as number, rowsTop, colW[k] as number, headH, c.headerText, col.align ?? 'start', true));
        for (let r = a; r < b; r++) {
          const row = model.rows[r] as GanttPdfModel['rows'][number];
          const h = row.height * s;
          const y = Y(tops[r + 1] as number);
          model.columns.forEach((col, k) => {
            const indent = k === 0 ? row.depth * 10 * s : 0;
            const x = xs[k] as number;
            text(row.cells[k] ?? '', rtl ? x : x + indent, y, (colW[k] as number) - indent, h, c.text, col.align ?? 'start', row.parent);
          });
          line(c.line, [[gridLeft, y], [gridLeft + gridW, y]], 0.5);
        }
        for (let k = 0; k <= xs.length; k++) {
          const x = k < xs.length ? (rtl ? (xs[k] as number) + (colW[k] as number) : (xs[k] as number)) : rtl ? gridLeft : gridLeft + gridW;
          line(c.line, [[x, bodyTop], [x, bandBottom]], 0.5);
        }
        line(c.line, [[gridLeft, bodyTop], [gridLeft + gridW, bodyTop]], 0.5);
        line(c.line, [[gridLeft, rowsTop], [gridLeft + gridW, rowsTop]], 0.5);
      }

      if (slice.width > 0) {
        ops.push(`q ${n2(chartLeft)} ${n2(bandBottom)} ${n2(slice.width)} ${n2(bodyTop - bandBottom)} re W n`);
        // Shading and its vertical labels.
        for (const sh of model.shades) {
          if (!visible(sh.x, sh.width)) continue;
          const [x, w] = span(sh.x, sh.width);
          rect(sh.color, x, bandBottom, w, rowsTop - bandBottom);
          const shown = sh.label ? regular.fit(sh.label, rowsTop - bandBottom - 2 * pad, fs) : null;
          if (shown) ops.push(`BT /F1 ${n2(fs)} Tf ${color(c.text, 'rg')} 0 1 -1 0 ${n2(x + w / 2 + fs * 0.35)} ${n2(rowsTop - pad - shown.w)} Tm ${shown.s} Tj ET`);
        }
        // Row lines.
        for (let r = a; r < b; r++) line(c.line, [[chartLeft, Y(tops[r + 1] as number)], [chartLeft + slice.width, Y(tops[r + 1] as number)]], 0.5);
        // Timeline tiers.
        const tierH = headH / Math.max(1, model.tiers.length);
        model.tiers.forEach((tier, t) => {
          const y = bodyTop - (t + 1) * tierH;
          rect(c.headerBackground, chartLeft, y, slice.width, tierH);
          for (const cell of tier.cells) {
            if (!visible(cell.x, cell.width)) continue;
            const [x, w] = span(cell.x, cell.width);
            ops.push(`${color(c.line, 'RG')} 0.5 w [] 0 d ${n2(x)} ${n2(y)} ${n2(w)} ${n2(tierH)} re S`);
            // Centered in the part of the cell on this page.
            const x0 = Math.max(x, chartLeft);
            text(cell.text, x0, y, Math.min(x + w, chartLeft + slice.width) - x0, tierH, c.headerText, 'center');
          }
        });
        line(c.line, [[chartLeft, rowsTop], [chartLeft + slice.width, rowsTop]], 0.5);
        // Event markers.
        for (const m of model.markers) {
          if (!visible(m.x - 1, 2)) continue;
          const x = X(m.x);
          line(m.color, [[x, rowsTop], [x, bandBottom]], 1, '[3 2] 0');
          if (m.label) {
            const shown = regular.fit(m.label, usableW, fs);
            if (shown) ops.push(`BT /F1 ${n2(fs)} Tf ${color(m.color, 'rg')} ${n2(rtl ? x - pad - shown.w : x + pad)} ${n2(rowsTop - pad - fs)} Td ${shown.s} Tj ET`);
          }
        }
        // Bars.
        for (let r = a; r < b; r++) {
          for (const i of barsOf[r] as number[]) {
            const bar = model.bars[i] as GanttPdfBar;
            if (!visible(bar.x, bar.width + (bar.label ? 1e4 : bar.height))) continue;
            const top = (tops[r] as number) + bar.top;
            const yb = Y(top + bar.height);
            const h = bar.height * s;
            const px = (x: number, y: number): Pt => [X(x), Y(top + y)];
            const outline: string[] = [];
            if (bar.kind === 'milestone') {
              const cx = bar.x + bar.width / 2;
              const q = bar.height / 2;
              const pts = [px(cx, 0), px(cx + q, q), px(cx, bar.height), px(cx - q, q)];
              poly(bar.color, pts);
              if (bar.critical) outline.push(`${path(pts)} h S`);
            } else {
              const parts = bar.segments?.length ? bar.segments : [{ x: bar.x, width: bar.width }];
              let remain = (parts.reduce((t, p) => t + p.width, 0) * Math.min(100, Math.max(0, bar.progress))) / 100;
              parts.forEach((part, k) => {
                const [x, w] = span(part.x, part.width);
                rect(bar.color, x, yb, w, h);
                const done = Math.min(remain, part.width);
                remain -= done;
                if (done > 0 && bar.kind !== 'baseline') {
                  const [dx, dw] = span(part.x, done);
                  rect(bar.progressColor, dx, yb, dw, h);
                }
                if (bar.critical || bar.kind === 'unscheduled') outline.push(`${n2(x)} ${n2(yb)} ${n2(w)} ${n2(h)} re S`);
                const next = parts[k + 1];
                if (next) line(bar.color, [px(part.x + part.width, bar.height / 2), px(next.x, bar.height / 2)], 1, '[2 2] 0');
              });
              if (bar.kind === 'parent') {
                const t = bar.height * 0.6;
                const end = bar.x + bar.width;
                poly(bar.color, [px(bar.x, bar.height), px(bar.x, bar.height + t), px(bar.x + t, bar.height)]);
                poly(bar.color, [px(end, bar.height), px(end, bar.height + t), px(end - t, bar.height)]);
              }
            }
            if (outline.length) ops.push(`${color(bar.critical ? bar.progressColor : bar.color, 'RG')} 1 w ${bar.critical ? '[]' : '[2 2]'} 0 d ${outline.join(' ')}`);
            if (bar.label) {
              const shown = regular.fit(bar.label, usableW, fs);
              const end = bar.kind === 'milestone' ? bar.x + (bar.width + bar.height) / 2 : Math.max(bar.x + bar.width, ...(bar.segments ?? []).map((p) => p.x + p.width));
              const edge = X(end + 4);
              if (shown) ops.push(`BT /F1 ${n2(fs)} Tf ${color(c.text, 'rg')} ${n2(rtl ? edge - shown.w : edge)} ${n2(yb + (h - fs) / 2 + fs * 0.22)} Td ${shown.s} Tj ET`);
            }
          }
        }
        // Connectors with filled arrow heads, over the bars.
        const y0 = bandTop - 1;
        const y1 = (tops[b] as number) + 1;
        for (const cn of model.connectors) {
          const pts = cn.points;
          if (pts.length < 2) continue;
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const [x, y] of pts) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
          if (maxY < y0 || minY > y1 || !visible(minX - 8, maxX - minX + 16)) continue;
          const mapped = pts.map(([x, y]) => [X(x), Y(y)] as Pt);
          line(cn.color, mapped, Math.max(0.5, s), '');
          const [tx, ty] = mapped.at(-1) as Pt;
          const [fx, fy] = mapped.at(-2) as Pt;
          const len = Math.hypot(tx - fx, ty - fy) || 1;
          const dx = (tx - fx) / len;
          const dy = (ty - fy) / len;
          const bx = tx - dx * 6 * s;
          const by = ty - dy * 6 * s;
          const hw = 3.5 * s;
          poly(cn.color, [[tx, ty], [bx - dy * hw, by + dx * hw], [bx + dy * hw, by - dx * hw]]);
        }
        ops.push('Q');
      }
      if (headerText) text(pageText(headerText, page), margin, pageH - margin - lineH, usableW, lineH, '#000000', 'start', true, 8);
      if (footerText) text(pageText(footerText, page), margin, margin, usableW, lineH, '#000000', 'end', false, 8);
      await streamObject(idOf(page) + 1, ops.join('\n'));
      addObject(idOf(page), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(pageW)} ${n2(pageH)}] /Resources << /Font << /F1 3 0 R /F2 ${embedded && !embedded.bold ? 3 : 4} 0 R >> >> /Contents ${idOf(page) + 1} 0 R >>`);
      if (slicer.due()) await slicer.pause();
    }
  }

  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${idOf(i + 1)} 0 R`).join(' ')}] /Count ${pages} >>`);
  if (embedded) {
    // Type0 fonts at 3 (regular) and 4 (bold, or the regular CIDFont when bold is synthetic); the rest follow the pages.
    let next = idOf(pages + 1);
    let reserved4 = embedded.bold === null;
    const alloc = (): number => {
      if (reserved4) {
        reserved4 = false;
        return 4;
      }
      return next++;
    };
    await embedded.regular.write(3, alloc, addObject, streamObject);
    if (embedded.bold) await embedded.bold.write(4, alloc, addObject, streamObject);
  } else {
    addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    addObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  }
  addObject(5, `<< /Producer (Salmon UI)${model.title ? ` /Title ${textString(model.title)}` : ''} >>`);

  const out: Uint8Array[] = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let at = (out[0] as Uint8Array).length;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    const o = objects[id] as Uint8Array;
    xref += `${String(at).padStart(10, '0')} 00000 n \n`;
    out.push(o);
    at += o.length;
  }
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${at}\n%%EOF\n`;
  out.push(latin1(xref));
  const name = options.fileName ?? 'Gantt.pdf';
  return { fileName: /\.pdf$/i.test(name) ? name : `${name}.pdf`, mimeType: 'application/pdf', data: concat(out) };
}
