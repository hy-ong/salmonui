import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { placeBox as gridPlaceBox } from '../../data-grid/dist/data-grid/popover.js';
import { useControllableState } from '../dist/internal/controllable.js';
import { modalHostOf, portalScopeOf } from '../dist/internal/modal-host.js';
import { Overlay, Portal } from '../dist/internal/overlay.js';
import { computePosition, parsePlacement, physicalSide, placeBox, pointRect, type Placement } from '../dist/internal/position.js';
import { createRepeater, pointerSource, pressSource } from '../dist/internal/press.js';
import { applyRovingMove, createTypeahead, firstEnabled, isTypeaheadKey, lastEnabled, rovingMove, stepIndex, typeahead, TYPEAHEAD_MS } from '../dist/internal/roving.js';

// Internal primitives shared by the non-grid components. The pure parts run here; the DOM and React
// behaviour (dismiss stack, focus scope, top layer, controlled state
// changes) runs in tests/browser/internal-primitives.spec.ts.

const viewport = { width: 1000, height: 800 };
const box = { width: 200, height: 100 };
const anchor = { left: 400, top: 300, width: 100, height: 40 };

describe('position: computePosition', () => {
  it('places each of the 12 physical placements next to the anchor', () => {
    const expected: Record<string, { x: number; y: number }> = {
      'bottom-start': { x: 400, y: 342 },
      bottom: { x: 350, y: 342 },
      'bottom-end': { x: 300, y: 342 },
      'top-start': { x: 400, y: 198 },
      top: { x: 350, y: 198 },
      'top-end': { x: 300, y: 198 },
      'right-start': { x: 502, y: 300 },
      right: { x: 502, y: 270 },
      'right-end': { x: 502, y: 240 },
      'left-start': { x: 198, y: 300 },
      left: { x: 198, y: 270 },
      'left-end': { x: 198, y: 240 },
    };
    for (const [placement, xy] of Object.entries(expected)) {
      const p = computePosition(anchor, box, viewport, { placement: placement as Placement });
      assert.deepEqual({ x: p.x, y: p.y }, xy, placement);
      assert.equal(p.placement, placement, placement);
    }
  });

  it('mirrors inline alignment and logical sides in RTL; block alignment is not mirrored', () => {
    assert.equal(computePosition(anchor, box, viewport, { placement: 'bottom-start', rtl: true }).x, 300);
    assert.equal(computePosition(anchor, box, viewport, { placement: 'bottom-end', rtl: true }).x, 400);
    const end = computePosition(anchor, box, viewport, { placement: 'end-start', rtl: true });
    assert.equal(end.side, 'left');
    assert.deepEqual({ x: end.x, y: end.y }, { x: 198, y: 300 });
    assert.equal(computePosition(anchor, box, viewport, { placement: 'start' }).side, 'left');
    assert.equal(physicalSide('start', true), 'right');
    assert.deepEqual(parsePlacement('end-start'), { side: 'end', align: 'start' });
    assert.deepEqual(parsePlacement('top'), { side: 'top', align: 'center' });
  });

  it('flips to the opposite side when the preferred one is too small, or to the roomier side', () => {
    const low = { left: 400, top: 740, width: 100, height: 40 };
    assert.equal(computePosition(low, box, viewport).side, 'top');
    assert.equal(computePosition(low, box, viewport, { flip: false }).side, 'bottom');
    const high = { left: 400, top: 10, width: 100, height: 40 };
    assert.equal(computePosition(high, box, viewport, { placement: 'top' }).side, 'bottom');
    // Fits on neither side: the roomier one.
    const tall = { width: 200, height: 700 };
    assert.equal(computePosition({ left: 400, top: 500, width: 100, height: 40 }, tall, viewport).side, 'top');
    assert.equal(computePosition({ left: 400, top: 200, width: 100, height: 40 }, tall, viewport).side, 'bottom');
    const edge = { left: 900, top: 300, width: 60, height: 40 };
    assert.equal(computePosition(edge, box, viewport, { placement: 'right' }).side, 'left');
    // Fits on neither inline side: a block side (bottom first, else the roomier one), never over the anchor.
    const wide = { width: 500, height: 100 };
    const mid = { left: 400, top: 300, width: 100, height: 30 };
    for (const placement of ['right', 'left', 'end-start', 'start'] as const) {
      const p = computePosition(mid, wide, viewport, { placement });
      assert.equal(p.side, 'bottom', placement);
      assert.ok(p.y >= 330, placement);
    }
    const near = computePosition({ left: 400, top: 700, width: 100, height: 30 }, wide, viewport, { placement: 'right' });
    assert.equal(near.side, 'top');
    assert.ok(near.y + wide.height <= 700);
  });

  it('shifts the box into the viewport margin on both axes', () => {
    const p = computePosition({ left: 950, top: 300, width: 40, height: 20 }, box, viewport);
    assert.equal(p.x, 1000 - 8 - 200);
    const q = computePosition({ left: -50, top: 300, width: 40, height: 20 }, box, viewport, { margin: 4 });
    assert.equal(q.x, 4);
    const unshifted = computePosition({ left: 950, top: 300, width: 40, height: 20 }, box, viewport, { shift: false });
    assert.equal(unshifted.x, 950);
  });

  it('reports the room on the resolved side (size)', () => {
    const p = computePosition(anchor, box, viewport);
    assert.equal(p.availableHeight, 800 - 8 - 340 - 2);
    assert.equal(p.availableWidth, 1000 - 16);
    const side = computePosition(anchor, box, viewport, { placement: 'right' });
    assert.equal(side.availableWidth, 1000 - 8 - 500 - 2);
    assert.equal(side.availableHeight, 800 - 16);
  });

  it('anchors to a virtual point', () => {
    const p = computePosition(pointRect(120, 80), box, viewport, { offset: 0 });
    assert.deepEqual({ x: p.x, y: p.y }, { x: 120, y: 80 });
  });

  it('placeBox matches the Data Grid copy whenever the box fits on a side', () => {
    let seed = 7;
    const rnd = (n: number): number => ((seed = (seed * 16807) % 2147483647) % n + n) % n;
    let compared = 0;
    for (let i = 0; i < 4000; i++) {
      const a = { left: rnd(1000), top: rnd(800), width: rnd(200), height: rnd(60) };
      const s = { width: 20 + rnd(300), height: 20 + rnd(300) };
      const rtl = rnd(2) === 1;
      const side = rnd(2) === 1 ? 'inline' : 'block';
      // The grid flips unconditionally (inline) or never (block) when neither side fits.
      const fitsAfter = side === 'block' ? a.top + a.height + 2 + s.height <= 792 : rtl ? a.left - s.width >= 8 : a.left + a.width + s.width <= 992;
      const fitsBefore = side === 'block' ? a.top - 2 - s.height >= 8 : rtl ? a.left + a.width + s.width <= 992 : a.left - s.width >= 8;
      if (!fitsAfter && !fitsBefore) continue;
      compared++;
      assert.deepEqual(placeBox(a, s, viewport, rtl, side), gridPlaceBox(a, s, viewport, rtl, side), JSON.stringify({ a, s, rtl, side }));
    }
    assert.ok(compared > 2000, `${compared}`);
  });
});

