// Print projection: the export model rendered as one static
// HTML table, every row of the print scope, no virtualization. Loaded with
// dynamic `import()` by `api.print()`, so the default DataGrid bundle never
// carries it. DOM-free: it returns markup the caller inserts once (one
// `innerHTML` parse instead of 200k `createElement` calls for 10k x 20).

import type { ExportAggregateCells, ExportCell, ExportColumn, ExportModel, ExportRow } from '@salmonui/data-grid/engine/export';

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const SPECIAL = /[&<>"]/;
const SPECIAL_ALL = /[&<>"]/g;

/** HTML text escape; the common case (no special character) returns the input. */
export function escapeHtml(text: string): string {
  return SPECIAL.test(text) ? text.replace(SPECIAL_ALL, (c) => ESCAPES[c] as string) : text;
}

const ALIGN: Readonly<Record<string, string>> = { start: '', center: ' class="salmon-data-grid-print__center"', end: ' class="salmon-data-grid-print__end"' };

export interface PrintTableOptions {
  /** Accessible name of the table (the grid's `aria-label`). */
  readonly label?: string;
}

/** Markup of one print table (nested for child grids). */
export function renderPrintTable<Row>(model: ExportModel<Row>, options: PrintTableOptions = {}): string {
  const out: string[] = [];
  write(model, options.label, out);
  return out.join('');
}

function write<Row>(model: ExportModel<Row>, label: string | undefined, out: string[]): void {
  const columns = model.columns;
  const count = columns.length;
  out.push(`<table class="salmon-data-grid-print__table"${label ? ` aria-label="${escapeHtml(label)}"` : ''}${model.direction === 'rtl' ? ' dir="rtl"' : ''}><colgroup>`);
  for (const c of columns) out.push(`<col style="width:${Math.max(1, Math.round(c.width))}px">`);
  out.push('</colgroup><thead>');
  for (const row of model.headerRows) {
    out.push('<tr>');
    for (const h of row) {
      out.push(`<th scope="${h.leaf ? 'col' : 'colgroup'}"${h.colSpan > 1 ? ` colspan="${h.colSpan}"` : ''}${h.rowSpan > 1 ? ` rowspan="${h.rowSpan}"` : ''}${ALIGN[h.leaf ? h.textAlign : 'center']}>${escapeHtml(h.text)}</th>`);
    }
    out.push('</tr>');
  }
  out.push('</thead><tbody>');
  const aligns = columns.map((c) => ALIGN[c.textAlign] as string);
  const hook = model.hasCellHook;
  // Per-row strings: one push per row keeps the part array small for 10k rows.
  for (const r of model.rows()) out.push(rowHtml(model, r, columns, aligns, count, hook));
  out.push('</tbody>');
  if (model.footerRows.length) {
    out.push('<tfoot>');
    for (const f of model.footerRows) out.push(`<tr class="salmon-data-grid-print__aggregate">${aggregateCells(f.aggregates, aligns, count, null)}</tr>`);
    out.push('</tfoot>');
  }
  out.push('</table>');
}

function rowHtml<Row>(
  model: ExportModel<Row>,
  r: ExportRow<Row>,
  columns: readonly ExportColumn<Row>[],
  aligns: readonly string[],
  count: number,
  hook: boolean,
): string {
  switch (r.kind) {
    case 'data': {
      let html = r.depth ? `<tr data-depth="${r.depth}">` : '<tr>';
      // Tree mode: the tree column is indented by depth.
      const treeAt = model.tree && r.depth ? model.tree.column : -1;
      const pad = (c: number): string => (c === treeAt ? ` style="padding-inline-start:${r.depth * 1.25}rem"` : '');
      if (hook) {
        let skip = 0;
        for (let c = 0; c < count; c++) {
          if (skip > 0) {
            skip--;
            continue;
          }
          const cell: ExportCell = model.cell(r, columns[c] as ExportColumn<Row>);
          const span = cell.colSpan && cell.colSpan > 1 ? Math.min(cell.colSpan, count - c) : 1;
          skip = span - 1;
          html += `<td${span > 1 ? ` colspan="${span}"` : ''}${aligns[c]}${pad(c)}>${escapeHtml(cell.text)}</td>`;
        }
      } else {
        const data = r.row;
        for (let c = 0; c < count; c++) html += `<td${aligns[c]}${pad(c)}>${escapeHtml((columns[c] as ExportColumn<Row>).text(data))}</td>`;
      }
      return `${html}</tr>`;
    }
    case 'group':
      return `<tr class="salmon-data-grid-print__caption" data-depth="${r.depth}">${aggregateCells(r.aggregates, aligns, count, r.caption)}</tr>`;
    case 'groupFooter':
    case 'aggregate':
      return `<tr class="salmon-data-grid-print__aggregate">${aggregateCells(r.aggregates, aligns, count, null)}</tr>`;
    case 'detail': {
      const detail = r.detail;
      let inner = '';
      if (detail.model) {
        const nested: string[] = [];
        write(detail.model, undefined, nested);
        inner = nested.join('');
      } else if (detail.text?.length) {
        inner = detail.text.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
      }
      return `<tr class="salmon-data-grid-print__detail" data-depth="${r.depth}"><td colspan="${count}">${inner}</td></tr>`;
    }
  }
}

function aggregateCells(cells: ExportAggregateCells, aligns: readonly string[], count: number, caption: string | null): string {
  if (caption !== null) {
    // The caption spans the columns up to the first caption aggregate.
    let first = count;
    for (let c = 0; c < count; c++) {
      if (cells[c]) {
        first = c;
        break;
      }
    }
    let html: string;
    if (first === 0) {
      html = `<td${aligns[0]}>${escapeHtml(cells[0] ? `${caption} ${cells[0].text}` : caption)}</td>`;
      first = 1;
    } else html = `<td colspan="${first}">${escapeHtml(caption)}</td>`;
    for (let c = first; c < count; c++) html += `<td${aligns[c]}>${escapeHtml(cells[c]?.text ?? '')}</td>`;
    return html;
  }
  let html = '';
  for (let c = 0; c < count; c++) html += `<td${aligns[c]}>${escapeHtml(cells[c]?.text ?? '')}</td>`;
  return html;
}
