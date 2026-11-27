import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeGraphicsPdf } from '@salmonui/export/graphics';
import { writeXlsx } from '@salmonui/export/xlsx';
import { Chart } from '../dist/chart.js';
import { BulletChart } from '../dist/chart-bullet.js';
import { PieChart } from '../dist/pie-chart.js';
import { QRCode } from '../dist/barcode.js';
import { visualizationSvg } from '../dist/server-visualization.js';
import { cellValue, tableBlob, tableCsv, tableExportModel } from '../dist/internal/viz/export-data.js';

// Visualization export: the table through the core CSV writer
// and the XLSX writer, the server-side SVG of the model, and the vector PDF
// of that SVG, all without a DOM.

const months = ['Jan', 'Feb', 'Mar'];
const data = months.map((m, i) => ({ m, north: [1200, 15.5, -9][i] as number, south: [8, 6, 11][i] as number }));
const chart = h(Chart, { title: 'Sales', data, series: [{ xField: 'm', yField: 'north', name: 'North', type: 'column' }, { xField: 'm', yField: 'south', name: 'South', type: 'line' }] });

/** The text of every (inflated) content stream of a PDF. */
function contents(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of text.matchAll(/<< \/Length (\d+)( \/Filter \/FlateDecode)? >>\nstream\n/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const raw = Buffer.from(bytes.subarray(start, start + Number(m[1])));
    out.push((m[2] ? inflateSync(raw) : raw).toString('latin1'));
  }
  return out.join('\n');
}

describe('table export through the core writers', () => {
  const table = { columns: ['x', 'North', 'Note'], rows: [['Jan', '1,200.00', '=SUM(A1)'], ['Feb', '15.50', 'a, "b"']] };
  it('CSV is the @salmonui/data-grid/engine writeCsv output (RFC 4180 quoting, formulas neutralized)', () => {
    assert.equal(tableCsv(table), 'x,North,Note\r\nJan,"1,200.00",\'=SUM(A1)\r\nFeb,15.50,"a, ""b"""\r\n');
  });
  it('numeric columns are typed for XLSX; text stays text', () => {
    assert.equal(cellValue('1,200.00'), 1200);
    assert.equal(cellValue('-3'), -3);
    assert.equal(cellValue('12%'), '12%');
    const model = tableExportModel(table);
    assert.deepEqual(model.columns.map((c) => c.type), ['string', 'number', 'string']);
    assert.equal(model.cell(model.getRow(0) as never, model.columns[1] as never).value, 1200);
  });
  it('XLSX goes through exportWriters.xlsx; without it the export rejects', async () => {
    const blob = await tableBlob(table, 'xlsx', { xlsx: async () => ({ writeXlsx }) }, 'Sales');
    assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(Buffer.from(bytes.subarray(0, 2)).toString('latin1'), 'PK');
    await assert.rejects(tableBlob(table, 'xlsx', undefined), /exportWriters\.xlsx/);
    assert.equal(await (await tableBlob(table, 'csv', undefined)).text(), tableCsv(table));
  });
});

describe('SVG of the model on the server', () => {
  it('visualizationSvg returns the rendered drawing as standalone SVG with the theme resolved', () => {
    const html = renderToStaticMarkup(chart);
    const svg = visualizationSvg(html);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" font-family="system-ui[^"]*" font-size="12px" fill="#[0-9a-f]{6}"/);
    assert.ok(svg.endsWith('</svg>'));
    assert.doesNotMatch(svg, /var\(--salmon-/);
    // The same marks as the server markup (the drawing of the model), with the chart role colors resolved.
    const marks = [...html.matchAll(/<path d="([^"]+)" class="salmon-viz-mark"/g)].map((m) => m[1]);
    assert.ok(marks.length >= 3);
    for (const d of marks) assert.ok(svg.includes(`d="${d}"`));
    assert.match(svg, /class="salmon-viz-grid"[^>]* stroke="#[0-9a-f]{6}"/);
    assert.match(svg, /class="salmon-viz-title"[^>]* font-weight="600"/);
    // Dark scheme and custom seeds change the colors, not the geometry.
    const dark = visualizationSvg(html, { colorScheme: 'dark', theme: { colors: { primary: '#7c3aed' } } });
    assert.notEqual(dark, svg);
    assert.equal(dark.replace(/#[0-9a-f]{6}/g, ''), svg.replace(/#[0-9a-f]{6}/g, ''));
  });
  it('works for every SVG family root (figure surface, image SVG)', () => {
    assert.match(visualizationSvg(renderToStaticMarkup(h(PieChart, { title: 'P', data, valueField: 'south', labelField: 'm' }))), /^<svg xmlns=[\s\S]*<\/svg>$/);
    assert.match(visualizationSvg(renderToStaticMarkup(h(BulletChart, { data, valueField: 'south', categoryField: 'm' }))), /salmon-chart-series-group/);
    assert.match(visualizationSvg(renderToStaticMarkup(h(QRCode, { value: 'hi' }))), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*role="img"/);
    assert.equal(visualizationSvg('<div>no drawing</div>'), '');
  });
});

describe('vector PDF of a chart', () => {
  it('the writer draws the chart SVG as PDF paths and text, never an image', async () => {
    const svg = visualizationSvg(renderToStaticMarkup(chart));
    const file = await writeGraphicsPdf(svg, { title: 'Sales' });
    const text = Buffer.from(file.data).toString('latin1');
    assert.ok(text.startsWith('%PDF-'));
    assert.doesNotMatch(text, /\/Image/);
    const ops = contents(file.data);
    // Column rectangles and the line series as path operators, filled and stroked.
    assert.ok((ops.match(/ f Q/g) ?? []).length >= 3, 'filled marks');
    assert.ok((ops.match(/ S Q/g) ?? []).length >= 2, 'stroked lines (series, grid, axes)');
    // Title, tick and category labels as text.
    for (const label of ['Sales', 'Jan', 'Feb', 'Mar']) assert.match(ops, new RegExp(`\\(${label}\\) Tj`));
  });
});
