// TagGroup server markup and pure helpers; interaction is covered by
// tests/browser/tag-group.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Tag, TagGroup, moveTags, type TagGroupProps } from '@salmonui/buttons/tag-group';
import { insertionIndex } from '../dist/tag-group/drag.js';

const html = (element: ReactElement) => renderToString(element);
const group = (props: Partial<TagGroupProps>, values = ['a', 'b', 'c']) =>
  html(h(TagGroup, { 'aria-label': 'Labels', ...props } as TagGroupProps, ...values.map((v) => h(Tag, { key: v, value: v }, v.toUpperCase()))));
const rows = (markup: string) => markup.split('role="row"').slice(1);

describe('TagGroup markup', () => {
  it('an APG grid of one-cell rows built from Tag children, one tab stop, no selection state by default', () => {
    const out = group({});
    assert.match(out, /^<div role="grid"[^>]*aria-label="Labels"/);
    assert.match(out, /class="salmon-tag-group"/);
    assert.match(out, /data-selection-mode="none"/);
    assert.equal(rows(out).length, 3);
    for (const row of rows(out)) {
      assert.match(row, /role="gridcell"/);
      assert.doesNotMatch(row, /aria-selected/);
      assert.doesNotMatch(row, /salmon-tag-remove/);
    }
    // The tab stop is decided after mount (first enabled tag); on the server every row is -1 except a selected one.
    assert.ok(rows(out).every((row) => row.includes('tabindex="-1"')));
  });

  it('onRemove makes every tag removable with a named, untabbable remove button and aria-keyshortcuts', () => {
    const out = html(
      h(
        TagGroup,
        { 'aria-label': 'Labels', onRemove: () => {} },
        h(Tag, { value: 'a' }, 'Design'),
        h(Tag, { value: 'b', removable: false }, 'Locked'),
        h(Tag, { value: 'c', textValue: 'Bug report' }, h('b', null, 'Bug')),
        h(Tag, { value: 'd', disabled: true }, 'Old'),
      ),
    );
    const [a, b, c, d] = rows(out) as [string, string, string, string];
    assert.match(a, /aria-keyshortcuts="Delete Backspace"/);
    assert.match(a, /<button type="button" class="salmon-tag-remove" tabindex="-1" aria-label="Remove Design"/);
    assert.doesNotMatch(b, /salmon-tag-remove|aria-keyshortcuts/);
    assert.match(c, /aria-label="Remove Bug report"/);
    assert.match(d, /aria-disabled="true"/);
    assert.doesNotMatch(d, /aria-keyshortcuts/);
    assert.match(d, /<button[^>]*disabled=""/);
  });

  it('localeText.remove names the remove button', () => {
    const out = html(h(TagGroup, { 'aria-label': 'L', onRemove: () => {}, localeText: { remove: (label: string) => `Quitar ${label}` } }, h(Tag, { value: 'x' }, 'Rojo')));
    assert.match(out, /aria-label="Quitar Rojo"/);
  });

  it('selection: aria-selected rows, aria-multiselectable in multiple mode, the selected tag is the tab stop', () => {
    const single = group({ selectionMode: 'single', defaultValue: ['b'] });
    assert.doesNotMatch(single, /aria-multiselectable/);
    const [a, b] = rows(single) as [string, string];
    assert.match(a, /aria-selected="false"/);
    assert.match(b, /tabindex="0" aria-selected="true"/);
    assert.match(b, /data-selected=""/);
    const multiple = group({ selectionMode: 'multiple', value: ['a', 'c'] });
    assert.match(multiple, /aria-multiselectable="true"/);
    assert.equal((multiple.match(/aria-selected="true"/g) ?? []).length, 2);
  });

  it('name submits every tag value without selection, the selected values with it, nothing while disabled', () => {
    const inputs = (markup: string) => [...markup.matchAll(/<input type="hidden" name="labels" value="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(inputs(group({ name: 'labels' })), ['a', 'b', 'c']);
    assert.deepEqual(inputs(group({ name: 'labels', selectionMode: 'multiple', defaultValue: ['c'] })), ['c']);
    assert.deepEqual(inputs(group({ name: 'labels', disabled: true })), []);
  });

  it('tone, size, empty state, draggable hook and className / style / attribute passthrough', () => {
    const out = html(
      h(TagGroup, { 'aria-label': 'L', tone: 'primary', size: 'sm', reorderable: true, className: 'mine', style: { maxInlineSize: 200 }, 'data-x': '1' } as TagGroupProps, h(Tag, { value: 'a', tone: 'danger', className: 't', title: 'tip' }, 'A'), h(Tag, { value: 'b' }, 'B')),
    );
    assert.match(out, /class="salmon-tag-group mine"/);
    assert.match(out, /style="max-inline-size:200px"/);
    assert.match(out, /data-x="1"/);
    assert.match(out, /data-size="sm"/);
    const [a, b] = rows(out) as [string, string];
    assert.match(a, /title="tip" class="salmon-tag t"/);
    assert.match(a, /data-tone="danger"/);
    assert.match(b, /data-tone="primary"/);
    assert.match(b, /data-draggable=""/);
    const empty = html(h(TagGroup, { 'aria-label': 'L', empty: 'No labels' }));
    assert.match(empty, /<div role="row" class="salmon-tag-group-empty"><div role="gridcell">No labels<\/div><\/div>/);
    assert.doesNotMatch(group({ empty: 'No labels' }), /salmon-tag-group-empty/);
  });

  it('the stylesheet uses logical properties only and has focus-visible, forced-colors and reduced-motion rules', () => {
    const css = readFileSync(new URL('../styles/tag-group.css', import.meta.url), 'utf8');
    assert.doesNotMatch(css, /(?:^|[\s;{])(?:margin|padding|border)-(?:left|right|top|bottom)\s*:|(?:^|[\s;{])(?:left|right|top|bottom)\s*:/m);
    assert.match(css, /\.salmon-tag:focus-visible/);
    assert.match(css, /forced-colors: active/);
    assert.match(css, /prefers-reduced-motion/);
  });
});

describe('TagGroup helpers', () => {
  it('moveTags moves values to an insertion index in the current order without mutating', () => {
    const list = ['a', 'b', 'c', 'd'];
    assert.deepEqual(moveTags(list, ['a'], 3), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveTags(list, ['d'], 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveTags(list, ['b', 'd'], 4), ['a', 'c', 'b', 'd']);
    assert.deepEqual(moveTags(list, ['c'], 2), list);
    assert.deepEqual(list, ['a', 'b', 'c', 'd']);
    const objects = [{ id: 'x' }, { id: 'y' }];
    assert.deepEqual(moveTags(objects, ['y'], 0, (o) => o.id), [{ id: 'y' }, { id: 'x' }]);
  });

  it('the drop insertion index follows reading order across wrapped lines and mirrors in RTL', () => {
    const rect = (left: number, top: number) => ({ left, top, width: 40, height: 20, right: left + 40, bottom: top + 20, x: left, y: top }) as DOMRectReadOnly;
    // Two lines: [0, 1] at y 0..20, [2] at y 30..50.
    const rects = [rect(0, 0), rect(50, 0), rect(0, 30)];
    assert.equal(insertionIndex(rects, 5, 10, false), 0);
    assert.equal(insertionIndex(rects, 30, 10, false), 1);
    assert.equal(insertionIndex(rects, 95, 10, false), 2);
    assert.equal(insertionIndex(rects, 30, 40, false), 3);
    // RTL: tag 0 sits at the inline start, on the right.
    const rtl = [rect(50, 0), rect(0, 0)];
    assert.equal(insertionIndex(rtl, 80, 10, true), 0);
    assert.equal(insertionIndex(rtl, 60, 10, true), 1);
    assert.equal(insertionIndex(rtl, 10, 10, true), 2);
  });
});
