// TreeSelect server rendering, value display and the pure tree search.
// Interaction (popup,
// keyboard, checks, lazy loading, select all) is covered by
// tests/browser/tree-select.spec.ts; the tree model by tree-store.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { TreeSelect, TREE_SELECT_DEFAULT_LOCALE_TEXT, type TreeSelectProps } from '@salmonui/dropdowns/tree-select';
import { buildTreeModel, createTreeStore } from '../../core/dist/internal/tree-store.js';
import { filterTree } from '../dist/tree-select/filter.js';

interface Node {
  value: string;
  label: string;
  children?: Node[];
  disabled?: boolean;
}

const data: Node[] = [
  {
    value: 'fruit',
    label: 'Fruit',
    children: [
      { value: 'apple', label: 'Apple' },
      { value: 'citrus', label: 'Citrus', children: [{ value: 'lemon', label: 'Lemon' }, { value: 'lime', label: 'Lime' }] },
    ],
  },
  { value: 'veg', label: 'Vegetables', children: [{ value: 'leek', label: 'Leek' }] },
  { value: 'nuts', label: 'Nuts', disabled: true },
];

function render(props: Partial<TreeSelectProps<Node>> & Record<string, unknown> = {}): string {
  return renderToString(createElement(TreeSelect as (p: TreeSelectProps<Node>) => ReactNode, { data, 'aria-label': 'Food', ...props } as TreeSelectProps<Node>));
}

describe('TreeSelect server rendering', () => {
  it('renders a select-only combobox with aria-haspopup="tree" and no popup', () => {
    const html = render({ defaultValue: 'lemon' });
    assert.match(html, /<button[^>]*role="combobox"/);
    assert.match(html, /aria-haspopup="tree"/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /role="tree"/, 'the popup never renders on the server');
    assert.match(html, /class="salmon-tree-select-value">Lemon</, 'a nested value shows its label');  });

  it('forwards DOM props and the id to the trigger and submits through a hidden select', () => {
    const html = render({ id: 'food', name: 'food', defaultValue: 'apple', title: 'Pick food', 'data-test': 'x', className: 'mine' });
    assert.match(html, /<div class="salmon-tree-select mine"/);
    assert.match(html, /<button[^>]*title="Pick food"[^>]*data-test="x"[^>]*id="food"/);
    assert.match(html, /<select[^>]*name="food"[^>]*><option value="apple" selected=""><\/option><\/select>/);
  });

  it('shows the placeholder without a value and hides the chevron with showTrigger={false}', () => {
    const html = render({ placeholder: 'Choose' });
    assert.match(html, /salmon-tree-select-placeholder[^>]*>Choose</);
    assert.match(html, /salmon-tree-select-chevron/);
    assert.doesNotMatch(render({ showTrigger: false }), /salmon-tree-select-chevron/);
  });

  it('reads flat self-referential data through getParentId', () => {
    const flat = [
      { id: 1, name: 'Root', parent: null },
      { id: 2, name: 'Child', parent: 1 },
      { id: 3, name: 'Grandchild', parent: 2 },
    ];
    const html = renderToString(
      createElement(TreeSelect as (p: TreeSelectProps<(typeof flat)[number]>) => ReactNode, {
        data: flat,
        getItemValue: (f) => f.id,
        getItemLabel: (f) => f.name,
        getParentId: (f) => f.parent,
        defaultValue: 3,
        'aria-label': 'Flat',
      } as TreeSelectProps<(typeof flat)[number]>),
    );
    assert.match(html, />Grandchild</);
  });
});

