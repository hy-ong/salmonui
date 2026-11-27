// The React CSV writers escape formulas by default, and the internal
// rule stays equal to the core one.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeCsvFormula as coreEscape, isFormulaText as coreIsFormula } from '@salmonui/core/export-model';
import { exportCsv as ganttCsv } from '../../gantt/dist/gantt/export.js';
import { escapeCsvFormula, isFormulaText } from '../../core/dist/csv-formula.js';
import { writeXlsx } from '@salmonui/export/xlsx';
import { schedulerExportModel, writeSchedulerCsv } from '../dist/internal/scheduler/export.js';
import { createZoneConverter } from '../dist/internal/scheduler/time.js';
import { tableBlob, tableCsv, tableExportModel } from '../../charts/dist/internal/viz/export-data.js';
import { run } from '../../charts/dist/internal/viz/instance-run.js';
import { exportPivotTable, pivotCsv } from '../../pivot-table/dist/pivot-table/export-impl.js';

describe('internal rule', () => {
  it('equals the core rule', () => {
    const texts = ['', 'plain', '=1', '+1', '-1', '@x', '\t1', '\rx', ' =1', '\n-x', ' @x', 'a=b', '-1,234.50', '-$5', '-US$1', '-A1', '-12%', '-5 kg', '-1e-7', '٣', '-٣'];
    for (const t of texts) {
      assert.equal(isFormulaText(t), coreIsFormula(t), JSON.stringify(t));
      for (const v of [undefined, t, -1, -1n]) assert.equal(escapeCsvFormula(t, v), coreEscape(t, v), JSON.stringify([t, String(v)]));
    }
  });
});

describe('writeSchedulerCsv formula default', () => {
  const ny = createZoneConverter('America/New_York');
  const table = {
    columns: [
      { key: 't', role: null, field: 't', headerText: '=Head', type: 'string', width: 1 },
      { key: 'n', role: null, field: 'n', headerText: 'n', type: 'number', width: 1 },
    ],
    rows: [['=1+1, x', -5]],
  } as never;
  it('escapes text and header by default and keeps a negative number', () => {
    assert.equal(writeSchedulerCsv(table, ny), `'=Head,n\r\n"'=1+1, x",-5\r\n`);
  });
  it('false keeps raw text', () => {
    assert.equal(writeSchedulerCsv(table, ny, { escapeFormulas: false }), '=Head,n\r\n"=1+1, x",-5\r\n');
  });
});

describe('Pivot CSV fallback formula default', () => {
  const result = {
    columnCount: 1,
    rowCount: 1,
    columnTree: [{ kind: 'member', position: 0, span: 1, label: '=col' }],
    memberAt: () => ({ kind: 'member', depth: 1, label: '=evil, x' }),
    valueAt: () => -5,
  } as never;
  const text = ((key: string) => (key === 'rowLabels' ? 'Rows' : key)) as never;
  it('escapes labels by default (before the indent) and keeps a negative value', () => {
    assert.equal(pivotCsv(result, text), `Rows,'=col\r\n"'  =evil, x",-5\r\n`);
  });
  it('false keeps raw text', () => {
    assert.equal(pivotCsv(result, text, false), 'Rows,=col\r\n"  =evil, x",-5\r\n');
  });
  it('api options reach the fallback and the loaded writer', async () => {
    const pivot = { result, handlers: {} } as never;
    const raw = await exportPivotTable(pivot, 'csv', { download: false, escapeFormulas: false }, undefined, text);
    assert.ok(String(raw?.data).includes('"  =evil, x"'));
    const seen: Record<string, unknown>[] = [];
    const writers = { pivot: async () => ({ exportPivot: async (_: unknown, o?: Record<string, unknown>) => (seen.push(o ?? {}), { fileName: 'p.csv', mimeType: 'text/csv', data: '' }) }) };
    await exportPivotTable(pivot, 'csv', { download: false, escapeFormulas: false, csv: { bom: true } }, writers, text);
    assert.deepEqual(seen[0]?.csv, { bom: true, escapeFormulas: false });
    assert.equal('escapeFormulas' in (seen[0] as object), false);
  });
});

describe('Gantt CSV', () => {
  it('passes escapeFormulas to the grid pane writer, leaving the default to it', async () => {
    const seen: Record<string, unknown>[] = [];
    const g = { props: {}, gridApi: { exportToCsv: async (o: Record<string, unknown>) => (seen.push(o), { fileName: 'g.csv', mimeType: 'text/csv', data: '' }) } } as never;
    await ganttCsv(g, {});
    await ganttCsv(g, { escapeFormulas: false });
    assert.equal(seen[0]?.escapeFormulas, undefined);
    assert.equal(seen[1]?.escapeFormulas, false);
  });
});

describe('XLSX quote prefix through the React models', () => {
  const stored = async (model: never): Promise<string> => Buffer.from(await writeXlsx(model, { compress: false })).toString('utf8');
  it('Scheduler text cells', async () => {
    const table = { columns: [{ key: 't', role: null, field: 't', headerText: 'Title', type: 'string', width: 1 }], rows: [['=1+1']] } as never;
    const xml = await stored(schedulerExportModel(table, { zone: createZoneConverter('UTC') }) as never);
    assert.match(xml, /quotePrefix="1"/);
    assert.doesNotMatch(xml, /<f>/);
    assert.match(xml, /<t[^>]*>=1\+1<\/t>/);
  });
  it('Chart table cells; plain numbers stay numbers', async () => {
    const xml = await stored(tableExportModel({ columns: ['x', 'n'], rows: [['=SUM(A1)', '-3']] }) as never);
    assert.match(xml, /quotePrefix="1"/);
    assert.doesNotMatch(xml, /<f>/);
    assert.match(xml, /<v>-3<\/v>/);
  });
});

describe('visualization table CSV', () => {
  const table = { columns: ['=x', 'North'], rows: [['=SUM(A1)', '-3'], ['-text', '-1,200.50']] };

  it('Chart: escapes text by default, keeps negative numbers, false keeps raw', async () => {
    assert.equal(tableCsv(table), `'=x,North\r\n'=SUM(A1),-3\r\n'-text,"-1,200.50"\r\n`);
    assert.equal(tableCsv(table, false), '=x,North\r\n=SUM(A1),-3\r\n-text,"-1,200.50"\r\n');
    assert.equal(await (await tableBlob(table, 'csv', undefined, 'S', false)).text(), tableCsv(table, false));
  });

  it('figure families: the same output through api.export', async () => {
    const saved: Blob[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const restore = { document: g.document, setTimeout: g.setTimeout };
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = (b: Blob) => (saved.push(b), 'blob:x');
    URL.revokeObjectURL = () => {};
    g.document = { createElement: () => ({ style: {}, click() {}, remove() {} }), body: { append() {} } };
    g.setTimeout = () => 0;
    try {
      const source = { root: () => null, name: 'heat-map', csv: () => table };
      await run(source, 'export', { format: 'csv' });
      await run(source, 'export', { format: 'csv', escapeFormulas: false });
    } finally {
      g.document = restore.document;
      g.setTimeout = restore.setTimeout;
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
    assert.equal(await saved[0]?.text(), `'=x,North\r\n'=SUM(A1),-3\r\n'-text,"-1,200.50"`);
    assert.equal(await saved[1]?.text(), '=x,North\r\n=SUM(A1),-3\r\n-text,"-1,200.50"');
  });
});
