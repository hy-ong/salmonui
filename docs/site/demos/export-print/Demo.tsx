'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import {
  downloadBlob,
  DataGrid,
  serializeDataGridState,
  type DataGridAggregateRow,
  type DataGridApi,
  type DataGridColumn,
  type DataGridExportWriters,
} from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { exportOrderColumns, exportOrders, regionTargets, type RegionTarget } from '../../lib/export-demo';
import type { Order } from '../../lib/fixtures';
import { demoFetch } from '../../lib/remote';

// Lookup rows of the `category` column: the grid and the export show `title`, not the key.
const categories = [
  { code: 'Coffee', title: 'Coffee beans' },
  { code: 'Tea', title: 'Loose-leaf tea' },
  { code: 'Equipment', title: 'Brewing equipment' },
];

const columns: DataGridColumn<Order>[] = [
  // The shared core definitions (also used by the server export route), plus React-only fields.
  // Amount is widened so its footer sum fits.
  ...exportOrderColumns.map((column): DataGridColumn<Order> =>
    column.field === 'discount' ? { ...column, printable: false } : column.field === 'amount' ? { ...column, width: 170 } : column,
  ),
  { field: 'category', header: 'Category', width: 150, lookup: { data: categories, keyField: 'code', displayField: 'title' } },
  {
    field: 'shipped',
    header: 'Status',
    width: 110,
    // A React template never becomes export text by itself; the `cell` hook below supplies it.
    renderCell: ({ value }) => (
      <span className="demo-badge" {...(value ? { 'data-tone': 'success' } : {})}>
        {value ? 'Shipped' : 'Pending'}
      </span>
    ),
  },
  // Hidden in the grid; `includeHiddenColumns: true` exports it.
  { field: 'note', header: 'Note', width: 200, hidden: true },
];

const targetColumns: DataGridColumn<RegionTarget>[] = [
  { field: 'region', header: 'Region', width: 120 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'target', header: 'Target', type: 'number', format: 'C0', align: 'end', width: 130 },
  { id: 'stretch', header: 'Stretch (+10%)', type: 'number', format: 'C0', align: 'end', width: 140, valueGetter: (row) => Math.round(row.target * 1.1) },
];

// Module-level: the dynamic imports keep both writers out of the page bundle until first use.
const writers: DataGridExportWriters = {
  excel: () => import('@salmonui/export/xlsx'),
  pdf: () => import('@salmonui/export/pdf'),
};

const aggregates: DataGridAggregateRow<Order>[] = [{ columns: [{ field: 'amount', type: 'sum', format: 'C2' }] }];

// A 12 x 12 PNG drawn into the Status cell of shipped orders.
const FLAG_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAE0lEQVR4nGN4EWtPEDGMKhqMigCvX9pBVGrfQQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const PRINT_SCOPE_OPTIONS = [
  { value: 'all', label: 'All pages' },
  { value: 'page', label: 'Current page' },
];

