// Gantt PDF writer: document structure, row bands x chart
// slices pagination, fitToWidth, vector operators, task texts, RTL grid
// placement, connector arrows, and an embedded font.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportGanttPdf, type GanttPdfModel } from '@salmonui/export/gantt';
import { buildTestFont } from './font-fixture.ts';
import { pdfStreams, pdfText, pdfUnicodeText } from './helpers.ts';

const latin = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

function pageCount(bytes: Uint8Array): number {
  const text = latin(bytes);
  assert.ok(text.startsWith('%PDF-'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  assert.ok(text.slice(startxref).startsWith('xref'));
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  return Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1]);
}

/** `rows` rows of 36 px (landscape A4 holds 11 below the 60 px header), chart `chartWidth` px. */
function model(rows: number, chartWidth = 2400, direction: 'ltr' | 'rtl' = 'ltr'): GanttPdfModel {
  return {
    title: 'Plan',
    direction,
    columns: [
      { header: 'Task', width: 140 },
      { header: 'Days', width: 60, align: 'end' },
    ],
    rows: Array.from({ length: rows }, (_, i) => ({ cells: [`Task ${i}`, String(i + 1)], depth: i % 3 === 0 ? 0 : 1, parent: i % 3 === 0, height: 36 })),
    chartWidth,
    headerHeight: 60,
    tiers: [
      { cells: Array.from({ length: Math.ceil(chartWidth / 700) }, (_, i) => ({ x: i * 700, width: 700, text: `Week ${i + 1}` })) },
      { cells: Array.from({ length: Math.ceil(chartWidth / 100) }, (_, i) => ({ x: i * 100, width: 100, text: `D${i + 1}` })) },
    ],
    bars: Array.from({ length: rows }, (_, i) => ({
      row: i,
      kind: i % 3 === 0 ? ('parent' as const) : i % 5 === 0 ? ('milestone' as const) : ('task' as const),
      x: 50 + i * 40,
      width: i % 5 === 0 && i % 3 ? 0 : 300,
      top: 8,
      height: 20,
      progress: 40,
      color: '#3366cc',
      progressColor: '#1a3366',
      critical: i === 2,
      ...(i === 4 ? { segments: [{ x: 210, width: 100 }, { x: 360, width: 150 }] } : {}),
      label: `Label ${i}`,
    })),
    connectors: [{ points: [[350, 18], [370, 18], [370, 54], [130, 54]], color: '#555555' }],
    shades: [{ x: 500, width: 100, color: '#eeeeee', label: 'Holiday' }],
    markers: [{ x: 800, color: '#cc0000', label: 'Release' }],
    colors: { text: '#222222', headerText: '#111111', headerBackground: '#f2f2f2', line: '#cccccc', background: '#ffffff' },
  };
}

