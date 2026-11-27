// Splitter server markup: the server
// render carries the final flex layout. Interaction tests:
// tests/browser/splitter.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Splitter, SplitterPane } from '@salmonui/layout/splitter';

const html = (el: ReactElement) => renderToString(el);

describe('Splitter markup', () => {
  it('orientation, px and % flex-basis, a filling pane, pane content', () => {
    const out = html(h(Splitter, { orientation: 'vertical', defaultSizes: { a: 200 } }, h(SplitterPane, { id: 'a' }, 'A'), h(SplitterPane, { id: 'b' }, 'B'), h(SplitterPane, { id: 'c', defaultSize: '25%' }, 'C')));
    assert.match(out, /^<div class="salmon-splitter" data-orientation="vertical">/);
    assert.match(out, /data-pane="a" style="flex-basis:200px;flex-grow:0;flex-shrink:0">A<\/div>/);
    assert.match(out, /data-pane="b" style="flex-basis:0;flex-grow:1;flex-shrink:1">B<\/div>/);
    assert.match(out, /data-pane="c" style="flex-basis:25%;flex-grow:0;flex-shrink:0">C<\/div>/);
    assert.equal((out.match(/role="separator"/g) ?? []).length, 2);
    assert.match(out, /role="separator" class="salmon-splitter-separator" aria-orientation="horizontal" aria-controls="[^"]+-a" aria-label="Resize" tabindex="0"/);
  });

  it('the panes array and children compile to the same markup', () => {
    const fromChildren = html(h(Splitter, { id: 's' }, h(SplitterPane, { id: 'x', defaultSize: 100 }, 'X'), h(SplitterPane, { id: 'y' }, 'Y')));
    const fromArray = html(h(Splitter, { id: 's', panes: [{ id: 'x', defaultSize: 100, content: 'X' }, { id: 'y', content: 'Y' }] }));
    assert.equal(fromArray, fromChildren);
    assert.equal(Splitter.Pane, SplitterPane);  });

  it('min / max sizes become min- / max-width on the pane', () => {
    assert.match(html(h(Splitter, null, h(SplitterPane, { id: 'a', minSize: 120, maxSize: '50%' }), h(SplitterPane, { id: 'b' }))), /min-width:120px;max-width:50%/);
  });

  it('a controlled collapsed pane uses collapsedSize and data-collapsed', () => {
    const out = html(h(Splitter, { sizes: { nav: 240 } }, h(SplitterPane, { id: 'nav', collapsible: true, collapsed: true, collapsedSize: 32 }), h(SplitterPane, { id: 'main' })));
    assert.match(out, /data-pane="nav" data-collapsed="" style="flex-basis:32px;flex-grow:0;flex-shrink:0"/);
    assert.match(html(h(Splitter, null, h(SplitterPane, { id: 'nav', collapsible: true, defaultCollapsed: true }), h(SplitterPane, { id: 'main' }))), /data-collapsed="" style="flex-basis:0px/);
  });

  it('resizable=false and disabled make separators inert; className / style pass through', () => {
    const out = html(h(Splitter, { className: 'x', style: { height: 300 } }, h(SplitterPane, { id: 'a', resizable: false, className: 'pa', style: { background: 'red' } }), h(SplitterPane, { id: 'b' })));
    assert.match(out, /^<div style="height:300px" class="salmon-splitter x"/);
    assert.match(out, /aria-disabled="true" data-disabled=""/);
    assert.doesNotMatch(out, /tabindex/);
    assert.match(out, /class="salmon-splitter-pane pa" data-pane="a" style="[^"]*background:red"/);
    const disabled = html(h(Splitter, { disabled: true }, h(SplitterPane, { id: 'a' }), h(SplitterPane, { id: 'b' })));
    assert.match(disabled, /data-disabled=""/);
    assert.doesNotMatch(disabled, /tabindex/);
  });

  it('the stylesheet is self-contained and in styles.css', () => {
    const css = readFileSync(new URL('../dist/splitter.css', import.meta.url), 'utf8');
    assert.match(css, /\.salmon-splitter-separator/);
    assert.doesNotMatch(css, /@import/);
    assert.doesNotMatch(css, /(?<![-\w])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/);
    // Each module sits in its cascade layer: the aggregate holds the source module.
    assert.ok(readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8').includes(readFileSync(new URL('../styles/splitter.css', import.meta.url), 'utf8')));
  });
});
