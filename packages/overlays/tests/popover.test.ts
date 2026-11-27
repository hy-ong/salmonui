// Popover server markup and the placement math it adds to the positioning
// primitive. Interaction tests: tests/browser/popover.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Popover, PopoverContent, PopoverTrigger } from '@salmonui/overlays/popover';
import { computePosition } from '../../core/dist/internal/position.js';
import { splitOffset, toPlacement } from '../dist/internal/placement.js';

describe('Popover markup', () => {
  it('renders only the trigger on the server, closed even with defaultOpen', () => {
    for (const defaultOpen of [false, true]) {
      const out = renderToString(h(Popover, { defaultOpen }, h(Popover.Trigger, null, 'Filters'), h(Popover.Content, null, h('p', null, 'Body'))));
      assert.match(out, /^<button aria-haspopup="dialog" aria-expanded="false" type="button" class="salmon-popover-trigger">Filters<\/button>$/);
    }
  });

  it('the render prop receives the computed trigger props; className is appended', () => {
    const out = renderToString(h(Popover, null, h(PopoverTrigger, { className: 'mine', render: (p) => h('a', { ...p, href: '#x' }) }, 'Go'), h(PopoverContent)));
    assert.match(out, /^<a aria-haspopup="dialog" aria-expanded="false" type="button" class="salmon-popover-trigger mine" href="#x">Go<\/a>$/);
  });

  it('the stylesheet is self-contained and in styles.css', () => {
    const css = readFileSync(new URL('../dist/popover.css', import.meta.url), 'utf8');
    assert.match(css, /\.salmon-popover\b/);
    assert.doesNotMatch(css, /@import/);
    // Each module sits in its cascade layer: the aggregate holds the source module.
    assert.ok(readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8').includes(readFileSync(new URL('../styles/popover.css', import.meta.url), 'utf8')));
  });
});

describe('placement vocabulary', () => {
  it('maps the twelve logical placements onto the positioning primitive', () => {
    const expected = {
      top: 'top',
      topStart: 'top-start',
      topEnd: 'top-end',
      bottom: 'bottom',
      bottomStart: 'bottom-start',
      bottomEnd: 'bottom-end',
      start: 'start',
      startTop: 'start-start',
      startBottom: 'start-end',
      end: 'end',
      endTop: 'end-start',
      endBottom: 'end-end',
    } as const;
    for (const [from, to] of Object.entries(expected)) assert.equal(toPlacement(from as keyof typeof expected, 'top'), to);
    assert.equal(toPlacement(undefined, 'bottom'), 'bottom');
  });

  it('splits the offset prop', () => {
    assert.deepEqual(splitOffset(undefined, 8), { main: 8, cross: 0 });
    assert.deepEqual(splitOffset(4, 8), { main: 4, cross: 0 });
    assert.deepEqual(splitOffset({ crossAxis: 6 }, 8), { main: 8, cross: 6 });
  });
});

describe('computePosition additions', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 100 };

  it('crossOffset moves along the edge, mirrored in RTL on top / bottom', () => {
    const anchor = { left: 400, top: 300, width: 100, height: 30 };
    assert.equal(computePosition(anchor, size, viewport, { placement: 'bottom-start', crossOffset: 10 }).x, 410);
    assert.equal(computePosition(anchor, size, viewport, { placement: 'bottom-start', crossOffset: 10, rtl: true }).x, 290);
    assert.equal(computePosition(anchor, size, viewport, { placement: 'right-start', crossOffset: 10 }).y, 310);
  });

  it('arrow points at the anchor center, clamped inside the box after a shift', () => {
    const centered = computePosition({ left: 400, top: 300, width: 100, height: 30 }, size, viewport, { placement: 'bottom' });
    assert.equal(centered.arrow, 100);
    // Anchor at the left edge: the box shifts right, the arrow moves left (clamped to the 8 px padding).
    const shifted = computePosition({ left: 0, top: 300, width: 4, height: 30 }, size, viewport, { placement: 'bottom' });
    assert.equal(shifted.x, 8);
    assert.equal(shifted.arrow, 8);
    const side = computePosition({ left: 400, top: 300, width: 100, height: 30 }, size, viewport, { placement: 'right' });
    assert.equal(side.arrow, 50);
  });

  it('a collision boundary replaces the viewport', () => {
    const boundary = { left: 100, top: 100, width: 300, height: 200 };
    const anchor = { left: 300, top: 150, width: 40, height: 20 };
    const narrow = { width: 150, height: 100 };
    const free = computePosition(anchor, narrow, viewport, { placement: 'right' });
    assert.equal(free.side, 'right');
    const bounded = computePosition(anchor, narrow, viewport, { placement: 'right', boundary });
    // No room to the right inside the boundary: flips left and stays inside it.
    assert.equal(bounded.side, 'left');
    assert.ok(bounded.x >= boundary.left + 8);
    assert.ok(bounded.y + narrow.height <= boundary.top + boundary.height - 8);
    // Too wide for either inline side inside the boundary: below the anchor, not over it.
    const wide = computePosition(anchor, size, viewport, { placement: 'right', boundary });
    assert.equal(wide.side, 'bottom');
    assert.ok(wide.y >= anchor.top + anchor.height && wide.y + size.height <= boundary.top + boundary.height - 8);
  });
});
