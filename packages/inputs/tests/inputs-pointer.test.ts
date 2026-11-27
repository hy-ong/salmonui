// Pointer controls: the internal
// pointer-drag primitive, Slider markup, the SignaturePad stroke model and
// markup. Interaction tests live in tests/browser/inputs-pointer.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { SignaturePad } from '@salmonui/inputs/signature-pad';
import { Slider } from '@salmonui/inputs/slider';
import { clamp, fraction1D, fraction2D, keyMove, snapToStep, startPointerSession, valueFromFraction } from '../../core/dist/internal/pointer-drag.js';
import { EMPTY_STATE, segments, toSVG, WidthTracker, widthsOf, type Stroke } from '../dist/signature-pad/strokes.js';

const rect = { left: 100, top: 50, width: 200, height: 100 };
const inputs = (markup: string): string[] => markup.match(/<input[^>]*>/g) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

describe('pointer-drag primitive', () => {
  it('fractions mirror horizontally in RTL; vertical grows upward and never mirrors', () => {
    assert.equal(fraction1D(150, 0, rect, 'horizontal', false), 0.25);
    assert.equal(fraction1D(150, 0, rect, 'horizontal', true), 0.75);
    assert.equal(fraction1D(0, 0, rect, 'horizontal', false), 0);
    assert.equal(fraction1D(999, 0, rect, 'horizontal', false), 1);
    assert.equal(fraction1D(0, 125, rect, 'vertical', false), 0.25);
    assert.equal(fraction1D(0, 125, rect, 'vertical', true), 0.25);
    const out: [number, number] = [0, 0];
    assert.equal(fraction2D(150, 125, rect, true, out), out);
    assert.deepEqual(out, [0.75, 0.25]);
    assert.equal(fraction1D(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 'horizontal', false), 0);
  });

  it('APG keys; ArrowLeft / ArrowRight swap in RTL for horizontal only', () => {
    assert.deepEqual(keyMove('ArrowRight', 'horizontal', false), { type: 'step', direction: 1 });
    assert.deepEqual(keyMove('ArrowRight', 'horizontal', true), { type: 'step', direction: -1 });
    assert.deepEqual(keyMove('ArrowLeft', 'horizontal', true), { type: 'step', direction: 1 });
    assert.deepEqual(keyMove('ArrowRight', 'vertical', true), { type: 'step', direction: 1 });
    assert.deepEqual(keyMove('ArrowUp', 'horizontal', true), { type: 'step', direction: 1 });
    assert.deepEqual(keyMove('PageDown', 'horizontal', false), { type: 'page', direction: -1 });
    assert.deepEqual(keyMove('Home', 'horizontal', false), { type: 'min' });
    assert.deepEqual(keyMove('End', 'vertical', false), { type: 'max' });
    assert.equal(keyMove('a', 'horizontal', false), null);
    // Shared frozen constants: no allocation per key.
    assert.equal(keyMove('ArrowUp', 'horizontal', false), keyMove('ArrowRight', 'horizontal', false));
    assert.ok(Object.isFrozen(keyMove('Home', 'horizontal', false)));
  });

  it('snapToStep rounds to min + k * step without float noise; valueFromFraction clamps', () => {
    assert.equal(snapToStep(0.30000000000000004, 0, 1, 0.1), 0.3);
    assert.equal(snapToStep(7, 0, 10, 5), 5);
    assert.equal(snapToStep(8, 0, 10, 5), 10);
    assert.equal(snapToStep(9.9, 0, 9, 4), 8);
    assert.equal(snapToStep(3, 1, 10, 2), 3);
    assert.equal(snapToStep(-5, 0, 10, 1), 0);
    assert.equal(valueFromFraction(0.5, 0, 100, 1), 50);
    assert.equal(valueFromFraction(2, 0, 100, 1), 100);
    assert.equal(clamp(5, 0, 3), 3);
  });

  it('startPointerSession measures once, coalesces moves to one frame with every sample, flushes before the end', async () => {
    const listeners = new Map<string, (e: unknown) => void>();
    let measured = 0;
    let captured: number | null = null;
    const target = {
      addEventListener: (type: string, fn: (e: unknown) => void) => void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
      setPointerCapture: (id: number) => void (captured = id),
      releasePointerCapture: () => void (captured = null),
      hasPointerCapture: () => captured !== null,
      getBoundingClientRect: () => (measured++, rect),
      // Move, up and cancel listen on the window; one map serves both in this fake.
      ownerDocument: {
        defaultView: {
          addEventListener: (type: string, fn: (e: unknown) => void) => void listeners.set(type, fn),
          removeEventListener: (type: string) => void listeners.delete(type),
          requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16) as unknown as number,
          cancelAnimationFrame: (id: number) => clearTimeout(id),
        },
      },
    };
    const ev = (type: string, x: number, extra: object = {}) => ({ type, pointerId: 7, pointerType: 'mouse', button: 0, isPrimary: true, clientX: x, clientY: 0, ...extra }) as unknown as PointerEvent;
    const moves: number[][] = [];
    const ends: boolean[] = [];
    const session = startPointerSession(target as never, ev('pointerdown', 110), {
      onMove: (_e, r, points) => {
        assert.equal(r, rect);
        moves.push(points.map((p) => p.clientX));
      },
      onEnd: (_e, _r, canceled) => void ends.push(canceled),
    });
    assert.ok(session);
    assert.equal(captured, 7);
    listeners.get('pointermove')!(ev('pointermove', 120, { getCoalescedEvents: () => [ev('m', 115), ev('m', 120)] }));
    listeners.get('pointermove')!(ev('pointermove', 130));
    listeners.get('pointermove')!(ev('pointermove', 999, { pointerId: 8 }));
    assert.deepEqual(moves, []);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(moves, [[115, 120, 130]]);
    listeners.get('pointermove')!(ev('pointermove', 140));
    listeners.get('pointerup')!(ev('pointerup', 140));
    // The pending frame is flushed before onEnd.
    assert.deepEqual(moves, [[115, 120, 130], [140]]);
    assert.deepEqual(ends, [false]);
    assert.equal(captured, null);
    assert.equal(listeners.size, 0);
    assert.equal(measured, 1);
    // Non-primary mouse buttons never start; onStart can veto; cancel() and lostpointercapture end as canceled.
    assert.equal(startPointerSession(target as never, ev('pointerdown', 0, { button: 2 }), {}), null);
    assert.equal(startPointerSession(target as never, ev('pointerdown', 0), { onStart: () => false }), null);
    assert.equal(listeners.size, 0);
    startPointerSession(target as never, ev('pointerdown', 0), { onEnd: (_e, _r, c) => void ends.push(c) })!.cancel();
    startPointerSession(target as never, ev('pointerdown', 0), { onEnd: (_e, _r, c) => void ends.push(c) }, { rect });
    listeners.get('lostpointercapture')!(ev('lostpointercapture', 0));
    assert.deepEqual(ends, [false, true, true]);
    assert.equal(measured, 3);
  });
});

