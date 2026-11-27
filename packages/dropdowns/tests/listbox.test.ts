// Listbox server rendering, markup contract and pure helpers. The
// interactive behaviour (keyboard, pointer, drag, search) is covered by
// tests/browser/listbox.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { Listbox, LISTBOX_DEFAULT_LOCALE_TEXT, moveItems, reorderItems, type ListboxProps } from '@salmonui/dropdowns/listbox';
import { formatListboxText } from '../dist/listbox/locale.js';

function render<T>(props: ListboxProps<T>): string {
  return renderToString(createElement(Listbox as (p: ListboxProps<T>) => ReactNode, props));
}

function count(html: string, pattern: RegExp): number {
  return html.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
}

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
];

describe('Listbox server rendering', () => {
  it('renders an APG listbox with options', () => {
    const html = render({ data: fruits, 'aria-label': 'Fruit' });
    assert.match(html, /<div[^>]*role="listbox"[^>]*>/);
    assert.match(html, /role="listbox"[^>]*aria-label="Fruit"|aria-label="Fruit"[^>]*role="listbox"/);
    assert.match(html, /tabindex="0"/);
    assert.equal(count(html, /role="option"/), 4);
    assert.match(html, /aria-setsize="4"/);
    assert.match(html, /aria-posinset="4"/);
    assert.doesNotMatch(html, /aria-multiselectable/);  });

  it('layout="grid" renders an APG grid of rows and gridcells on the server', () => {
    const html = render({ data: fruits, layout: 'grid', columns: 3, multiple: true, defaultValue: ['banana'], 'aria-label': 'Fruit' });
    assert.match(html, /role="grid"/);
    assert.doesNotMatch(html, /role="listbox"|role="option"/);
    assert.match(html, /aria-rowcount="2"/);
    assert.equal(count(html, /role="row"/), 2);
    assert.equal(count(html, /role="gridcell"/), 4);
    assert.match(html, /aria-rowindex="2"/);
    assert.doesNotMatch(html, /aria-setsize|aria-posinset/);
    assert.match(html, /aria-multiselectable="true"/);
    assert.match(html, /--salmon-listbox-columns:3/);
    assert.equal(count(html, /aria-selected="true"/), 1);
    assert.match(html, /data-layout="grid"/);
  });

  it('marks the selected and disabled options', () => {
    const html = render({ data: fruits, defaultValue: 'banana', 'aria-label': 'Fruit' });
    assert.match(html, /aria-selected="true"[^>]*data-selected=""[^>]*>.*Banana/);
    assert.equal(count(html, /aria-selected="true"/), 1);
    assert.match(html, /aria-disabled="true"[^>]*data-disabled=""/);
  });

  it('multiple selection sets aria-multiselectable', () => {
    const html = render({ data: fruits, multiple: true, value: ['apple', 'date'], 'aria-label': 'Fruit' });
    assert.match(html, /aria-multiselectable="true"/);
    assert.equal(count(html, /aria-selected="true"/), 2);
  });

  it('primitive data is value and label and accessors map fields', () => {
    assert.match(render({ data: ['red', 'green'], 'aria-label': 'Color' }), />green</);
    const html = render({
      data: [{ id: 7, info: { name: 'Seven' } }],
      getItemValue: (x) => x.id,
      getItemLabel: (x) => x.info.name,
      name: 'n',
      defaultValue: 7,
      'aria-label': 'Numbers',
    });
    assert.match(html, />Seven</);
    assert.match(html, /<option value="7" selected="">/);
  });

  it('checkbox indicator', () => {
    const html = render({ data: fruits, multiple: true, indicator: 'checkbox', defaultValue: ['apple'], 'aria-label': 'Fruit' });
    assert.equal(count(html, /class="salmon-listbox-checkbox"/), 4);
    assert.equal(count(html, /class="salmon-listbox-checkbox" aria-hidden="true" data-checked=""/), 1);
  });

  it('select all checkbox', () => {
    const html = render({ data: fruits, multiple: true, showSelectAll: true, defaultValue: ['apple', 'banana', 'date'], 'aria-label': 'Fruit' });
    assert.match(html, /class="salmon-listbox-select-all"/);
    assert.match(html, /type="checkbox"[^>]*checked=""/, 'every enabled item selected: checked');
    assert.match(html, />Select all</);
  });

  it('groups render role="group" containers with headers', () => {
    const html = render({
      data: [
        { value: 1, label: 'Oslo', group: 'Norway' },
        { value: 2, label: 'Bergen', group: 'Norway' },
        { value: 3, label: 'Lyon', group: 'France' },
      ],
      renderGroupHeader: ({ group }) => createElement('strong', null, group.toUpperCase()),
      'aria-label': 'Cities',
    });
    assert.equal(count(html, /role="group"/), 2);
    assert.match(html, /role="group" aria-label="Norway"/);
    assert.match(html, /<strong>FRANCE<\/strong>/);
    assert.match(html, /aria-setsize="3"/);
    assert.match(html, /aria-posinset="3"[^>]*>.*Lyon/);
  });

  it('icons, renderItem and getItemProps', () => {
    const html = render({
      data: fruits,
      getItemIcon: (x) => createElement('i', { className: 'icon' }, x.value[0]),
      renderItem: ({ label, selected }) => createElement('b', null, `${label}${selected ? '!' : ''}`),
      getItemProps: (x) => ({ className: `fruit-${x.value}`, title: x.label, 'data-kind': 'fruit' }),
      defaultValue: 'apple',
      'aria-label': 'Fruit',
    });
    assert.match(html, /<i class="icon">a<\/i>/);
    assert.match(html, /<b>Apple!<\/b>/);
    assert.match(html, /title="Apple"/);
    assert.match(html, /data-kind="fruit"/);
    assert.match(html, /class="salmon-listbox-option fruit-banana"/);
  });

  it('className, style and part maps reach their elements', () => {
    const html = render({
      data: fruits,
      className: 'mine',
      style: { inlineSize: 200 },
      classNames: { list: 'the-list', option: 'opt' },
      styles: { list: { background: 'red' } },
      'aria-label': 'Fruit',
    });
    assert.match(html, /class="salmon-listbox mine"[^>]*style="inline-size:200px"/);
    assert.match(html, /class="salmon-listbox-list the-list"[^>]*style="[^"]*background:red/);
    assert.equal(count(html, /class="salmon-listbox-option opt"/), 4);
  });

  it('virtualizes above 100 items: options in DOM ≤ visible + 2 × overscan', () => {
    const data = Array.from({ length: 100_000 }, (_, i) => `Item ${i}`);
    const html = render({ data, 'aria-label': 'Items' });
    const options = count(html, /role="option"/);
    assert.ok(options <= 8 + 2 * 6, `${options} options rendered`);
    assert.match(html, /aria-setsize="100000"/);
    assert.match(html, /class="salmon-listbox-sizer"[^>]*style="block-size:3200000px"/);
    assert.match(html, /data-virtual=""/);
    // Opt out.
    const flat = render({ data: data.slice(0, 300), virtualization: false, 'aria-label': 'Items' });
    assert.equal(count(flat, /role="option"/), 300);
    // 100 items or fewer render every option.
    assert.equal(count(render({ data: data.slice(0, 100), 'aria-label': 'Items' }), /role="option"/), 100);
  });

  it('maxVisibleItems sets the list height', () => {
    assert.match(render({ data: fruits, maxVisibleItems: 3, 'aria-label': 'Fruit' }), /max-block-size:96px/);
    assert.doesNotMatch(render({ data: fruits, style: { height: 300 }, 'aria-label': 'Fruit' }), /max-block-size/);
  });

  it('hidden native select submits the value with name', () => {
    const single = render({ data: fruits, name: 'fruit', defaultValue: 'banana', required: true, 'aria-label': 'Fruit' });
    assert.match(single, /<select[^>]*name="fruit"[^>]*required=""/);
    assert.match(single, /<option value="banana" selected="">/);
    const multi = render({ data: fruits, multiple: true, name: 'fruits', value: ['apple', 'date'], 'aria-label': 'Fruit' });
    assert.match(multi, /<select[^>]*multiple=""/);
    assert.equal(count(multi, /<option[^>]*selected=""/), 2);
    assert.doesNotMatch(render({ data: fruits, 'aria-label': 'Fruit' }), /<select/);
  });

  it('disabled and readOnly', () => {
    const d = render({ data: fruits, disabled: true, name: 'f', 'aria-label': 'Fruit' });
    assert.match(d, /tabindex="-1"/);
    assert.match(d, /aria-disabled="true"[^>]*class="salmon-listbox-list/);
    assert.match(d, /<select[^>]*disabled=""/);
    assert.match(render({ data: fruits, readOnly: true, 'aria-label': 'Fruit' }), /aria-readonly="true"/);
  });

  it('searchable renders a search field that controls the list', () => {
    const html = render({ data: fruits, searchable: true, searchPlaceholder: 'Find fruit', id: 'fruit-list', 'aria-label': 'Fruit' });
    assert.match(html, /<input[^>]*type="search"[^>]*placeholder="Find fruit"[^>]*aria-label="Search"[^>]*aria-controls="fruit-list"/);
    assert.match(html, /id="fruit-list"/);
  });

  it('empty states and locale text', () => {
    assert.match(render({ data: [], 'aria-label': 'None' }), /class="salmon-listbox-empty">No items</);
    assert.match(render({ data: [], localeText: { noData: 'Keine Einträge' }, 'aria-label': 'None' }), />Keine Einträge</);
    assert.match(render({ data: [], renderEmpty: ({ reason }) => `empty:${reason}`, 'aria-label': 'None' }), />empty:noData</);
  });

  it('a remote source renders the busy state on the server, never a read', () => {
    let reads = 0;
    const html = render({ data: { read: () => (reads++, { version: 0, rows: [] }) }, 'aria-label': 'Remote' });
    assert.equal(reads, 0);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Loading…/);
  });

  it('ids are stable between renders (useId) and the ref target is the listbox', () => {
    const a = render({ data: fruits, 'aria-label': 'Fruit' });
    const b = render({ data: fruits, 'aria-label': 'Fruit' });
    assert.equal(a, b);
  });
});