describe('roving', () => {
  const enabled = (disabled: readonly number[]) => (i: number) => !disabled.includes(i);

  it('maps keys by orientation, mirroring horizontal arrows in RTL', () => {
    assert.equal(rovingMove('ArrowDown'), 'next');
    assert.equal(rovingMove('ArrowRight'), null);
    assert.equal(rovingMove('ArrowRight', { orientation: 'horizontal' }), 'next');
    assert.equal(rovingMove('ArrowRight', { orientation: 'horizontal', rtl: true }), 'prev');
    assert.equal(rovingMove('ArrowLeft', { orientation: 'both', rtl: true }), 'next');
    assert.equal(rovingMove('ArrowDown', { orientation: 'horizontal' }), null);
    assert.equal(rovingMove('Home'), 'first');
    assert.equal(rovingMove('End', { homeEnd: false }), null);
    assert.equal(rovingMove('a'), null);
  });

  it('skips disabled items, wraps when looping and stops at the ends otherwise', () => {
    const e = enabled([1, 3]);
    assert.equal(stepIndex(5, 0, 1, e), 2);
    assert.equal(stepIndex(5, 4, 1, e), 0);
    assert.equal(stepIndex(5, 4, 1, e, false), 4);
    assert.equal(stepIndex(5, 0, -1, e), 4);
    assert.equal(applyRovingMove('prev', 5, -1, e), 4);
    assert.equal(applyRovingMove('first', 5, 2, enabled([0])), 1);
    assert.equal(applyRovingMove('last', 5, 0, enabled([4])), 3);
    assert.equal(firstEnabled(3, () => false), -1);
    assert.equal(lastEnabled(3, () => false), -1);
    assert.equal(stepIndex(3, 1, 1, () => false), 1);
  });

  it('typeahead: prefix match ignoring case and accents, buffer refines, timeout resets, repeats cycle', () => {
    const labels = ['Apple', 'Banana', 'Ábaco', 'Blueberry', 'Cherry', 'Avocado'];
    const label = (i: number) => labels[i] as string;
    const all = () => true;
    const s = createTypeahead();
    assert.equal(typeahead(s, 'b', 0, 6, 0, label, all), 1);
    assert.equal(typeahead(s, 'l', 100, 6, 1, label, all), 3);
    // Timeout: a new search after the active item.
    assert.equal(typeahead(s, 'a', 100 + TYPEAHEAD_MS + 1, 6, 3, label, all), 5);
    // "aa" cycles through items starting with "a" (accent-insensitive).
    const r = createTypeahead();
    assert.equal(typeahead(r, 'a', 0, 6, -1, label, all), 0);
    assert.equal(typeahead(r, 'a', 50, 6, 0, label, all), 2);
    assert.equal(typeahead(r, 'a', 100, 6, 2, label, all), 5);
    // Disabled items are skipped; no match returns -1.
    assert.equal(typeahead(createTypeahead(), 'b', 0, 6, 0, label, (i) => i !== 1), 3);
    assert.equal(typeahead(createTypeahead(), 'z', 0, 6, 0, label, all), -1);
    // Space starts no search (it activates), but joins a running buffer.
    const sp = createTypeahead();
    assert.equal(typeahead(sp, ' ', 0, 6, 0, label, all), -1);
    assert.equal(sp.text, '');
    assert.ok(isTypeaheadKey({ key: 'x' }));
    assert.ok(!isTypeaheadKey({ key: 'x', ctrlKey: true }));
    assert.ok(!isTypeaheadKey({ key: 'ArrowDown' }));
  });
});