describe('exportGanttPdf', () => {
  it('pages across chart slices and down row bands', async () => {
    const file = await exportGanttPdf(model(20));
    assert.equal(file.fileName, 'Gantt.pdf');
    assert.equal(file.mimeType, 'application/pdf');
    assert.match(latin(file.data), /\/MediaBox \[0 0 841\.89 595\.28\]/, 'landscape by default');
    assert.match(latin(file.data), /\/Title \(Plan\)/);
    // 20 rows: 2 bands; 1800 pt of chart beside a 150 pt grid: 3 slices.
    assert.equal(pageCount(file.data), 6);
    const streams = pdfStreams(file.data);
    assert.equal(streams.length, 6);
    // The grid is on the first slice of each band only; tiers repeat on every page.
    const withGrid = streams.map((s) => pdfText(s).includes('Task'));
    assert.deepEqual(withGrid, [true, false, false, true, false, false]);
    for (const s of streams) assert.ok(pdfText(s).some((t) => t.startsWith('D')), 'timeline tier on every page');
    assert.ok(pdfText(streams.at(-1) as string).includes('6 / 6'));
    const texts = streams.flatMap(pdfText);
    for (let i = 0; i < 20; i++) assert.ok(texts.includes(`Task ${i}`), `Task ${i}`);
    // No row is split: each task text is printed once.
    assert.equal(texts.filter((t) => t === 'Task 11').length, 1);
  });

  it('fitToWidth prints one page per row band', async () => {
    const file = await exportGanttPdf(model(20), { fitToWidth: true, fileName: 'plan', footer: '' });
    assert.equal(file.fileName, 'plan.pdf');
    const pages = pageCount(file.data);
    const streams = pdfStreams(file.data);
    for (const s of streams) assert.ok(pdfText(s).includes('Task'), 'grid on every page');
    // The chart is scaled down with the grid, so the bands hold more rows.
    assert.ok(pages >= 1 && pages <= 2, `pages ${pages}`);
    const one = await exportGanttPdf(model(5), { fitToWidth: true });
    assert.equal(pageCount(one.data), 1);
  });

  it('draws vector shapes: rectangles, polylines, dashes, arrows, clipping', async () => {
    const file = await exportGanttPdf(model(8, 800));
    assert.equal(pageCount(file.data), 1);
    const [s] = pdfStreams(file.data) as [string];
    assert.match(s, / re f/, 'filled rectangles');
    assert.match(s, / m [\d.-]+ [\d.-]+ l S/, 'stroked lines');
    assert.match(s, /\[3 2\] 0 d/, 'dashed marker');
    assert.match(s, /\[2 2\] 0 d/, 'dashed segment join');
    assert.match(s, / re W n/, 'chart clip');
    assert.match(s, /0 1 -1 0 [\d.]+ [\d.]+ Tm/, 'rotated holiday label');
    assert.ok(!/ Do /.test(s), 'no images');
    // Connector: polyline of 4 points in its color, then the filled arrow triangle.
    assert.match(s, /0\.333 0\.333 0\.333 RG [\d.]+ w \[\] 0 d [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l [\d.]+ [\d.]+ l [\d.]+ [\d.]+ l S/);
    assert.match(s, /0\.333 0\.333 0\.333 rg [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l [\d.]+ [\d.]+ l h f/);
    // The arrow points left (towards smaller x) along the last segment.
    const arrow = /0\.333 0\.333 0\.333 rg ([\d.]+) [\d.]+ m ([\d.]+) [\d.]+ l/.exec(s) as RegExpExecArray;
    assert.ok(Number(arrow[1]) < Number(arrow[2]));
    for (const t of ['Task 0', 'Label 3', 'Release', 'Holiday', 'Week 1']) assert.ok(pdfText(s).includes(t), t);
  });

  it('puts the grid on the right in RTL', async () => {
    const x = async (direction: 'ltr' | 'rtl'): Promise<number> => {
      const [s] = pdfStreams((await exportGanttPdf(model(3, 600, direction))).data) as [string];
      return Number(/([\d.]+) [\d.]+ Td \(Task 0\) Tj/.exec(s)?.[1]);
    };
    const ltr = await x('ltr');
    const rtl = await x('rtl');
    assert.ok(ltr < 150, `ltr ${ltr}`);
    assert.ok(rtl > 841.89 - 36 - 150, `rtl ${rtl}`);
  });

  it('embeds a TrueType font for non-Latin text', async () => {
    const cps = [...Array.from({ length: 95 }, (_, i) => i + 32), ...Array.from('進度', (ch) => ch.codePointAt(0) as number)];
    const font = buildTestFont({ codePoints: cps });
    const m = model(2, 400);
    const file = await exportGanttPdf({ ...m, rows: m.rows.map((r) => ({ ...r, cells: ['進度', '1'] })) }, { font: font.bytes });
    assert.equal(pageCount(file.data), 1);
    assert.match(latin(file.data), /\/Subtype \/Type0/);
    assert.ok(pdfUnicodeText(file.data).includes('進度'));
  });
});
