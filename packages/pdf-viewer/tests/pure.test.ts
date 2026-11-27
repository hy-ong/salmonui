// Pure modules of PdfViewer: zoom math, layout and virtualization,
// search matching and the text markup model.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampScale, formatScale, pinchScale, resolveScale, stepScale, PDF_TO_CSS } from '../dist/zoom.js';
import { computeLayout, pageOffset, spreads, visiblePages } from '../dist/layout.js';
import { buildPageText, countByPage, findInText, findMatches, locate, matchPieces } from '../dist/search.js';
import { boundingRect, cssRectToPdf, hexToRgb, markBand, markOutlines, mergeLineRects, patchMarkupSubtypes, pdfRectToCss, quadPoints, toEngineRecord } from '../dist/markup.js';
import type { PdfTextMarkupAnnotation } from '@salmonui/pdf-viewer';

const LETTER = { width: 612, height: 792 };

describe('zoom math', () => {
  it('fit modes measure the page against the viewport', () => {
    const viewport = { width: 1032, height: 700 };
    const widthScale = (1032 - 32) / (612 * PDF_TO_CSS);
    assert.equal(resolveScale('page-width', { page: LETTER, viewport }), widthScale);
    assert.equal(resolveScale('page-fit', { page: LETTER, viewport }), (700 - 32) / (792 * PDF_TO_CSS));
    // auto: portrait pages fit the width up to 125 %; landscape pages fit whole.
    assert.equal(resolveScale('auto', { page: LETTER, viewport: { width: 1300, height: 700 } }), 1.25);
    assert.equal(resolveScale('auto', { page: LETTER, viewport: { width: 400, height: 700 } }), (400 - 32) / (612 * PDF_TO_CSS));
    assert.equal(resolveScale('auto', { page: { width: 792, height: 612 }, viewport }), Math.min((1032 - 32) / (792 * PDF_TO_CSS), (700 - 32) / (612 * PDF_TO_CSS)));
    // Spreads fit two pages.
    assert.equal(resolveScale('page-width', { page: LETTER, viewport, spreadMode: 'odd' }), (1032 - 32 - 12) / (2 * 612 * PDF_TO_CSS));
    assert.equal(resolveScale(2, { page: LETTER, viewport }), 2);
  });

  it('clamps, steps and pinches', () => {
    assert.equal(clampScale(50), 10);
    assert.equal(clampScale(0), 0.1);
    assert.equal(clampScale(Number.NaN), 1);
    assert.equal(stepScale(1, 1), 1.1);
    assert.equal(stepScale(1, -1), 0.9);
    assert.equal(stepScale(1.05, 1), 1.1);
    assert.equal(stepScale(10, 1), 10);
    assert.equal(stepScale(0.1, -1), 0.1);
    assert.equal(pinchScale(1, 2), 2);
    assert.equal(pinchScale(8, 4), 10);
    assert.equal(formatScale(1.256), '126%');
  });
});

