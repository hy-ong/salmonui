import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { count, render } from './fixtures.ts';
import { adaptiveActiveFor, cardHeight, resolveAdaptive } from '../dist/data-grid/adaptive-view.js';

// Adaptive UI in the server HTML and the pure mode projection: the mode,
// vertical cards, the SSR contract (the server mode
// comes from the prop only), and the accessibility tree of cards.

describe('adaptive mode projection', () => {
  it('normalizes the prop', () => {
    assert.equal(resolveAdaptive(undefined), null);
    assert.equal(resolveAdaptive(false), null);
    assert.deepEqual(resolveAdaptive(true), { target: 'both', rowLayout: 'horizontal', breakpoint: 640, defaultActive: false });
    assert.deepEqual(resolveAdaptive({ target: 'mobile', rowLayout: 'vertical', breakpoint: 500 }), { target: 'mobile', rowLayout: 'vertical', breakpoint: 500, defaultActive: false });
  });

  it('derives the mode from the container width and the target', () => {
    const both = resolveAdaptive(true);
    const mobile = resolveAdaptive({ target: 'mobile' });
    const desktop = resolveAdaptive({ target: 'desktop' });
    assert.equal(adaptiveActiveFor(null, 300), false);
    assert.equal(adaptiveActiveFor(both, 0), true);
    assert.equal(adaptiveActiveFor(both, 2000), true);
    assert.equal(adaptiveActiveFor(mobile, 0), false, 'unmeasured: defaultActive');
    assert.equal(adaptiveActiveFor(mobile, 639), true);
    assert.equal(adaptiveActiveFor(mobile, 640), false);
    assert.equal(adaptiveActiveFor(desktop, 639), false);
    assert.equal(adaptiveActiveFor(desktop, 640), true);
    assert.equal(adaptiveActiveFor(resolveAdaptive({ target: 'mobile', defaultActive: true }), 0), true);
  });

  it('card height is one row height per visible column plus padding and gap', () => {
    assert.equal(cardHeight(5, 36), 5 * 36 + 24);
    assert.equal(cardHeight(0, 36), 36 + 24);
  });
});

describe('adaptive SSR', () => {
  it('without the prop nothing changes', () => {
    const html = render({ rows: 5 });
    assert.doesNotMatch(html, /data-adaptive/);
    assert.doesNotMatch(html, /salmon-data-grid-card/);
  });

  it('target both renders the adaptive mode on the server', () => {
    const html = render({ rows: 5, adaptive: true });
    assert.match(html, /role="grid"[^>]*data-adaptive=""/);
    assert.doesNotMatch(html, /data-row-layout/);
    assert.equal(count(html, /salmon-data-grid-card"/), 0);
  });

  it('target mobile renders desktop markup until measured, unless defaultActive', () => {
    assert.doesNotMatch(render({ rows: 5, adaptive: { target: 'mobile', rowLayout: 'vertical' } }), /data-adaptive/);
    assert.match(render({ rows: 5, adaptive: { target: 'mobile', rowLayout: 'vertical', defaultActive: true } }), /data-row-layout="vertical"/);
  });

  it('vertical rows render one card per row of the same window, one field per visible column', () => {
    const html = render({ rows: 50, adaptive: { rowLayout: 'vertical' } });
    assert.match(html, /data-row-layout="vertical"/);
    assert.match(html, /--salmon-data-grid-card-height:204px/, '5 columns x 36 + 24');
    assert.equal(count(html, /class="salmon-data-grid-row salmon-data-grid-card"/), 20, 'initialRows window');
    assert.equal(count(html, /class="salmon-data-grid-card__field" role="none"/), 20 * 5);
    // Same accessibility tree as desktop: role=row, gridcells with aria-colindex of the logical column.
    assert.match(html, /role="row" aria-rowindex="2" class="salmon-data-grid-row salmon-data-grid-card" data-row-id="p0"/);
    assert.match(html, /<span class="salmon-data-grid-card__label" aria-hidden="true">Name<\/span><div role="gridcell" aria-colindex="2"/);
    assert.equal(count(html, /tabindex="0"/), 1, 'one tab stop');
  });

  it('the server markup does not depend on the row count', () => {
    const small = render({ rows: 1_000, adaptive: { rowLayout: 'vertical' } }).replace(/height:\d+px/g, '').replace(/aria-rowcount="\d+"/, '');
    const large = render({ rows: 100_000, adaptive: { rowLayout: 'vertical' } }).replace(/height:\d+px/g, '').replace(/aria-rowcount="\d+"/, '');
    assert.equal(small, large);
  });

  it('the adaptive bar shows sort and filter actions in vertical mode only when the features are on', async () => {
    const { createSortModule } = await import('@salmonui/data-grid/engine');
    const plain = render({ rows: 3, adaptive: { rowLayout: 'vertical' } });
    assert.doesNotMatch(plain, /salmon-data-grid-adaptive-bar/);
    const sorted = render({ rows: 3, adaptive: { rowLayout: 'vertical' }, modules: [createSortModule()] as never, sorting: true });
    assert.match(sorted, /role="toolbar" aria-label="Data Grid actions" class="salmon-data-grid-adaptive-bar"/);
    assert.match(sorted, /salmon-data-grid-adaptive-bar__sort/);
    assert.doesNotMatch(sorted, /salmon-data-grid-adaptive-bar__multi/, 'the multi-select toggle appears after a touch selection');
  });
});

describe('adaptive editing', () => {
  it('dialog editing over vertical cards renders the same cards and no dialog on the server', async () => {
    const base = render({ rows: 50, adaptive: { rowLayout: 'vertical' } });
    const editing = render({ rows: 50, adaptive: { rowLayout: 'vertical' }, editing: { mode: 'dialog' } });
    assert.equal(count(editing, /class="salmon-data-grid-row salmon-data-grid-card"/), 20, 'same virtualized card window');
    assert.doesNotMatch(editing, /<dialog|salmon-data-grid-edit-dialog|data-sheet/, 'the edit sheet renders only after a user action');
    assert.equal(count(editing, /salmon-data-grid-card__field/), count(base, /salmon-data-grid-card__field/));
    // Loading the lazy editing chunk does not change the server markup.
    const host = (await import(new URL('../dist/data-grid/editing/edit-host.js', import.meta.url).href)) as { loadEditChunk(): Promise<unknown> };
    await host.loadEditChunk();
    assert.equal(render({ rows: 50, adaptive: { rowLayout: 'vertical' }, editing: { mode: 'dialog' } }), editing);
  });

  it('the shipped stylesheet turns the edit dialog into a full-screen sheet only while adaptive', () => {
    const css = readFileSync(new URL('../dist/data-grid.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.salmon-data-grid-edit-dialog\[data-sheet\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const decl of ['inset: 0', 'width: 100%', 'height: 100%', 'max-width: none', 'max-height: none', 'margin: 0']) assert.ok(rule.includes(decl), decl);
    assert.match(css, /\.salmon-data-grid-edit-dialog\[data-sheet\] \.salmon-data-grid-edit-dialog__close\s*\{\s*width: 44px;\s*height: 44px;/);
    assert.match(css, /\.salmon-data-grid-edit-dialog\[data-sheet\] \.salmon-data-grid-dialog__actions\s*\{\s*position: sticky;/);
  });
});