describe('Slider markup', () => {
  it('one native range input with min / max / step, value and the thumb position as a CSS variable', () => {
    const markup = renderToString(h(Slider, { id: 's', label: 'Volume', name: 'volume', defaultValue: 30, min: 10, max: 60, step: 5, fill: true }));
    const [input] = inputs(markup);
    assert.equal(inputs(markup).length, 1);
    assert.equal(attr(input!, 'type'), 'range');
    assert.equal(attr(input!, 'name'), 'volume');
    assert.equal(attr(input!, 'min'), '10');
    assert.equal(attr(input!, 'max'), '60');
    assert.equal(attr(input!, 'step'), '5');
    assert.equal(attr(input!, 'value'), '30');
    assert.match(input!, /class="salmon-slider-input salmon-visually-hidden"/);
    assert.match(markup, /--salmon-slider-start:0%;--salmon-slider-end:40%/);
    assert.match(markup, /data-fill=""/);
    assert.doesNotMatch(renderToString(h(Slider, { label: 'x', defaultValue: 30 })), /data-fill/);
    // The root carries `id`; the input is labelled by the visible label.
    assert.match(markup, /^<div id="s"/);
    assert.equal(attr(input!, 'aria-labelledby'), /<span class="salmon-field-label" id="([^"]+)"/.exec(markup)![1]);
  });

  it('a range renders two inputs submitting the same name, named Minimum / Maximum', () => {
    const markup = renderToString(h(Slider, { label: 'Price', name: 'price', defaultValue: [20, 60] as const }));
    const [a, b] = inputs(markup);
    assert.equal(inputs(markup).length, 2);
    assert.equal(attr(a!, 'name'), 'price');
    assert.equal(attr(b!, 'name'), 'price');
    assert.equal(attr(a!, 'value'), '20');
    assert.equal(attr(b!, 'value'), '60');
    assert.equal(attr(a!, 'aria-label'), 'Minimum');
    assert.equal(attr(b!, 'aria-label'), 'Maximum');
    assert.match(markup, /--salmon-slider-start:20%;--salmon-slider-end:60%/);
    assert.match(markup, /data-thumb="start"/);
    const custom = renderToString(h(Slider, { defaultValue: [1, 2] as const, localeText: { start: 'From', end: 'To' } }));
    assert.equal(attr(inputs(custom)[1]!, 'aria-label'), 'To');
  });

  it('values map the native input to indexes; a hidden input submits the entry', () => {
    const markup = renderToString(h(Slider, { name: 'size', values: ['S', 'M', 'L'], defaultValue: 'M' }));
    const [range, hidden] = inputs(markup);
    assert.equal(attr(range!, 'min'), '0');
    assert.equal(attr(range!, 'max'), '2');
    assert.equal(attr(range!, 'value'), '1');
    assert.equal(attr(range!, 'name'), null);
    assert.equal(attr(range!, 'aria-valuetext'), 'M');
    assert.equal(attr(hidden!, 'type'), 'hidden');
    assert.equal(attr(hidden!, 'name'), 'size');
    assert.equal(attr(hidden!, 'value'), 'M');
    assert.match(markup, /--salmon-slider-end:50%/);
  });

  it('tick markup with percentage positions, major labels, minor ticks, placement and renderTick', () => {
    const markup = renderToString(h(Slider, { defaultValue: 0, ticks: { placement: 'after', majorStep: 50, minorStep: 25, showMinor: true } }));
    const ticks = markup.match(/<span class="salmon-slider-tick"[^>]*>/g)!;
    assert.equal(ticks.length, 5);
    assert.deepEqual(ticks.map((t) => /--salmon-slider-tick:([^"]+)"/.exec(t)![1]), ['0%', '25%', '50%', '75%', '100%']);
    assert.deepEqual(ticks.map((t) => t.includes('data-major')), [true, false, true, false, true]);
    assert.deepEqual([...markup.matchAll(/salmon-slider-tick-label">([^<]*)</g)].map((m) => m[1]), ['0', '50', '100']);
    assert.match(markup, /class="salmon-slider-ticks" data-side="after" aria-hidden="true"/);
    assert.match(markup, /data-ticks="after"/);
    const both = renderToString(h(Slider, { ticks: { placement: 'both', majorStep: 50 } }));
    assert.equal(both.match(/class="salmon-slider-ticks"/g)!.length, 2);
    assert.doesNotMatch(renderToString(h(Slider, { ticks: { placement: 'none' } })), /salmon-slider-ticks/);
    assert.doesNotMatch(renderToString(h(Slider, {})), /salmon-slider-ticks/);
    const formatted = renderToString(h(Slider, { max: 1, step: 0.5, ticks: { majorStep: 0.5, formatOptions: { style: 'percent' } } }));
    assert.deepEqual([...formatted.matchAll(/salmon-slider-tick-label">([^<]*)</g)].map((m) => m[1]), ['0%', '50%', '100%']);
    const custom = renderToString(h(Slider, { ticks: { majorStep: 50 }, renderTick: ({ label, major, percent }) => `${label}:${major}:${percent}` }));
    assert.deepEqual([...custom.matchAll(/salmon-slider-tick-label">([^<]*)</g)].map((m) => m[1]), ['0:true:0', '50:true:50', '100:true:100']);
    const values = renderToString(h(Slider, { values: ['a', 'b', 'c'], ticks: {} }));
    assert.deepEqual([...values.matchAll(/salmon-slider-tick-label">([^<]*)</g)].map((m) => m[1]), ['a', 'b', 'c']);
  });

  it('value label show / placement / format and aria-valuetext from formatOptions', () => {
    const markup = renderToString(h(Slider, { defaultValue: 0.25, max: 1, step: 0.05, formatOptions: { style: 'percent' }, valueLabel: { show: 'always', placement: 'after', format: (v) => `v=${v}` } }));
    assert.equal(attr(inputs(markup)[0]!, 'aria-valuetext'), '25%');
    assert.match(markup, /data-value-label="always"/);
    assert.match(markup, /<span class="salmon-slider-value-label" data-placement="after" aria-hidden="true">v=0.25<\/span>/);
    const plain = renderToString(h(Slider, { defaultValue: 3, valueLabel: { formatOptions: { minimumFractionDigits: 1 } } }));
    assert.match(plain, /data-value-label="focus"/);
    assert.match(plain, /data-placement="before" aria-hidden="true">3.0</);
    assert.match(renderToString(h(Slider, {})), /data-value-label="never"/);
    assert.equal(attr(inputs(renderToString(h(Slider, { defaultValue: 1234, locale: 'de-DE', max: 2000 })))[0]!, 'aria-valuetext'), '1.234');
  });

  it('defaults clamp to the bounds; vertical orientation; disabled and read-only', () => {
    const v = renderToString(h(Slider, { orientation: 'vertical', defaultValue: 150, disabled: true, readOnly: true }));
    assert.match(v, /data-orientation="vertical"/);
    assert.equal(attr(inputs(v)[0]!, 'aria-orientation'), 'vertical');
    assert.equal(attr(inputs(v)[0]!, 'value'), '100');
    assert.match(inputs(v)[0]!, /disabled=""/);
    assert.equal(attr(inputs(v)[0]!, 'aria-readonly'), 'true');
    assert.match(v, /data-readonly=""/);
    assert.match(v, /data-disabled=""/);
  });

  it('dir passes to the root; RTL mirroring is logical CSS (no markup change)', () => {
    const ltr = renderToString(h(Slider, { defaultValue: 30 }));
    const rtl = renderToString(h(Slider, { defaultValue: 30, dir: 'rtl' }));
    assert.match(rtl, /dir="rtl"/);
    assert.equal(rtl.replace(' dir="rtl"', ''), ltr);
  });
});

describe('SignaturePad stroke model', () => {
  const stroke = (points: number[], extra: Partial<Stroke> = {}): Stroke => ({ kind: 'stroke', points, color: '#000', minWidth: 0.5, maxWidth: 2.5, velocity: 0.7, ...extra });

  it('velocity narrows the line between minStrokeWidth and maxStrokeWidth; pen pressure maps linearly', () => {
    const slow = widthsOf(stroke([0, 0, -1, 0, 1, 0, -1, 100, 2, 0, -1, 200]));
    const fast = widthsOf(stroke([0, 0, -1, 0, 100, 0, -1, 1, 200, 0, -1, 2]));
    assert.equal(slow[0], 2.5);
    assert.ok(slow[2]! > 2.4 && slow[2]! <= 2.5);
    assert.ok(fast[2]! < 0.6 && fast[2]! >= 0.5);
    for (const w of [...slow, ...fast]) assert.ok(w >= 0.5 && w <= 2.5);
    const pen = widthsOf(stroke([0, 0, 0, 0, 5, 5, 0.5, 1, 9, 9, 1, 2], { minWidth: 1, maxWidth: 3 }));
    assert.deepEqual(pen, [1, 2, 3]);
    // A lower filter weight reacts more slowly to the same speed.
    const damped = widthsOf(stroke([0, 0, -1, 0, 2, 0, -1, 1], { velocity: 0.1 }));
    const quick = widthsOf(stroke([0, 0, -1, 0, 2, 0, -1, 1], { velocity: 0.7 }));
    assert.ok(damped[1]! > quick[1]!);
    const t = new WidthTracker({ minWidth: 1, maxWidth: 4, velocity: 0.7 });
    assert.equal(t.next(0, 0, -1, 0), 4);
  });

  it('segments are cubic Béziers through every point; toSVG writes one path per segment and a dot for a tap', () => {
    const s = stroke([0, 0, -1, 0, 10, 0, -1, 10, 20, 10, -1, 20, 30, 10, -1, 30]);
    const segs: number[][] = [];
    segments(s.points, widthsOf(s), (...args) => void segs.push(args));
    assert.equal(segs.length, 3);
    assert.deepEqual(segs.map((x) => [x[0], x[1], x[6], x[7]]), [[0, 0, 10, 0], [10, 0, 20, 10], [20, 10, 30, 10]]);
    // Partial ranges (live drawing) produce the same segments as a full pass.
    const part: number[][] = [];
    segments(s.points, widthsOf(s), (...args) => void part.push(args), 1, 2);
    assert.deepEqual(part, [segs[1]]);
    const svg = toSVG({ base: null, items: [s, stroke([5, 5, -1, 0])] }, 200, 100, { color: '#fff' });
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="100" viewBox="0 0 200 100">/);
    assert.match(svg, /<rect width="100%" height="100%" fill="#fff"\/>/);
    assert.equal(svg.match(/<path /g)!.length, 3);
    assert.match(svg, /<circle cx="5" cy="5" r="1.25" fill="#000"\/>/);
    assert.match(svg, /stroke-linecap="round"/);
    assert.doesNotMatch(toSVG({ base: null, items: [s] }, 200, 100, null), /<rect/);
    assert.equal(toSVG(EMPTY_STATE, 10, 10, null), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"></svg>');
  });

  it('text items are escaped in SVG; a loaded base image is an <image>', () => {
    const svg = toSVG({ base: 'data:image/png;base64,AA', items: [{ kind: 'text', text: 'A&<B>', fontFamily: 'cursive', fontSize: 0, color: '#000' }] }, 200, 100, null);
    assert.match(svg, /<image href="data:image\/png;base64,AA" width="200" height="100"/);
    assert.match(svg, />A&amp;&lt;B&gt;<\/text>/);
    assert.match(svg, /font-size="40"/);
  });
});

describe('SignaturePad markup', () => {
  it('a sized surface with a canvas role="img" named empty; touch-action is CSS on the canvas', () => {
    const markup = renderToString(h(SignaturePad, { id: 'sig', label: 'Sign here', name: 'signature', height: 120 }));
    assert.match(markup, /^<div id="sig" class="salmon-field salmon-signature-pad"/);
    assert.match(markup, /<div class="salmon-signature-pad-surface" style="block-size:120px">/);
    const canvas = /<canvas[^>]*>/.exec(markup)![0];
    assert.equal(attr(canvas, 'role'), 'img');
    assert.equal(attr(canvas, 'aria-label'), 'Signature, empty');
    assert.equal(attr(canvas, 'tabindex'), '0');
    // No backing-store size on the server: the client sets it after mount, so markup is identical.
    assert.equal(attr(canvas, 'width'), null);
    const id = attr(canvas, 'id');
    assert.equal(attr(canvas, 'aria-labelledby'), `${/<span class="salmon-field-label" id="([^"]+)"/.exec(markup)![1]} ${id}`);
    assert.match(markup, /data-empty=""/);
    assert.match(markup, /<button type="button" class="salmon-signature-pad-button" aria-pressed="false">Type your name<\/button>/);
    assert.match(markup, /disabled="">Clear<\/button>/);
    assert.match(markup, /<input type="hidden" name="signature" value=""\/>/);
  });

  it('defaultValue / value fill the hidden input; localeText, readOnly and toolbar=false', () => {
    const url = 'data:image/png;base64,AAAA';
    const markup = renderToString(h(SignaturePad, { name: 's', defaultValue: url, localeText: { signed: 'Signed', typeMode: 'Type', clear: 'Erase' } }));
    assert.match(markup, /aria-label="Signed"/);
    assert.match(markup, new RegExp(`<input type="hidden" name="s" value="${url}"/>`));
    assert.match(markup, />Type<\/button>/);
    assert.match(markup, />Erase<\/button>/);
    assert.doesNotMatch(markup, /data-empty/);
    assert.match(renderToString(h(SignaturePad, { name: 's', value: url })), new RegExp(`value="${url}"`));
    assert.doesNotMatch(renderToString(h(SignaturePad, { readOnly: true })), /salmon-signature-pad-toolbar/);
    assert.doesNotMatch(renderToString(h(SignaturePad, { toolbar: false })), /salmon-signature-pad-toolbar/);
    assert.match(renderToString(h(SignaturePad, { height: '10rem', disabled: true })), /style="block-size:10rem"[^]*tabindex="-1"/);
  });
});
