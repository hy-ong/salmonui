// DashboardLayout: the
// framework-agnostic layout algorithm (internal/grid-layout.ts) in Node and
// the server markup. Pointer, keyboard, stacking and axe tests:
// tests/browser/dashboard-layout.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DashboardLayout, DashboardLayoutPanel, type DashboardLayoutItem } from '@salmonui/layout/dashboard-layout';
import { clampItem, collides, moveItem, resizeItem, sameLayout, settle, type GridLayoutItem } from '../dist/internal/grid-layout.js';

const html = (el: ReactElement) => renderToString(el);
const pos = (layout: readonly GridLayoutItem[]) => Object.fromEntries(layout.map((i) => [i.id, [i.x, i.y, i.w, i.h]]));
const noOverlap = (layout: readonly GridLayoutItem[]) => layout.every((a) => layout.every((b) => !collides(a, b)));

describe('grid-layout algorithm', () => {
  it('clampItem applies min / max sizes, the column count and non-negative positions', () => {
    assert.deepEqual(pos([clampItem({ id: 'a', x: 10, y: -2, w: 6, h: 9, maxH: 4 }, 12)]), { a: [6, 0, 6, 4] });
    assert.deepEqual(pos([clampItem({ id: 'a', x: 0, y: 0, w: 1, h: 1, minW: 3, minH: 2 }, 12)]), { a: [0, 0, 3, 2] });
    assert.deepEqual(pos([clampItem({ id: 'a', x: 3, y: 0, w: 20, h: 1, maxW: 8 }, 6)]), { a: [0, 0, 6, 1] });
    const same = { id: 'a', x: 1, y: 1, w: 2, h: 2 };
    assert.equal(clampItem(same, 12), same, 'an item already in range is returned as is');
  });

  it('settle resolves overlaps and compacts vertically; compact false keeps gaps', () => {
    const layout = [
      { id: 'a', x: 0, y: 3, w: 4, h: 2 },
      { id: 'b', x: 0, y: 3, w: 4, h: 1 },
      { id: 'c', x: 4, y: 6, w: 2, h: 2 },
    ];
    const compacted = settle(layout, 12, 'vertical');
    assert.deepEqual(pos(compacted), { a: [0, 0, 4, 2], b: [0, 2, 4, 1], c: [4, 0, 2, 2] });
    assert.deepEqual(compacted.map((i) => i.id), ['a', 'b', 'c'], 'input order is kept');
    const loose = settle(layout, 12, false);
    assert.deepEqual(pos(loose), { a: [0, 3, 4, 2], b: [0, 5, 4, 1], c: [4, 6, 2, 2] });
    assert.ok(noOverlap(compacted) && noOverlap(loose));
    const tidy = [{ id: 'a', x: 0, y: 0, w: 2, h: 2 }];
    assert.equal(settle(tidy, 12, 'vertical')[0], tidy[0], 'unchanged items keep their identity');
  });

  it('moveItem swaps with the item it lands on, pushes others down and never moves static items', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 2 },
      { id: 'b', x: 0, y: 2, w: 6, h: 2 },
      { id: 's', x: 6, y: 0, w: 6, h: 2, static: true },
    ];
    // a dropped onto b: b takes the space above.
    assert.deepEqual(pos(moveItem(layout, 'a', 0, 2, 12, 'vertical')), { a: [0, 2, 6, 2], b: [0, 0, 6, 2], s: [6, 0, 6, 2] });
    // A half step is undone by the compaction.
    assert.deepEqual(pos(moveItem(layout, 'a', 0, 1, 12, 'vertical')), pos(layout));
    // Onto the static item: the moving item goes below it; the static one stays.
    assert.deepEqual(pos(moveItem(layout, 'a', 6, 0, 12, false)), { a: [6, 2, 6, 2], b: [0, 2, 6, 2], s: [6, 0, 6, 2] });
    // A static item itself does not move.
    assert.deepEqual(pos(moveItem(layout, 's', 0, 5, 12, 'vertical')), pos(layout));
    // Out of range targets are clamped into the grid.
    assert.deepEqual(pos(moveItem(layout, 'b', 20, 0, 12, false)).b, [6, 2, 6, 2]);
  });

  it('resizeItem grows into neighbours, which move away, within min / max sizes', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 4, h: 2, maxW: 6 },
      { id: 'b', x: 4, y: 0, w: 4, h: 2 },
    ];
    const wider = resizeItem(layout, 'a', { x: 0, y: 0, w: 10, h: 2 }, 12, 'vertical');
    assert.deepEqual(pos(wider), { a: [0, 0, 6, 2], b: [4, 2, 4, 2] });
    assert.ok(noOverlap(wider));
    assert.deepEqual(pos(resizeItem(layout, 'a', { x: 0, y: 0, w: 4, h: 0 }, 12, 'vertical')).a, [0, 0, 4, 1]);
  });

  it('sameLayout compares cells; the layout value round-trips through JSON', () => {
    const layout: DashboardLayoutItem[] = [
      { id: 'a', x: 0, y: 0, w: 2, h: 2, minW: 1, maxH: 4 },
      { id: 'b', x: 2, y: 0, w: 2, h: 1, static: true },
    ];
    const restored = JSON.parse(JSON.stringify(layout)) as DashboardLayoutItem[];
    assert.deepEqual(restored, layout);
    assert.ok(sameLayout(restored, layout));
    assert.ok(!sameLayout(moveItem(layout, 'a', 4, 0, 12, false), layout));
  });
});