describe('layout and virtualization', () => {
  const sizes = Array.from({ length: 100 }, (_, i) => (i === 2 ? { width: 420, height: 595 } : LETTER));

  it('vertical: one page per row, centered, offsets from the Data Grid row metrics', () => {
    const l = computeLayout({ sizes, scale: 1, scrollMode: 'vertical', spreadMode: 'none', viewportWidth: 1000 });
    assert.equal(l.rows.length, 100);
    assert.deepEqual(l.boxes[0], { x: 92, y: 16, width: 816, height: 1056 });
    assert.deepEqual(l.boxes[1], { x: 92, y: 16 + 1068, width: 816, height: 1056 });
    assert.equal(l.boxes[2]?.width, 560);
    assert.equal(l.height, 99 * 1068 + (793 + 12) - 12 + 2 * 16);
    const v = visiblePages(l, pageOffset(l, 50), 800, 1);
    assert.deepEqual(v.pages, [48, 49, 50, 51]);
    assert.equal(v.current, 50);
  });

  it('spreads, wrapped, horizontal and page modes', () => {
    assert.deepEqual(spreads(5, 'odd'), [[0, 1], [2, 3], [4]]);
    assert.deepEqual(spreads(5, 'even'), [[0], [1, 2], [3, 4]]);
    const odd = computeLayout({ sizes: sizes.slice(0, 4), scale: 0.5, scrollMode: 'vertical', spreadMode: 'odd', viewportWidth: 1000 });
    assert.equal(odd.boxes[0]?.y, odd.boxes[1]?.y);
    assert.ok((odd.boxes[1]?.x ?? 0) > (odd.boxes[0]?.x ?? 0));
    const wrapped = computeLayout({ sizes: sizes.slice(0, 6), scale: 0.5, scrollMode: 'wrapped', spreadMode: 'none', viewportWidth: 1000 });
    assert.deepEqual(wrapped.rows.map((r) => r.pages.length), [2, 2, 2]);
    const horizontal = computeLayout({ sizes: sizes.slice(0, 3), scale: 1, scrollMode: 'horizontal', spreadMode: 'none', viewportWidth: 1000 });
    assert.equal(horizontal.axis, 'x');
    assert.equal(horizontal.boxes[1]?.x, 16 + 828);
    const paged = computeLayout({ sizes: sizes.slice(0, 3), scale: 1, scrollMode: 'page', spreadMode: 'none', viewportWidth: 1000 });
    assert.equal(paged.boxes[2]?.y, 16);
    assert.deepEqual(visiblePages(paged, 0, 800, 1, 2).pages, [2]);
  });
});

describe('search', () => {
  const page = buildPageText([{ str: 'Salmon swim', hasEOL: true }, { str: '' }, { str: 'a salmon-berry and salmon.' }]);

  it('joins items with a space at line ends and maps offsets back to items', () => {
    assert.equal(page.text, 'Salmon swim a salmon-berry and salmon.');
    assert.deepEqual(locate(page, 14), { item: 2, offset: 2 });
    assert.deepEqual(matchPieces(page, 7, 14), [[0, 7, 11], [2, 0, 2]]);
  });

  it('matches case-insensitively by default; matchCase and wholeWord narrow', () => {
    assert.equal(findInText(page.text, 'salmon').length, 3);
    assert.equal(findInText(page.text, 'salmon', { matchCase: true }).length, 2);
    assert.deepEqual(findInText(page.text, 'salmon', { wholeWord: true }).length, 3);
    assert.equal(findInText('salmonberry salmon', 'salmon', { wholeWord: true }).length, 1);
    assert.deepEqual(findInText(page.text, 'swim  a'), [[7, 13]]);
    assert.deepEqual(findInText(page.text, '   '), []);
  });

  it('collects matches over pages', () => {
    const matches = findMatches([page, buildPageText([{ str: 'none' }]), buildPageText([{ str: 'SALMON' }])], 'salmon');
    assert.deepEqual(matches.map((m) => m.page), [0, 0, 0, 2]);
    assert.deepEqual(countByPage(matches), { 1: 3, 3: 1 });
  });
});