export default function ExportPrintDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const targetsApi = useRef<DataGridApi<RegionTarget> | null>(null);
  const fontInput = useRef<HTMLInputElement | null>(null);
  const [log, push] = useEventLog();
  const [scope, setScope] = useState<'all' | 'page'>('all');

  const serverExport = async (format: 'excel' | 'csv') => {
    const grid = api.current;
    if (!grid) return;
    const response = await demoFetch('/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format, state: serializeDataGridState(grid.getState()) }),
    });
    const blob = await response.blob();
    push(`server export ${format}: ${response.status}, ${blob.size} bytes`);
    downloadBlob(blob, format === 'csv' ? 'orders-server.csv' : 'orders-server.xlsx');
  };

  return (
    <>
      <div className="demo-toolbar" aria-label="Export and print">
        <Button
          variant="outline"
          onClick={() =>
            void api.current?.exportToExcel({
              fileName: 'orders',
              sheetName: 'Orders',
              // excelQueryCellInfo: highlight large orders.
              cell: ({ column, value }) => (column.field === 'amount' && typeof value === 'number' && value > 1000 ? { style: { bold: true, color: '#B00020' } } : undefined),
            })
          }
        >
          Excel with a cell hook
        </Button>
        <Button variant="outline" onClick={() => void api.current?.exportToPdf({ orientation: 'landscape', header: 'Orders', footer: 'Page {page} of {pages}' })}>
          PDF, landscape
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            // exportGroupCaption / excelAggregateQueryCellInfo: rewrite captions and aggregate cells, and count the calls.
            const calls = { captions: 0, aggregates: 0 };
            void api.current
              ?.exportToCsv({
                fileName: 'orders-by-country',
                groupCaption: (ctx) => {
                  calls.captions++;
                  return `${ctx.formattedKey} (${ctx.count} orders)`;
                },
                aggregateCell: (ctx) => {
                  calls.aggregates++;
                  return ctx.placement === 'footer' ? { text: `Total ${ctx.text}` } : undefined;
                },
              })
              .then(() => push(`hooks: groupCaption ${calls.captions}, aggregateCell ${calls.aggregates}`));
          }}
        >
          CSV with caption and aggregate hooks
        </Button>
        <Button variant="outline" onClick={() => void api.current?.exportToCsv({ pages: 'current', fileName: 'orders-page' })}>
          CSV of the current page
        </Button>
        <label>
          Print scope
          <Select aria-label="Print scope" data={PRINT_SCOPE_OPTIONS} value={scope} onValueChange={(value) => value != null && setScope(value as 'all' | 'page')} />
        </label>
      </div>
      <div className="demo-toolbar" aria-label="Export options">
        <Button
          variant="outline"
          onClick={() => {
            const rows = api.current?.getSelectedRows() ?? [];
            if (rows.length === 0) push('select rows first (Ctrl or Shift click)');
            // custom rows with the grid's columns.
            else void api.current?.exportToExcel({ fileName: 'selected-orders', rows });
          }}
        >
          Excel of the selected rows
        </Button>
        <Button variant="outline" onClick={() => void api.current?.exportToCsv({ fileName: 'orders-with-notes', includeHiddenColumns: true })}>
          CSV with hidden columns
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void api.current?.exportToExcel({
              fileName: 'orders-templates',
              // Templated column: its text (and an image for shipped orders) comes from the hook.
              cell: ({ column, row }) => {
                if (column.field !== 'shipped') return undefined;
                const label = row.shipped ? 'Shipped' : 'Pending';
                return { text: label, ...(row.shipped ? { image: { data: FLAG_PNG, type: 'png' as const, width: 12, height: 12 } } : {}) };
              },
            })
          }
        >
          Excel with template text and images
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void api.current?.exportToExcel({
              fileName: 'orders-details',
              // a detail block after every row that has a note.
              hierarchy: 'all',
              detail: ({ row }) => (row.note ? { text: [`Note: ${row.note}`] } : null),
            })
          }
        >
          Excel with detail rows
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void api.current?.exportToExcel({ fileName: 'orders-and-targets', grids: targetsApi.current ? [targetsApi.current] : [], layout: 'sheets', sheetNames: ['Orders', 'Targets'] })
          }
        >
          Workbook: both grids, one sheet each
        </Button>
        <Button variant="outline" onClick={() => void api.current?.exportToExcel({ fileName: 'orders-stacked', grids: targetsApi.current ? [targetsApi.current] : [], layout: 'stacked', gap: 2 })}>
          Workbook: both grids stacked
        </Button>
        <Button variant="outline" onClick={() => fontInput.current?.click()}>
          PDF with a TrueType font…
        </Button>
        {/* The native file input stays hidden; the button above opens its file dialog. */}
        <input
          ref={fontInput}
          type="file"
          hidden
          aria-label="PDF with a TrueType font"
          accept=".ttf,.ttc,font/ttf"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            // the font is embedded (subsetted) so any script it covers prints.
            const font = new Uint8Array(await file.arrayBuffer());
            await api.current?.exportToPdf({ fileName: 'orders-unicode', font, header: 'Заказы · 注文 · الطلبات', orientation: 'landscape' });
          }}
        />
        <Button variant="outline" onClick={() => void serverExport('excel')}>
          Server export (Excel)
        </Button>
        <Button variant="outline" onClick={() => void serverExport('csv')}>
          Server export (CSV)
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders to export and print"
        ref={api}
        data={exportOrders}
        columns={columns}
        height={420}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        selection={{ multiple: true }}
        sorting
        grouping={{ groupBy: ['country'] }}
        aggregates={aggregates}
        paging={{ pageSize: 100 }}
        toolbar={['exportExcel', 'exportPdf', 'exportCsv', 'print']}
        // The grid is read-only here: the context menu offers copy and the exports only.
        contextMenu={['copy', 'exportExcel', 'exportPdf', 'exportCsv']}
        exportWriters={writers}
        printing={{ scope }}
        onBeforeExport={(event) => push(`beforeExport ${event.format} (${event.source})`)}
        onExport={(event) => push(`export ${event.format}: ${event.file.fileName}`)}
        onBeforePrint={(event) => push(`beforePrint ${event.scope} (${event.source})`)}
        onAfterPrint={() => push('afterPrint')}
      />
      <div className="demo-toolbar" aria-label="Targets export" style={{ marginBlockStart: 'var(--salmon-space-4)' }}>
        <Button
          variant="outline"
          onClick={() =>
            void targetsApi.current?.exportToExcel({
              fileName: 'targets',
              // equal adjacent regions become one merged cell.
              mergeRepeatedValues: true,
              // the stretch column is written as a live formula.
              cell: ({ column, row }) => (column.id === 'stretch' ? { formula: `ROUND(${row.target}*1.1,0)` } : undefined),
            })
          }
        >
          Targets: merged regions and formulas
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void targetsApi.current?.exportToPdf({
              fileName: 'targets',
              // equal adjacent regions become one merged cell, in PDF too.
              mergeRepeatedValues: true,
              // a cell hook span covers the target and stretch cells of one row.
              cell: ({ column, rowId }) => (rowId === 'pt' && column.field === 'target' ? { text: 'Under review', colSpan: 2 } : undefined),
            })
          }
        >
          Targets PDF: merged regions and a spanned cell
        </Button>
      </div>
      <DataGrid<RegionTarget>
        aria-label="Regional targets"
        ref={targetsApi}
        data={regionTargets}
        getRowId={(row) => row.id}
        columns={targetColumns}
        height="auto"
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        exportWriters={writers}
        onExport={(event) => push(`targets export ${event.format}: ${event.file.fileName}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