const panels = (ids: readonly string[]) => ids.map((id) => h(DashboardLayoutPanel, { key: id, id, header: `Panel ${id}` }, `Body ${id}`));

describe('DashboardLayout markup', () => {
  it('columns, gap, rowHeight or cellAspectRatio, showGridLines become custom properties', () => {
    const out = html(h(DashboardLayout, { columns: 6, gap: [4, 12], rowHeight: 90, showGridLines: true, defaultLayout: [{ id: 'a', x: 1, y: 0, w: 2, h: 3 }] }, panels(['a'])));
    assert.match(out, /^<div class="salmon-dashboard" style="--salmon-dashboard-columns:6;--salmon-dashboard-gap-x:4px;--salmon-dashboard-gap-y:12px;--salmon-dashboard-row:90px" data-grid-lines="">/);
    assert.match(out, /<div class="salmon-dashboard-scale"><div class="salmon-dashboard-grid">/);
    const ratio = html(h(DashboardLayout, { cellAspectRatio: 2 }, panels(['a'])));
    assert.match(ratio, /--salmon-dashboard-columns:12;--salmon-dashboard-gap-x:8px;--salmon-dashboard-gap-y:8px;--salmon-dashboard-ratio:2"/);
    assert.doesNotMatch(ratio, /data-grid-lines/);
  });

  it('panels are placed from the layout value; header labels the panel; className / style pass through', () => {
    const out = html(
      h(
        DashboardLayout,
        { id: 'd', className: 'board', style: { minHeight: 200 }, layout: [{ id: 'a', x: 2, y: 1, w: 3, h: 2 }, { id: 'b', x: 0, y: 0, w: 2, h: 1 }], compact: false },
        h(DashboardLayoutPanel, { id: 'a', header: 'Sales', className: 'sales', style: { background: 'red' } }, 'Chart'),
        h(DashboardLayoutPanel, { id: 'b', 'aria-label': 'Notes' }, 'Text'),
      ),
    );
    assert.match(out, /^<div id="d" class="salmon-dashboard board" style="[^"]*min-height:200px"/);
    assert.match(out, /role="group" aria-roledescription="panel" aria-labelledby="([^"]+)-a-header" aria-describedby="\1-help" tabindex="0" id="\1-a" class="salmon-dashboard-panel sales" data-id="a" style="--salmon-dashboard-x:3;--salmon-dashboard-y:2;--salmon-dashboard-w:3;--salmon-dashboard-h:2;--salmon-dashboard-order:1;background:red"/);
    assert.match(out, /<div class="salmon-dashboard-panel-header" id="[^"]+-a-header">Sales<\/div><div class="salmon-dashboard-panel-content">Chart<\/div>/);
    assert.match(out, /aria-label="Notes"[^>]*data-id="b" style="--salmon-dashboard-x:1;--salmon-dashboard-y:1;--salmon-dashboard-w:2;--salmon-dashboard-h:1;--salmon-dashboard-order:0"/);
    assert.equal(DashboardLayout.Panel, DashboardLayoutPanel);  });

  it('the rendered layout is settled; children without an item are appended; items without a child are dropped', () => {
    const out = html(h(DashboardLayout, { layout: [{ id: 'a', x: 0, y: 4, w: 2, h: 2 }, { id: 'gone', x: 0, y: 0, w: 12, h: 9 }] }, panels(['a', 'new'])));
    assert.match(out, /data-id="a" style="--salmon-dashboard-x:1;--salmon-dashboard-y:1;/);
    assert.match(out, /data-id="new" style="--salmon-dashboard-x:1;--salmon-dashboard-y:3;--salmon-dashboard-w:1;--salmon-dashboard-h:1/);
    assert.doesNotMatch(out, /data-id="gone"/);
  });

  it('draggable, dragHandle, resizable edges and static panels', () => {
    const out = html(h(DashboardLayout, { resizable: ['bottom-end', 'start'], defaultLayout: [{ id: 'a', x: 0, y: 0, w: 2, h: 2 }, { id: 's', x: 2, y: 0, w: 2, h: 2, static: true }] }, panels(['a', 's'])));
    assert.match(out, /data-id="a"[^>]*data-draggable=""/);
    assert.equal((out.match(/class="salmon-dashboard-resize"/g) ?? []).length, 2, 'static panels get no handles');
    assert.match(out, /class="salmon-dashboard-resize" data-edge="bottom-end" aria-hidden="true"/);
    assert.match(out, /data-id="s" data-static=""/);
    assert.doesNotMatch(out.slice(out.indexOf('data-id="s"') - 300, out.indexOf('data-id="s"')), /tabindex/);
    const handle = html(h(DashboardLayout, { dragHandle: '.salmon-dashboard-panel-header', resizable: true }, panels(['a'])));
    assert.doesNotMatch(handle, /data-draggable/);
    assert.match(handle, /data-edge="bottom-end"/);
    const fixed = html(h(DashboardLayout, { draggable: false }, panels(['a'])));
    assert.doesNotMatch(fixed, /tabindex|data-draggable|salmon-dashboard-resize"/);
  });

  it('responsive.stackBelow sets the container-query scale; no measurement on the server', () => {
    const out = html(h(DashboardLayout, { responsive: { stackBelow: 640 } }, panels(['a'])));
    assert.match(out, /--salmon-dashboard-k:0.15625" data-stack-below="640"/);
  });

  it('instructions and an empty live region exist in the server HTML; localeText replaces the texts', () => {
    const out = html(h(DashboardLayout, { localeText: { panel: 'widget', instructions: 'Use Enter' } }, panels(['a'])));
    assert.match(out, /aria-roledescription="widget"/);
    assert.match(out, /<div id="[^"]+-help" hidden="">Use Enter<\/div><div class="salmon-visually-hidden" role="status" aria-live="polite" aria-atomic="true"><\/div><\/div>$/);
  });

  it('the stylesheet is logical, carries the core a11y.css first and is in styles.css', () => {
    const css = readFileSync(new URL('../dist/dashboard-layout.css', import.meta.url), 'utf8');
    // The live region's visually hidden class: the core a11y module, carried before the own rules.
    // Each module sits in its cascade layer, a11y below the own rules.
    const a11y = readFileSync(new URL('../../core/styles/a11y.css', import.meta.url), 'utf8');
    const ownRules = readFileSync(new URL('../styles/dashboard-layout.css', import.meta.url), 'utf8');
    assert.ok(css.includes(a11y) && css.indexOf(a11y) < css.indexOf(ownRules));
    assert.match(css, /\.salmon-visually-hidden \{/);
    assert.doesNotMatch(readFileSync(new URL(import.meta.resolve('@salmonui/core/styles.css')), 'utf8'), /\.salmon-visually-hidden/);
    assert.match(css, /@container salmon-dashboard \(width < 100px\)/);
    assert.doesNotMatch(css, /@import/);
    assert.doesNotMatch(css, /(?<![-\w])(left|right|margin-left|margin-right|padding-left|padding-right|width|height)\s*:/);
    const own = readFileSync(new URL('../styles/dashboard-layout.css', import.meta.url), 'utf8');
    assert.ok(readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8').includes(own));
  });
});
