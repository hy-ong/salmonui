// Scheduler export and import glue: a lazy
// chunk loaded by the first `exportTo*` / `importICalendar` call. The pure
// mapping is `internal/scheduler/export.ts`; the XLSX and iCalendar writers
// come from the `exportWriters` loaders (`@salmonui/export`), never
// imported here.

import { buildExportTable, fromICalendarEvents, schedulerExportModel, toICalendarEvents, writeSchedulerCsv, type SchedulerICalendarEvent } from '../internal/scheduler/export.js';
import type { EventRecord, TimeRange } from '../internal/scheduler/types.js';
import type { RecordContext } from './model.js';
import type { SchedulerCsvExportOptions, SchedulerExcelExportOptions, SchedulerExportFile, SchedulerExportWriters, SchedulerICalendarExportOptions, SchedulerICalendarImportOptions, SchedulerTableExportOptions } from './types.js';

export interface ExportHost<Row> {
  readonly records: readonly EventRecord<Row>[];
  /** Records of `rows` (the `customData` override). */
  readonly recordsOf: (rows: readonly Row[]) => readonly EventRecord<Row>[];
  readonly ctx: RecordContext;
  /** The visible range (default range of `includeOccurrences`). */
  readonly range: TimeRange | null;
  readonly locale: string;
  readonly direction: 'ltr' | 'rtl';
  readonly writers: SchedulerExportWriters | undefined;
  readonly doc: Document | undefined;
}

type Writer = (...args: unknown[]) => unknown;

const DEFAULT_NAME = 'Schedule';

function withExtension(name: string | undefined, ext: string): string {
  const base = name?.trim() || DEFAULT_NAME;
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

function table<Row>(host: ExportHost<Row>, o: SchedulerTableExportOptions<Row>) {
  const range = o.range ? { start: o.range.start.getTime(), end: o.range.end.getTime() } : (host.range ?? undefined);
  return buildExportTable(o.rows ? (host.recordsOf(o.rows) as EventRecord<Row>[]) : (host.records as EventRecord<Row>[]), host.ctx, {
    fields: o.fields,
    headerTexts: o.headerTexts,
    includeOccurrences: o.includeOccurrences,
    range,
  });
}

export async function excelFile<Row>(host: ExportHost<Row>, o: SchedulerExcelExportOptions<Row>): Promise<SchedulerExportFile<Uint8Array>> {
  const load = host.writers?.excel;
  if (!load) throw new Error('exportToExcel: the Scheduler has no exportWriters.excel loader (a dynamic import of @salmonui/export/xlsx).');
  const model = schedulerExportModel(table(host, o), { zone: host.ctx.zone, locale: host.locale, direction: host.direction });
  const { exportXlsx } = await load();
  const file = (await (exportXlsx as Writer)(model, { fileName: withExtension(o.fileName, 'xlsx'), ...(o.sheetName ? { sheetName: o.sheetName } : {}) })) as SchedulerExportFile<Uint8Array> | null;
  if (!file) throw new Error('exportToExcel: the writer returned no file.');
  return file;
}

export function csvFile<Row>(host: ExportHost<Row>, o: SchedulerCsvExportOptions<Row>): SchedulerExportFile<string> {
  const data = writeSchedulerCsv(table(host, o), host.ctx.zone, { separator: o.separator, includeHeaders: o.includeHeaders, bom: o.bom, escapeFormulas: o.escapeFormulas });
  return { fileName: withExtension(o.fileName, 'csv'), mimeType: 'text/csv', data };
}

export async function icsFile<Row>(host: ExportHost<Row>, o: SchedulerICalendarExportOptions<Row>): Promise<SchedulerExportFile<string>> {
  const load = host.writers?.ics;
  if (!load) throw new Error('exportToICalendar: the Scheduler has no exportWriters.ics loader (a dynamic import of @salmonui/export/ics).');
  const records = o.rows ? host.recordsOf(o.rows) : host.records;
  const uid = o.uid;
  const extra = o.extra;
  const events = toICalendarEvents(records as EventRecord<Row>[], host.ctx, {
    utc: o.utc,
    ...(uid ? { uid: (e: EventRecord<Row>) => uid(e.row) } : {}),
    ...(extra ? { extra: (e: EventRecord<Row>) => extra(e.row) } : {}),
  });
  const { exportICalendar } = await load();
  return (exportICalendar as Writer)(events, {
    fileName: withExtension(o.fileName, 'ics'),
    timeZone: host.ctx.zone.zone,
    ...(o.calendarName ? { calendarName: o.calendarName } : {}),
    ...(o.prodId ? { prodId: o.prodId } : {}),
  }) as SchedulerExportFile<string>;
}

/** Rows of an iCalendar file or text. */
export async function importRows<Row>(host: ExportHost<Row>, source: string | Blob, o: SchedulerICalendarImportOptions<Row>): Promise<Row[]> {
  const load = host.writers?.ics;
  if (!load) throw new Error('importICalendar: the Scheduler has no exportWriters.ics loader (a dynamic import of @salmonui/export/ics).');
  const text = typeof source === 'string' ? source : await source.text();
  const { parseICalendar } = await load();
  const doc = (parseICalendar as Writer)(text) as { readonly events: readonly SchedulerICalendarEvent[] };
  return fromICalendarEvents<Row>(doc.events, host.ctx, o.map ? { map: o.map as (row: Record<string, unknown>, event: SchedulerICalendarEvent) => Row } : {});
}

/** Saves a file through a temporary object URL; false outside a browser. */
export function download(file: SchedulerExportFile, doc: Document | undefined): boolean {
  const url = typeof URL === 'undefined' ? undefined : URL;
  if (!doc?.body || typeof url?.createObjectURL !== 'function' || typeof Blob === 'undefined') return false;
  const href = url.createObjectURL(new Blob([file.data as BlobPart], { type: file.mimeType }));
  const a = doc.createElement('a');
  a.href = href;
  a.download = file.fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => url.revokeObjectURL(href), 1000);
  return true;
}
