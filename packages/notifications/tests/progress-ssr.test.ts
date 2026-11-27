// Progress and Meter server markup: server components with zero client code, so the behaviors are asserted
// on renderToString output; drawing, motion and RTL are asserted in
// tests/browser/notifications-progress.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Meter, Progress, type MeterProps, type ProgressProps } from '@salmonui/notifications/progress';

const progress = (props: Partial<ProgressProps> = {}) => renderToString(h(Progress, { 'aria-label': 'Upload', value: 42, ...props } as ProgressProps));
const meter = (props: Partial<MeterProps> = {}) => renderToString(h(Meter, { 'aria-label': 'Disk', value: 42, ...props } as MeterProps));
const attr = (markup: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const dist = new URL('../dist/', import.meta.url);

describe('Progress markup', () => {
  it('linear by default, a progressbar with value attributes and a value custom property', () => {
    const out = progress();
    assert.match(out, /^<div aria-label="Upload" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42" aria-valuetext="42%" class="salmon-progress"/);
    assert.equal(attr(out, 'data-shape'), 'linear');
    assert.match(attr(out, 'style') ?? '', /--salmon-progress-value:0.42/);
    assert.match(out, /<div class="salmon-progress-track"><div class="salmon-progress-bar"><\/div><\/div>/);
    assert.doesNotMatch(out, /<svg/);
  });

  it('circular and semicircle are one inline SVG of circles with pathLength', () => {
    const circular = progress({ shape: 'circular' });
    assert.equal(attr(circular, 'data-shape'), 'circular');
    assert.match(circular, /<svg class="salmon-progress-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">/);
    assert.equal(circular.match(/<circle /g)?.length, 2);
    assert.match(circular, /pathLength="100"/);
    const semi = progress({ shape: 'semicircle' });
    assert.match(semi, /viewBox="0 0 100 50"/);
    assert.match(semi, /pathLength="200"/);
  });

  it('min and max set the scale; the value is clamped', () => {
    const out = progress({ value: 30, min: 20, max: 40 });
    assert.equal(attr(out, 'aria-valuemin'), '20');
    assert.equal(attr(out, 'aria-valuemax'), '40');
    assert.equal(attr(out, 'aria-valuetext'), '50%');
    assert.match(attr(out, 'style') ?? '', /--salmon-progress-value:0.5/);
    assert.equal(attr(progress({ value: 250 }), 'aria-valuenow'), '100');
    assert.equal(attr(progress({ value: -5 }), 'aria-valuenow'), '0');
  });

  it('value={null} is indeterminate and omits aria-valuenow and the value text', () => {
    const out = progress({ value: null });
    assert.equal(attr(out, 'data-indeterminate'), '');
    assert.equal(attr(out, 'aria-valuenow'), null);
    assert.equal(attr(out, 'aria-valuetext'), null);
    assert.doesNotMatch(attr(out, 'style') ?? '', /--salmon-progress-value/);
  });

  it('buffer adds a second layer in linear and circular shapes', () => {
    const linear = progress({ buffer: 70 });
    assert.match(linear, /<div class="salmon-progress-buffer"><\/div><div class="salmon-progress-bar">/);
    assert.match(attr(linear, 'style') ?? '', /--salmon-progress-buffer:0.7/);
    assert.match(progress({ shape: 'circular', buffer: 70 }), /class="salmon-progress-buffer"/);
    assert.doesNotMatch(progress(), /salmon-progress-buffer/);
  });

  it('segments and stripes are data hooks; the count is a custom property', () => {
    const out = progress({ segments: 5, striped: true });
    assert.equal(attr(out, 'data-segments'), '');
    assert.match(attr(out, 'style') ?? '', /--salmon-progress-segments:5/);
    assert.equal(attr(out, 'data-striped'), '');
    assert.equal(attr(progress({ shape: 'circular', striped: true }), 'data-striped'), null, 'stripes are linear only');
  });

  it('tone defaults to primary and accepts a function of the value', () => {
    assert.equal(attr(progress(), 'data-tone'), 'primary');
    assert.equal(attr(progress({ tone: 'success' }), 'data-tone'), 'success');
    const ranged = (value: number | null) => (value !== null && value > 80 ? 'danger' : 'success');
    assert.equal(attr(progress({ value: 90, tone: ranged }), 'data-tone'), 'danger');
    assert.equal(attr(progress({ value: 10, tone: ranged }), 'data-tone'), 'success');
  });

  it('size is a metric set or a diameter; thickness sets the stroke', () => {
    assert.equal(attr(progress(), 'data-size'), 'md');
    assert.equal(attr(progress({ size: 'lg' }), 'data-size'), 'lg');
    const custom = progress({ shape: 'circular', size: 100, thickness: 10 });
    assert.equal(attr(custom, 'data-size'), null);
    assert.match(attr(custom, 'style') ?? '', /--salmon-progress-size:100px;--salmon-progress-thickness:10px/);
    assert.match(custom, /r="45" stroke-width="10"/);
    assert.match(progress({ thickness: 6 }), /--salmon-progress-thickness:6px/);
  });

  it('label true shows the percent; a node or a function is shown as is', () => {
    assert.match(progress({ label: true }), /<span class="salmon-progress-label">42%<\/span>/);
    assert.match(progress({ shape: 'circular', label: h('b', null, '3 of 7') }), /<span class="salmon-progress-label"><b>3 of 7<\/b><\/span>/);
    assert.match(progress({ label: ({ value, percent }) => `${value} (${percent}%)` }), /<span class="salmon-progress-label">42 \(42%\)<\/span>/);
    assert.doesNotMatch(progress(), /salmon-progress-label/);
  });

  it('valueLabel sets aria-valuetext; the default percent uses the locale digits', () => {
    assert.equal(attr(progress({ valueLabel: '42 of 100 files' }), 'aria-valuetext'), '42 of 100 files');
    assert.equal(attr(progress({ valueLabel: ({ value }) => `${value} files` }), 'aria-valuetext'), '42 files');
    assert.equal(attr(progress({ locale: 'ar-EG' }), 'aria-valuetext'), new Intl.NumberFormat('ar-EG', { style: 'percent', maximumFractionDigits: 0 }).format(0.42));
    assert.equal(attr(progress({ locale: 'de-DE' }), 'aria-valuetext'), new Intl.NumberFormat('de-DE', { style: 'percent' }).format(0.42));
  });

  it('className, style and DOM event props reach the root', () => {
    const out = renderToString(h(Progress, { 'aria-labelledby': 'l', value: 1, className: 'mine', style: { margin: 4 }, id: 'p', onClick: () => {} }));
    assert.equal(attr(out, 'class'), 'salmon-progress mine');
    assert.match(attr(out, 'style') ?? '', /^margin:4px;/);
    assert.equal(attr(out, 'id'), 'p');
    assert.equal(attr(out, 'aria-labelledby'), 'l');
  });
});

describe('Meter markup', () => {
  it('Meter is role=meter with the same parts and a value-based tone', () => {
    const out = meter({ tone: (v) => (v !== null && v > 40 ? 'warning' : 'success') });
    assert.match(out, /^<div aria-label="Disk" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"/);
    assert.equal(attr(out, 'class'), 'salmon-meter salmon-progress');
    assert.equal(attr(out, 'data-tone'), 'warning');
    assert.match(meter({ shape: 'semicircle' }), /<svg class="salmon-progress-svg"/);
  });
});

describe('Progress entry', () => {
  it('is a server component: no "use client"', () => {
    for (const entry of ['progress.js', 'progress/Progress.js']) assert.doesNotMatch(readFileSync(new URL(entry, dist), 'utf8'), /^\s*['"]use client['"]/);
  });
});