describe('text markup model', () => {
  const geometry = { view: [0, 0, 612, 792] as const, rotate: 0 };

  it('converts between page CSS pixels and PDF space (all rotations)', () => {
    const css = { left: 96, top: 96, width: 192, height: 24 };
    const pdf = cssRectToPdf(geometry, 4 / 3, css);
    assert.deepEqual(pdf, [72, 702, 216, 720]);
    assert.deepEqual(pdfRectToCss(geometry, 4 / 3, pdf), css);
    for (const rotate of [90, 180, 270]) {
      const g = { view: [0, 0, 612, 792] as const, rotate };
      const back = pdfRectToCss(g, 2, cssRectToPdf(g, 2, css));
      assert.deepEqual([back.left, back.top, back.width, back.height].map(Math.round), [96, 96, 192, 24]);
    }
    // A view box that does not start at the origin.
    assert.deepEqual(cssRectToPdf({ view: [10, 20, 622, 812], rotate: 0 }, 1, { left: 0, top: 0, width: 10, height: 10 }), [10, 802, 20, 812]);
  });

  it('merges selection rectangles into one per line', () => {
    const merged = mergeLineRects([
      { left: 10, top: 10, width: 30, height: 12 },
      { left: 40, top: 10.5, width: 30, height: 11 },
      { left: 10, top: 30, width: 50, height: 12 },
      { left: 0, top: 0, width: 0, height: 0 },
    ]);
    assert.deepEqual(merged, [
      { left: 10, top: 10, width: 60, height: 12 },
      { left: 10, top: 30, width: 50, height: 12 },
    ]);
  });

  it('builds QuadPoints, appearance bands and the writer record', () => {
    const rects = [[72, 700, 216, 720], [72, 680, 150, 700]] as const;
    assert.deepEqual(boundingRect(rects), [72, 680, 216, 720]);
    assert.deepEqual(quadPoints([rects[0]]), [72, 720, 216, 720, 72, 700, 216, 700]);
    assert.deepEqual(markBand('highlight', rects[0]), rects[0]);
    const under = markBand('underline', rects[0]);
    const strike = markBand('strikethrough', rects[0]);
    assert.ok(under[1] < strike[1] && under[3] - under[1] < 2);
    assert.equal(markOutlines('underline', [rects[0]])[0]?.length, 8);
    assert.deepEqual(hexToRgb('#ffd400'), [255, 212, 0]);
    assert.deepEqual(hexToRgb('#0f0'), [0, 255, 0]);
    const a: PdfTextMarkupAnnotation = { id: 'a', kind: 'underline', page: 2, rects, color: '#2563eb', author: 'Ann', comment: 'Check', createdAt: '2026-11-24T00:00:00Z' };
    const rec = toEngineRecord(a);
    assert.equal(rec['annotationType'], 9);
    assert.equal(rec['pageIndex'], 1);
    assert.deepEqual(rec['rect'], [72, 680, 216, 720]);
    assert.equal(rec['user'], 'Ann');
    assert.deepEqual((rec['popup'] as { contents: string }).contents, 'Check');
  });

  it('patches the subtype of appended underline and strikethrough annotations in place', () => {
    const head = '%PDF-1.7\n1 0 obj\n<< /Subtype /Highlight /Rect [1 2 3 4] >>\nendobj\n';
    const tail = '7 0 obj\n<< /Type /Annot /Subtype /Highlight /Rect [72 680 216 720] >>\nendobj\n8 0 obj\n<< /Type /Annot /Subtype /Highlight /Rect [10 10 20 20] >>\nendobj\n9 0 obj\n<< /Type /Annot /Subtype /Highlight /Rect [30 30 40 40.5] >>\nendobj\n';
    const bytes = new TextEncoder().encode(head + tail);
    const mk = (id: string, kind: PdfTextMarkupAnnotation['kind'], rect: readonly [number, number, number, number]): PdfTextMarkupAnnotation => ({ id, kind, page: 1, rects: [rect], color: '#000000' });
    const n = patchMarkupSubtypes(bytes, head.length, [mk('a', 'underline', [72, 680, 216, 720]), mk('b', 'highlight', [10, 10, 20, 20]), mk('c', 'strikethrough', [30, 30, 40, 40.5]), mk('d', 'underline', [1, 2, 3, 4])]);
    assert.equal(n, 2);
    const out = new TextDecoder().decode(bytes);
    assert.equal(out.length, head.length + tail.length);
    assert.match(out, /^%PDF-1\.7\n1 0 obj\n<< \/Subtype \/Highlight \/Rect \[1 2 3 4\]/);
    assert.match(out, /7 0 obj\n<< \/Type \/Annot \/Subtype \/Underline/);
    assert.match(out, /8 0 obj\n<< \/Type \/Annot \/Subtype \/Highlight/);
    assert.match(out, /9 0 obj\n<< \/Type \/Annot \/Subtype \/StrikeOut/);
  });
});
