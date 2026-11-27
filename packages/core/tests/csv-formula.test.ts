// CSV formula escaping is on by default.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, type DataGridModule } from '@salmonui/data-grid/engine';
import { createExportModel, escapeCsvFormula, exportCsv, isFormulaText, streamCsv, writeCsv } from '@salmonui/core/export-model';
import { createExportModule } from '@salmonui/data-grid/engine/export';

interface Row {
  readonly id: string;
  readonly note: string;
  readonly qty: number;
}

const engineOf = (rows: readonly Row[]) =>
  createDataGridEngine<Row, readonly DataGridModule<Row, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns: [
      { field: 'note', header: 'Note' },
      { field: 'qty', header: 'Qty', type: 'number', format: 'N2' },
    ],
    dataSource: rows,
    modules: [createExportModule<Row>()],
  });

const modelOf = (rows: readonly Row[]) => createExportModel(engineOf(rows), {});
const body = (csv: string): string[] => csv.trimEnd().split('\r\n').slice(1);

describe('escapeCsvFormula', () => {
  it('prefixes every trigger, also after leading whitespace', () => {
    for (const t of ['=1+1', '+1', '-x', '@SUM(A1)', '\t=1', '\r=1', '\tplain', '\rplain', ' =1', '  @x', '\n=1', ' -x']) {
      assert.equal(isFormulaText(t), true, JSON.stringify(t));
      assert.equal(escapeCsvFormula(t), `'${t}`);
    }
  });
  it('leaves ordinary text alone', () => {
    for (const t of ['', 'plain', 'a=b', 'a-b', ' plain', "'=1", '1-2']) assert.equal(escapeCsvFormula(t), t);
  });
  it('keeps real numbers, formatted or not', () => {
    for (const [t, v] of [['-5', -5], ['-1,234.50', -1234.5], ['-$1,234.50', -1234.5], ['-12%', -0.12], ['-1e-7', -1e-7], ['+5', 5], ['-5 kg', -5]] as const) assert.equal(escapeCsvFormula(t, v), t);
    assert.equal(escapeCsvFormula('-5', -5n), '-5');
  });
  it('a numeric value does not exempt text that is not a number', () => {
    for (const t of ['=1+1', '-1+cmd()', '-A1', '-US$1', '@1', '-SUM(A1)']) assert.equal(escapeCsvFormula(t, -1), `'${t}`);
  });
  it('a numeric string is text', () => assert.equal(escapeCsvFormula('-5', '-5'), "'-5"));
});

describe('writeCsv / streamCsv / exportCsv formula default', () => {
  const rows: Row[] = [
    { id: 'a', note: '=HYPERLINK("http://x","y")', qty: -1234.5 },
    { id: 'b', note: ' @cmd, x', qty: 2 },
  ];

  it('escapes text by default, inside correct RFC 4180 quoting, and keeps negative numbers', () => {
    assert.deepEqual(body(writeCsv(modelOf(rows))), [`"'=HYPERLINK(""http://x"",""y"")","-1,234.50"`, `"' @cmd, x",2.00`]);
  });

  it('escapeFormulas: false keeps raw text', () => {
    assert.deepEqual(body(writeCsv(modelOf(rows), { escapeFormulas: false })), [`"=HYPERLINK(""http://x"",""y"")","-1,234.50"`, `" @cmd, x",2.00`]);
  });

  it('raw values keep negative numbers', () => {
    assert.equal(body(writeCsv(modelOf(rows), { values: 'raw' }))[0], `"'=HYPERLINK(""http://x"",""y"")",-1234.5`);
  });

  it('cell hooks: a numeric value keeps its text, a text patch is escaped', () => {
    const hooked = createExportModel(engineOf(rows), { cell: (ctx) => (ctx.column.field === 'qty' ? { text: '=evil()' } : { value: -7, text: '-7' }) });
    assert.equal(body(writeCsv(hooked))[0], "-7,'=evil()");
  });

  it('headers are escaped', () => {
    const engine = createDataGridEngine<Row, readonly DataGridModule<Row, any, any, string>[]>({
      getRowId: (r) => r.id,
      columns: [{ field: 'note', header: '=h' }],
      dataSource: rows,
      modules: [createExportModule<Row>()],
    });
    assert.equal(writeCsv(createExportModel(engine, {})).split('\r\n')[0], "'=h");
  });

  it('streamCsv and exportCsv match writeCsv', async () => {
    let streamed = '';
    for await (const chunk of streamCsv(modelOf(rows))) streamed += chunk;
    assert.equal(streamed, writeCsv(modelOf(rows)));
    const file = await exportCsv(modelOf(rows), { download: false } as never);
    assert.equal(file?.data, writeCsv(modelOf(rows)));
    const raw = await exportCsv(modelOf(rows), { download: false, escapeFormulas: false } as never);
    assert.ok(String(raw?.data).includes('"=HYPERLINK'));
  });
});