describe('moveItems / reorderItems', () => {
  const left = ['a', 'b', 'c', 'd'];
  const right = ['x', 'y'];

  it('moves values between lists, in source order, at an index', () => {
    const [l, r] = moveItems(left, right, ['c', 'a']);
    assert.deepEqual(l, ['b', 'd']);
    assert.deepEqual(r, ['x', 'y', 'a', 'c']);
    const [, r2] = moveItems(left, right, ['b'], 1);
    assert.deepEqual(r2, ['x', 'b', 'y']);
    assert.deepEqual(left, ['a', 'b', 'c', 'd'], 'inputs are not mutated');
  });

  it('moves within one list to a drop position', () => {
    const [next, same] = moveItems(left, left, ['a'], 3);
    assert.equal(next, same);
    assert.deepEqual(next, ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveItems(left, left, ['d'], 0)[0], ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveItems(left, left, ['a', 'c'], 4)[0], ['b', 'd', 'a', 'c']);
  });

  it('uses getItemValue for objects', () => {
    const src = [{ id: 1 }, { id: 2 }];
    const [l, r] = moveItems(src, [], [2], undefined, (x) => x.id);
    assert.deepEqual(l, [{ id: 1 }]);
    assert.deepEqual(r, [{ id: 2 }]);
  });

  it('reorders by delta keeping blocks together and stopping at the ends', () => {
    assert.deepEqual(reorderItems(left, ['c'], -1), ['a', 'c', 'b', 'd']);
    assert.deepEqual(reorderItems(left, ['b', 'c'], 1), ['a', 'd', 'b', 'c']);
    assert.deepEqual(reorderItems(left, ['a'], -1), ['a', 'b', 'c', 'd']);
    assert.deepEqual(reorderItems(left, ['a', 'c'], -1), ['a', 'c', 'b', 'd'], 'a stays at the top, c moves');
    assert.deepEqual(reorderItems(left, ['d'], -10), ['d', 'a', 'b', 'c']);
    assert.notEqual(reorderItems(left, [], 1), left);
  });
});

describe('Listbox locale text', () => {
  it('formats templates and plural forms', () => {
    assert.equal(formatListboxText(LISTBOX_DEFAULT_LOCALE_TEXT.resultCount, { count: 0 }), 'No results');
    assert.equal(formatListboxText(LISTBOX_DEFAULT_LOCALE_TEXT.resultCount, { count: 1 }), '1 result');
    assert.equal(formatListboxText(LISTBOX_DEFAULT_LOCALE_TEXT.resultCount, { count: 12 }), '12 results');
    assert.equal(formatListboxText(LISTBOX_DEFAULT_LOCALE_TEXT.moved, { label: 'Apple', position: 2, count: 4 }), 'Apple moved to position 2 of 4');
    assert.ok(Object.isFrozen(LISTBOX_DEFAULT_LOCALE_TEXT));
  });
});