describe('TreeSelect value display', () => {
  it('joins the labels of multiple values, or counts them', () => {
    assert.match(render({ multiple: true, defaultValue: ['apple', 'leek'] }), />Apple, Leek</);
    assert.match(render({ multiple: true, defaultValue: ['apple', 'leek'], valueSeparator: '; ' }), />Apple; Leek</);
    assert.match(render({ multiple: true, defaultValue: ['apple', 'leek'], valueDisplay: 'count' }), />2 items selected</);
    assert.match(render({ multiple: true, defaultValue: ['apple', 'leek', 'lime'], maxVisibleValues: 1 }), />Apple \+2</);
  });

  it('renders chips that wrap (valueDisplay="chips")', () => {
    const html = render({ multiple: true, defaultValue: ['apple', 'lime'], valueDisplay: 'chips' });
    assert.match(html, /data-value-display="chips"/);
    assert.equal(html.match(/class="salmon-tree-select-chip"/g)?.length, 2);
  });

  it('renderValue replaces the display (Custom mode, valueTemplate)', () => {
    const html = render({ multiple: true, defaultValue: ['apple', 'lime'], renderValue: ({ labels }) => `${labels.length} item(s) selected` });
    assert.match(html, />2 item\(s\) selected</);
  });

  it('checkbox values cascade from a checked parent', () => {
    const html = render({ multiple: true, indicator: 'checkbox', defaultValue: ['citrus'], name: 'f' });
    // The trigger shows the given value; the store's cascade decides the next emitted value.
    assert.match(html, />Citrus</);
    const store = createTreeStore<Node>({ data, getItemId: (n) => n.value, getItemLabel: (n) => n.label, getChildren: (n) => n.children });
    store.setCheckedIds(['citrus']);
    assert.deepEqual(store.checkedIds(), ['citrus', 'lemon', 'lime']);
    assert.equal(store.checkState(store.nodeOf('fruit')), 2, 'the parent is mixed');
    store.setChecked(store.nodeOf('apple'), true);
    assert.deepEqual(store.checkedIds(), ['fruit', 'apple', 'citrus', 'lemon', 'lime']);
  });

  it('labels a value that is not loaded from selectedItems, else the value itself', () => {
    assert.match(render({ defaultValue: 'late', selectedItems: [{ value: 'late', label: 'Loaded later' }] }), />Loaded later</);
    assert.match(render({ defaultValue: 'late' }), />late</);
  });

  it('exports default texts', () => {
    assert.equal(TREE_SELECT_DEFAULT_LOCALE_TEXT.selectAll, 'Select all');
    assert.equal(TREE_SELECT_DEFAULT_LOCALE_TEXT.loadingChildren, 'Loading…');
    assert.match(render({ defaultValue: 'apple', clearable: true, localeText: { clear: 'Empty' } }), /aria-label="Empty"/);
  });
});

describe('TreeSelect data', () => {
  it('nested data builds the model through the default children accessor', () => {
    const html = render({ defaultValue: 'lime' });
    assert.match(html, />Lime</);
    const model = buildTreeModel<Node>({ data, getItemId: (n) => n.value, getChildren: (n) => n.children });
    assert.equal(model.count, 8);
    assert.deepEqual([...model.depth], [0, 1, 1, 2, 2, 0, 1, 0]);
  });

  it('a disabled node disables its subtree (isItemDisabled)', () => {
    const model = buildTreeModel<Node>({ data: [{ value: 'p', label: 'P', disabled: true, children: [{ value: 'c', label: 'C' }] }], getItemId: (n) => n.value, getChildren: (n) => n.children, isItemDisabled: (n) => n.disabled === true });
    assert.deepEqual([...model.flags].map((f) => (f & 2) !== 0), [true, true]);
  });
});

describe('TreeSelect search', () => {
  const model = buildTreeModel<Node>({ data, getItemId: (n) => n.value, getChildren: (n) => n.children });
  const label = (i: number): string => (model.items[i] as Node).label;
  const shown = (r: { order: Int32Array }): string[] => [...r.order].map((i) => (model.items[i] as Node).value);

  it('keeps the ancestors of every match, in tree order', () => {
    const r = filterTree(model, label, 'li');
    assert.deepEqual(shown(r), ['fruit', 'citrus', 'lime']);
    assert.equal(r.matches, 1);
    assert.equal(r.matched[model.index.get('citrus') as number], 0, 'an ancestor is shown but not matched');
  });

  it('sets aria-setsize / aria-posinset among the shown siblings', () => {
    const r = filterTree(model, label, 'le', { operator: 'startsWith' });
    assert.deepEqual(shown(r), ['fruit', 'citrus', 'lemon', 'veg', 'leek']);
    const at = (v: string): number => model.index.get(v) as number;
    assert.equal(r.setsize[at('fruit')], 2, 'two roots are shown');
    assert.equal(r.posinset[at('veg')], 2);
    assert.equal(r.setsize[at('lemon')], 1, 'Lime is hidden');
  });

  it('honours the operator, matchCase, ignoreAccents and a predicate', () => {
    assert.deepEqual(shown(filterTree(model, label, 'ME', { operator: 'endsWith' })), ['fruit', 'citrus', 'lime']);
    assert.deepEqual(shown(filterTree(model, label, 'ME', { operator: 'endsWith', matchCase: true })), []);
    assert.deepEqual(shown(filterTree(model, (i) => (i === model.index.get('apple') ? 'Äpfel' : label(i)), 'apf', { ignoreAccents: true })), ['fruit', 'apple']);
    assert.deepEqual(shown(filterTree(model, label, 'x', { operator: (n) => n.value === 'leek' })), ['veg', 'leek']);
  });
});
