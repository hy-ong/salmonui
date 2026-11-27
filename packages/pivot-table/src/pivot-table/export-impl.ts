// Export and print implementation (lazy chunk, loaded on the first export).
// Excel, PDF and CSV call `exportPivot()` of the writer module the app
// passes; without it CSV is built here; print is built here from the result.

import type { PivotHeaderNode, PivotResult } from '@salmonui/pivot-table/engine';
import { escapeCsvFormula } from '@salmonui/core/export-model';
import { gridEvent } from '@salmonui/core/internal/events';
import type { PivotController } from './controller.js';
import type { PivotExportFile, PivotExportOptions, PivotExportWriters } from './export.js';
import type { PivotText } from './locale.js';
import type { PivotExportEvent } from './types.js';

type Format = 'xlsx' | 'csv' | 'pdf' | 'print';

const label = (node: PivotHeaderNode, text: PivotText): string => (node.kind === 'grandTotal' ? text('grandTotal') : node.label);

/** Column header label of a leaf position: its ancestors' labels joined (`2026 / Q1 / Sum of Amount`). */
function columnPath(result: PivotResult, c: number, text: PivotText): string {
  const parts: string[] = [];
  let nodes = result.columnTree;
  for (;;) {
    const node = nodes.find((n) => c >= n.position && c < n.position + n.span);
    if (!node) break;
    parts.push(label(node, text));
    if (!node.children?.length) break;
    nodes = node.children;
  }
  return parts.join(' / ');
}

const csvQuote = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** CSV of the whole result: one header line of leaf column paths, then one line per visible row (raw numbers). */
export function pivotCsv(result: PivotResult, text: PivotText, escapeFormulas = true): string {
  const csvField = (value: string): string => csvQuote(escapeFormulas ? escapeCsvFormula(value) : value);
  const lines: string[] = [];
  const header = [text('rowLabels')];
  for (let c = 0; c < result.columnCount; c++) header.push(columnPath(result, c, text));
  lines.push(header.map(csvField).join(','));
  for (let r = 0; r < result.rowCount; r++) {
    const node = result.memberAt('rows', r);
    const cells = [csvField(`${'  '.repeat(Math.max(0, node.kind === 'grandTotal' ? 0 : node.depth))}${label(node, text)}`)];
    for (let c = 0; c < result.columnCount; c++) {
      const v = result.valueAt(r, c);
      cells.push(v === null ? '' : String(v));
    }
    lines.push(cells.join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function download(data: Uint8Array | string | Blob, fileName: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Prints the result as a plain table in a hidden frame (DOM APIs, no HTML strings). */
function printResult(result: PivotResult, text: PivotText): void {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-start:-10000px;width:1px;height:1px;border:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  const style = doc.createElement('style');
  style.textContent = 'table{border-collapse:collapse;font:12px system-ui,sans-serif}th,td{border:1px solid #999;padding:2px 6px}td{text-align:end}th[scope=row]{text-align:start;font-weight:normal}';
  doc.head.append(style);
  const table = doc.createElement('table');
  const head = doc.createElement('thead');
  const tr = doc.createElement('tr');
  const corner = doc.createElement('th');
  corner.textContent = text('rowLabels');
  tr.append(corner);
  for (let c = 0; c < result.columnCount; c++) {
    const th = doc.createElement('th');
    th.scope = 'col';
    th.textContent = columnPath(result, c, text);
    tr.append(th);
  }
  head.append(tr);
  const body = doc.createElement('tbody');
  for (let r = 0; r < result.rowCount; r++) {
    const node = result.memberAt('rows', r);
    const row = doc.createElement('tr');
    const th = doc.createElement('th');
    th.scope = 'row';
    th.style.paddingInlineStart = `${6 + 16 * Math.max(0, node.kind === 'grandTotal' ? 0 : node.depth)}px`;
    th.textContent = label(node, text);
    row.append(th);
    for (let c = 0; c < result.columnCount; c++) {
      const td = doc.createElement('td');
      td.textContent = result.cellAt(r, c).formattedValue;
      row.append(td);
    }
    body.append(row);
  }
  table.append(head, body);
  doc.body.append(table);
  win.focus();
  win.print();
  setTimeout(() => frame.remove(), 1000);
}

/** One export or print: `onBeforeExport` (cancellable), the file, `onExport`. Resolves with the file. */
export async function exportPivotTable(pivot: PivotController<unknown>, format: Format, options: PivotExportOptions = {}, writers: PivotExportWriters | undefined, text: PivotText): Promise<PivotExportFile | null> {
  const result = pivot.result;
  if (!result) return null;
  const fileName = options.fileName ?? 'pivot';
  const handlers = pivot.handlers;
  if (handlers.onBeforeExport) {
    const before = gridEvent<PivotExportEvent>('beforeExport', 'api', { format, fileName });
    handlers.onBeforeExport(before);
    if (before.defaultPrevented) return null;
  }
  let out: PivotExportFile | null = null;
  try {
    const loader = writers?.pivot;
    if (format === 'print') printResult(result, text);
    else if (format === 'csv' && !loader) {
      out = { fileName: `${fileName}.csv`, mimeType: 'text/csv', data: pivotCsv(result, text, options.escapeFormulas !== false) };
      if (options.download !== false) download(out.data, out.fileName, out.mimeType);
    } else {
      if (!loader) throw new Error(`exportTo${format === 'xlsx' ? 'Excel' : 'Pdf'}: pass exportWriters.pivot (a dynamic import of the pivot subpath of the @salmonui/export package).`);
      const module = await loader();
      const { download: shouldDownload, escapeFormulas, ...rest } = options;
      const csv = format === 'csv' && escapeFormulas !== undefined ? { csv: { ...(rest.csv as object | undefined), escapeFormulas } } : {};
      const file = await module.exportPivot(result, { ...rest, ...csv, format, fileName });
      out = file;
      if (file && shouldDownload !== false) download(file.data, file.fileName, file.mimeType);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (handlers.onError) handlers.onError(gridEvent('error', 'api', { error: err, action: 'export' }));
    else throw err;
    return null;
  }
  handlers.onExport?.(gridEvent<PivotExportEvent>('export', 'api', { format, fileName }));
  return out;
}