describe('press', () => {
  it('detects the input source of a click', () => {
    assert.equal(pressSource({ detail: 0 }), 'keyboard');
    assert.equal(pressSource({ detail: 1, nativeEvent: { pointerType: 'touch' } }), 'touch');
    assert.equal(pressSource({ detail: 1, nativeEvent: { pointerType: 'mouse' } }), 'pointer');
    assert.equal(pressSource({ detail: 1, pointerType: 'pen' }), 'pointer');
    assert.equal(pointerSource('touch'), 'touch');
  });

  it('repeats after the delay at the interval until stopped', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const calls: [string, boolean][] = [];
      const r = createRepeater();
      r.start((source, repeat) => calls.push([source, repeat]), 'pointer', { delay: 300, interval: 50 });
      assert.deepEqual(calls, [['pointer', false]]);
      mock.timers.tick(299);
      assert.equal(calls.length, 1);
      mock.timers.tick(1);
      assert.deepEqual(calls[1], ['pointer', true]);
      // One tick per interval: mocked timers scheduled during a tick run on the next one.
      mock.timers.tick(50);
      mock.timers.tick(50);
      assert.equal(calls.length, 4);
      r.stop();
      assert.equal(r.running, false);
      mock.timers.tick(1000);
      assert.equal(calls.length, 4);
    } finally {
      mock.timers.reset();
    }
  });

  it('stops when the press callback stops it (a limit was reached)', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const r = createRepeater();
      let n = 0;
      r.start(() => {
        if (++n === 3) r.stop();
      }, 'keyboard');
      for (let t = 0; t < 50; t++) mock.timers.tick(100);
      assert.equal(n, 3);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('overlay and controllable state on the server', () => {
  it('Portal and Overlay render nothing on the server (popups mount after hydration)', () => {
    const html = renderToString(
      createElement('div', null, createElement(Portal, null, createElement('span', null, 'portal')), createElement(Overlay, { anchor: pointRect(0, 0) }, 'overlay')),
    );
    assert.equal(html, '<div></div>');
  });

  it('useControllableState renders the controlled value or the default', () => {
    function Probe(props: { value?: string; defaultValue: string }) {
      const [value] = useControllableState(props.value, props.defaultValue, undefined);
      return createElement('output', null, value);
    }
    assert.equal(renderToString(createElement(Probe, { defaultValue: 'a' })), '<output>a</output>');
    assert.equal(renderToString(createElement(Probe, { value: 'b', defaultValue: 'a' })), '<output>b</output>');
    function Lazy() {
      const [calls] = useState(() => ({ n: 0 }));
      const [value] = useControllableState<number>(undefined, () => ++calls.n, undefined);
      return createElement('output', null, value);
    }
    assert.equal(renderToString(createElement(Lazy)), '<output>1</output>');
  });
});

describe('modal host (popups inside modal dialogs)', () => {
  // Element stand-ins; the real `:modal` matching runs in tests/browser/modal-popups.spec.ts.
  it('modalHostOf asks the anchor for the nearest open modal dialog', () => {
    assert.equal(modalHostOf({ closest: (selector: string) => (assert.equal(selector, ':modal'), 'host') }), 'host');
    assert.equal(modalHostOf({ closest: () => null }), null);
    assert.equal(modalHostOf(null), null);
    assert.equal(modalHostOf({ left: 0, top: 0, width: 0, height: 0 }), null);
  });

  // `:modal` is a selector syntax error before Chrome 105 / Firefox 103 / Safari 15.6.
  const throwsOnModal = (themeScope: unknown) =>
    ({
      ownerDocument: { body: 'body' },
      closest(selector: string) {
        if (selector.includes(':modal')) throw new SyntaxError(`'${selector}' is not a valid selector`);
        return themeScope;
      },
    }) as unknown as Element;

  it('modalHostOf finds no modal host where :modal does not parse', () => {
    assert.equal(modalHostOf(throwsOnModal('scope')), null);
  });

  it('portalScopeOf: the nearest modal dialog or theme scope, else the body; the theme scope where :modal does not parse', () => {
    const el = (found: unknown) => ({ ownerDocument: { body: 'body' }, closest: (selector: string) => (selector === ':modal,.salmon-theme-scope' ? found : null) }) as unknown as Element;
    assert.equal(portalScopeOf(el('dialog')), 'dialog');
    assert.equal(portalScopeOf(el(null)), 'body');
    assert.equal(portalScopeOf(throwsOnModal('scope')), 'scope');
    assert.equal(portalScopeOf(throwsOnModal(null)), 'body');
  });

  it('a Portal container getter is never called during a server render (external-store snapshot, not the render body)', () => {
    const container = mock.fn((): Element | null => null);
    assert.equal(renderToString(createElement(Portal, { container, children: createElement('span', null, 'portal') })), '');
    assert.equal(container.mock.callCount(), 0);
  });
});
