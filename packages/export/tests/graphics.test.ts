// Vector PDF of SVG drawings: the writer parses SVG markup without
// a DOM and emits PDF path and text operators, never images.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseColor, pathOps, writeGraphicsPdf } from '@salmonui/export/graphics';
import { pdfStreams } from './helpers.ts';

const latin = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

const CHART = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300" font-family="system-ui">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <defs><clipPath id="c"><rect x="40" y="20" width="540" height="240"/></clipPath>
  <linearGradient id="g"><stop offset="0" stop-color="#336699" stop-opacity="0.5"/></linearGradient></defs>
  <g clip-path="url(#c)">
    <path d="M40,260L100,200L160,220L220,120" style="fill:none;stroke:rgb(43, 85, 174);stroke-width:2" stroke-dasharray="4 2"/>
    <path d="M300,200h40v60h-40Z" fill="oklch(0.64 0.15 60)" opacity="0.5"/>
    <circle cx="400" cy="100" r="6" fill="url(#g)"/>
  </g>
  <g transform="translate(10 0)"><text x="300" y="290" text-anchor="middle" font-size="12" fill="#333333">Revenue &amp; cost<tspan x="300" dy="0" font-weight="600">Q1</tspan></text></g>
  <text x="20" y="150" transform="rotate(-90 20 150)" fill="#000">Axis</text>
  <rect x="0" y="0" width="10" height="10" fill="red" style="display:none"/>
</svg>`;

describe('writeGraphicsPdf', () => {
  it('writes a valid PDF whose page draws vector paths and text (no images)', async () => {
    const file = await writeGraphicsPdf(CHART, { title: 'Sales', fileName: 'sales' });
    assert.equal(file.fileName, 'sales.pdf');
    assert.equal(file.mimeType, 'application/pdf');
    const text = latin(file.data);
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.match(text, /\/Count 1 /);
    assert.match(text, /\/Title \(Sales\)/);
    assert.doesNotMatch(text, /\/Subtype \/Image/);
    // A wide drawing goes on a landscape A4 page.
    assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
    const [content] = pdfStreams(file.data);
    assert.ok(content);
    // Line, rectangle and arc (cubic) path operators, stroked and filled.
    assert.match(content, / m [-\d.]+ [-\d.]+ l [-\d.]+ [-\d.]+ l /);
    assert.match(content, / S Q/);
    assert.match(content, / f Q/);
    assert.match(content, / c /);
    // Dash, stroke width scaled from px, the rgb() stroke color.
    assert.match(content, /0\.169 0\.333 0\.682 RG [\d.]+ w \[[\d.]+ [\d.]+\] 0 d/);
    // The clip rectangle, the opacity graphics state and the gradient's first stop.
    assert.match(content, /^q .* W n$/m);
    assert.match(content, /\/GS\d gs /);
    assert.match(text, /\/ExtGState << \/GS0 << \/ca 0\.5 \/CA 1 >>/);
    assert.match(content, /0\.2 0\.4 0\.6 rg/);
    // Text in Helvetica, upright (positive y scale), the bold tspan in F2, the rotated axis title.
    assert.match(content, /BT \/F1 12 Tf 0\.2 0\.2 0\.2 rg [\d.]+ 0 0 [\d.]+ [\d.]+ [\d.]+ Tm \(Revenue & cost\) Tj ET/);
    assert.match(content, /BT \/F2 12 Tf .*\(Q1\) Tj ET/);
    assert.match(content, /BT \/F1 16 Tf 0 0 0 rg 0 [\d.]+ -[\d.]+ 0 [\d.]+ [\d.]+ Tm \(Axis\) Tj ET/);
    // `display: none` is not drawn.
    assert.doesNotMatch(content, /1 0 0 rg/);
  });

  it('one page per drawing, orientation and page size options, header and footer', async () => {
    const file = await writeGraphicsPdf([CHART, { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><rect width="200" height="400" fill="#000"/></svg>' }], { pageSize: 'Letter', orientation: 'portrait', footer: '{page} / {pages}', compress: false });
    const text = latin(file.data);
    assert.match(text, /\/Count 2 /);
    assert.equal(text.match(/\/MediaBox \[0 0 612 792\]/g)?.length, 2);
    assert.match(text, /\(1 \/ 2\) Tj/);
    assert.match(text, /\(2 \/ 2\) Tj/);
    await assert.rejects(writeGraphicsPdf('<div/>'), /needs SVG markup/);
  });

  it('converts SVG path commands (relative, smooth, quadratic, arcs) to absolute PDF operators', () => {
    const ops = pathOps('M10,10l10,0h5v5H10zM0,0Q10,10 20,0T40,0C50,10 60,10 70,0S90,-10 100,0a5,5 0 1,0 10,0', [1, 0, 0, 1, 0, 0]);
    assert.match(ops, /^10 10 m 20 10 l 25 10 l 25 15 l 10 15 l h 0 0 m /);
    assert.equal(ops.match(/ c/g)?.length, 6);
    assert.ok(ops.endsWith('110 0 c'), ops);
  });

  it('parses the color forms browsers compute', () => {
    assert.deepEqual(parseColor('#336699')?.map((v) => Math.round(v * 255)), [51, 102, 153, 255]);
    assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)')?.map((v) => Math.round(v * 100) / 100), [0.04, 0.08, 0.12, 0.5]);
    assert.deepEqual(parseColor('oklch(0.47 0.15 264)')?.slice(0, 3).map((v) => Math.round(v * 255)), [46, 84, 174]);
    assert.deepEqual(parseColor('color(srgb 1 0 0)'), [1, 0, 0, 1]);
    assert.equal(parseColor('none'), null);
  });
});
