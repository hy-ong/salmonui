import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import * as chart from '../dist/chart.js';
import { BulletChart } from '../dist/chart-bullet.js';

const data = [
  { k: 'Revenue', v: 270, t: 250, t2: 290 },
  { k: 'Profit', v: 22, t: 25, t2: 28 },
];
const bands = [{ to: 150, label: 'Poor' }, { to: 225, label: 'Fair' }, { to: 300 }];

describe('@salmonui/charts/chart/bullet', () => {
  it('is its own subpath: /chart no longer exports BulletChart', () => {
    assert.equal((chart as Record<string, unknown>)['BulletChart'], undefined);
    assert.equal(typeof BulletChart, 'function');
  });

  it('valueShape "dot" draws a circle glyph at the value instead of a bar from zero', () => {
    const bar = renderToString(h(BulletChart, { data, valueField: 'v', categoryField: 'k', max: 300 }));
    const dot = renderToString(h(BulletChart, { data, valueField: 'v', categoryField: 'k', max: 300, valueShape: 'dot' }));
    assert.doesNotMatch(bar, /salmon-chart-dot/);
    const dots = dot.match(/<path[^>]*class="salmon-viz-mark salmon-chart-dot"[^>]*>/g) ?? [];
    assert.equal(dots.length, 2);
    // A circle symbol is two arcs; a bar is a closed rectangle path.
    for (const d of dots) assert.match(d, /d="M[^"]*a[^"]*Z"/i);
  });

  it('tickPosition flips the value axis ticks into the plot', () => {
    const base = { data, valueField: 'v', categoryField: 'k', bands };
    const byDefault = renderToString(h(BulletChart, base));
    const outside = renderToString(h(BulletChart, { ...base, tickPosition: 'outside' }));
    const inside = renderToString(h(BulletChart, { ...base, tickPosition: 'inside' }));
    assert.equal(outside, byDefault);
    assert.notEqual(inside, outside);
    // Only the tick direction changes: the labels stay outside.
    const labels = (s: string) => [...s.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    assert.deepEqual(labels(inside), labels(outside));
  });

  it('the legend lists the value, every target and every band in the server markup', () => {
    const off = renderToString(h(BulletChart, { data, valueField: 'v', categoryField: 'k', bands }));
    assert.doesNotMatch(off, /salmon-chart-bullet-legend/);
    const out = renderToString(h(BulletChart, { data, valueField: 'v', name: 'Sales', targetField: ['t', 't2'], targetShapes: ['line', 'circle'], categoryField: 'k', bands, legend: true }));
    const legend = /<ul class="salmon-chart-bullet-legend" aria-label="Legend">([\s\S]*?)<\/ul>/.exec(out)?.[1] ?? '';
    const items = [...legend.matchAll(/<li>[\s\S]*?<\/svg>([^<]*)<\/li>/g)].map((m) => m[1]);
    assert.deepEqual(items, ['Sales', 'Target 1', 'Target 2', 'Poor', 'Fair', 'Band 3']);
    assert.match(legend, /<circle[^>]*fill="var\(--salmon-text-secondary\)"/);
    assert.match(legend, /<rect[^>]*fill="var\(--salmon-border-default\)"/);
    // The legend follows the figure by default, precedes it with position 'top'.
    assert.ok(out.indexOf('<figure') < out.indexOf('salmon-chart-bullet-legend'));
    const top = renderToString(h(BulletChart, { data, valueField: 'v', categoryField: 'k', bands, legend: { position: 'top', title: 'Key' }, text: { band: 'Range' } }));
    assert.ok(top.indexOf('aria-label="Key"') < top.indexOf('<figure'));
  });

  it('the point text names the value, the targets and the band (table cells)', () => {
    const out = renderToString(h(BulletChart, { data, valueField: 'v', targetField: 't', categoryField: 'k', bands, accessibleTable: true }));
    assert.match(out, /270, Target 250, Band 3/);
    assert.match(out, /22, Target 25, Poor/);
  });
});
