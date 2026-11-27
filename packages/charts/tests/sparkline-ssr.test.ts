import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Sparkline } from '@salmonui/charts/sparkline';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

// Server rendering of Sparkline: final static markup from props only, no
// listener, store or observer, and the SSR budget (100 sparklines ≤ 10 ms).

const render = (props: Parameters<typeof Sparkline>[0]) => renderToString(h(Sparkline, props));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const data = [3, 5, 4, 9, 6, -2, 8];

describe('Sparkline server render', () => {
  it('renders a line as a static role="img" SVG with an automatic summary', () => {
    const html = render({ data, width: 70, height: 20 });
    assert.match(html, /^<svg class="salmon-sparkline" data-type="line" role="img" aria-label="Sparkline, 7 points, minimum -2, maximum 9, first 3, last 8, trending up" width="70" height="20" viewBox="0 0 70 20">/);
    assert.match(html, /<path class="salmon-sparkline-line" d="M3,[\d.]+L/);
    assert.doesNotMatch(html, /tabindex/, 'not focusable without a tooltip');
  });
  it('uses `label` as the accessible name and passes className, style and id', () => {
    const html = render({ data, label: 'Weekly sales', className: 'cell', style: { color: 'red' }, id: 's1' });
    assert.match(html, /<svg id="s1" class="salmon-sparkline cell" style="color:red"[^>]*aria-label="Weekly sales"/);
  });
  it('draws area, column and win-loss types', () => {
    assert.match(render({ data, type: 'area' }), /class="salmon-sparkline-area" d="M[^"]+Z"/);
    const cols = render({ data, type: 'column' });
    assert.equal(count(cols, /class="salmon-sparkline-bar"/g), 7);
    const wl = render({ data: [1, -1, 0, 2], type: 'winLoss', tieColor: '#888888' });
    assert.equal(count(wl, /class="salmon-sparkline-bar"/g), 4);
    assert.match(wl, /fill:var\(--salmon-color-danger\)/, 'losses use the danger seed');
    assert.match(wl, /fill:#888888/, 'ties use tieColor');
  });
  it('reads records with xField / yField and nested paths on a time scale', () => {
    const recs = [
      { t: new Date(Date.UTC(2026, 0, 1)), v: { close: 1 } },
      { t: new Date(Date.UTC(2026, 0, 2)), v: { close: 3 } },
      { t: new Date(Date.UTC(2026, 0, 4)), v: { close: 2 } },
    ];
    const html = render({ data: recs, xField: 't', yField: 'v.close', scale: 'time', width: 100, height: 20, padding: 'none' });
    // x by time: day 2 sits a third of the way, not half.
    assert.match(html, /d="M0,20L33.33,0L100,10"/);
    const cat = render({ data: recs, xField: 't', yField: 'v.close', scale: 'category', width: 100, height: 20, padding: 'none' });
    assert.match(cat, /d="M0,20L50,0L100,10"/);
  });
  it('colors highlight points with the seeds or data colors and draws markers', () => {
    const html = render({ data, highlights: { high: true, low: '#123456', last: true } });
    assert.match(html, /<circle class="salmon-sparkline-marker"[^>]*style="fill:var\(--salmon-color-success\)"/);
    assert.match(html, /<circle class="salmon-sparkline-marker"[^>]*style="fill:#123456"/);
    assert.equal(count(html, /salmon-sparkline-marker/g), 3);
    assert.equal(count(render({ data, markers: 'all' }), /salmon-sparkline-marker/g), 7);
    assert.equal(count(render({ data, markers: ['negative'] }), /salmon-sparkline-marker/g), 1);
  });
  it('renders labels with the format', () => {
    const html = render({ data, labels: ['high', 'low'], format: { minimumFractionDigits: 1 }, locale: 'en-US' });
    assert.match(html, /<text class="salmon-sparkline-label"[^>]*>9.0<\/text>/);
    assert.match(html, /<text class="salmon-sparkline-label"[^>]*>-2.0<\/text>/);
    assert.match(render({ data, labels: 'all', format: (v) => `${v}%` }), />8%<\/text>/);
  });
  it('draws range bands, the baseline and honours domain and padding', () => {
    const html = render({ data: [0, 10], bands: [{ from: 2, to: 4, color: '#eeeeee' }], baseline: 5, domain: { y: [0, 10] }, padding: 'none', width: 100, height: 20 });
    assert.match(html, /<rect class="salmon-sparkline-band" x="0" y="12" width="100" height="4" style="fill:#eeeeee"><\/rect>/);
    assert.match(html, /<line class="salmon-sparkline-axis" x1="0" x2="100" y1="10" y2="10"><\/line>/);
    assert.match(html, /d="M0,20L100,0"/);
    assert.match(render({ data: [0, 10], padding: 'additional', width: 100, height: 20 }), /d="M6,14L94,6"/);
  });
  it('applies getPointStyle, color and palette data colors', () => {
    const html = render({ data: [1, 2, 3], type: 'column', palette: ['#111111', '#222222'], getPointStyle: (p) => (p.index === 2 ? { color: '#333333' } : p.index === 0 ? { hidden: true } : undefined) });
    assert.equal(count(html, /salmon-sparkline-bar/g), 2);
    assert.match(html, /fill:#222222/);
    assert.match(html, /fill:#333333/);
    assert.match(render({ data, color: '#aa0000' }), /stroke:#aa0000/);
  });
  it('becomes one focusable image with a tooltip, without rendering the tooltip on the server', () => {
    const html = render({ data, tooltip: true });
    assert.equal(count(html, /tabindex="0"/g), 1);
    assert.doesNotMatch(html, /salmon-sparkline-tooltip|salmon-sparkline-track/);
  });
  it('renders 100 sparklines within the 10 ms SSR budget @perf', () => {
    const many = Array.from({ length: 100 }, (_, i) => h(Sparkline, { key: i, data: Array.from({ length: 30 }, (_, k) => Math.sin(k + i)), highlights: { high: true, low: true } }));
    renderToString(h('div', null, many));
    let best = Number.POSITIVE_INFINITY;
    for (let r = 0; r < 5; r++) {
      const t = performance.now();
      renderToString(h('div', null, many));
      best = Math.min(best, performance.now() - t);
    }
    console.log(`[perf] renderToString 100 sparklines: ${best.toFixed(2)}ms`);
    assertBudget(best, 10, 'renderToString 100 sparklines');
  });
});
