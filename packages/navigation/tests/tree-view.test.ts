// TreeView server rendering, markup contract and pure helpers. The
// interactive behaviour (keyboard, pointer, lazy loading, rename, drag) is
// covered by tests/browser/tree-view.spec.ts; the store by tree-store.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { TreeView, TREE_VIEW_DEFAULT_LOCALE_TEXT, moveTreeItems, type TreeViewProps } from '@salmonui/navigation/tree-view';

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
  lazy?: boolean;
  disabled?: boolean;
  url?: string;
}

const folders: Folder[] = [
  {
    id: 'docs',
    name: 'Documents',
    children: [
      { id: 'cv', name: 'CV.pdf' },
      { id: 'tax', name: 'Taxes', children: [{ id: 't1', name: '2025.pdf' }, { id: 't2', name: '2026.pdf' }] },
    ],
  },
  { id: 'pics', name: 'Pictures', lazy: true },
  { id: 'music', name: 'Music', disabled: true },
];

const base = { data: folders, getItemId: (f: Folder) => f.id, getItemLabel: (f: Folder) => f.name, getChildren: (f: Folder) => f.children, 'aria-label': 'Files' };

function render(props: Partial<TreeViewProps<Folder>> = {}): string {
  return renderToString(createElement(TreeView as (p: TreeViewProps<Folder>) => ReactNode, { ...base, ...props } as TreeViewProps<Folder>));
}

const count = (html: string, re: RegExp): number => html.match(new RegExp(re.source, 'g'))?.length ?? 0;
const items = (html: string): string[] => html.match(/<div[^>]*role="treeitem"[^>]*>/g) ?? [];

describe('TreeView server rendering', () => {
  it('renders a flat APG tree: level, setsize, posinset, expanded, one tab stop', () => {
    const html = render({ expanded: ['docs'] });
    assert.match(html, /<div[^>]*role="tree"[^>]*aria-label="Files"|aria-label="Files"[^>]*role="tree"/);
    const rows = items(html);
    assert.equal(rows.length, 5);
    assert.match(rows[0]!, /aria-level="1"[^>]*aria-setsize="3"[^>]*aria-posinset="1"[^>]*aria-expanded="true"/);
    assert.match(rows[1]!, /aria-level="2"[^>]*aria-setsize="2"[^>]*aria-posinset="1"/);
    assert.doesNotMatch(rows[1]!, /aria-expanded/, 'a leaf has no aria-expanded');
    assert.match(rows[2]!, /aria-level="2"[^>]*aria-setsize="2"[^>]*aria-posinset="2"[^>]*aria-expanded="false"/);
    assert.doesNotMatch(rows[3]!, /aria-expanded/, 'without hasChildren an item with no children is a leaf');
    assert.equal(count(html, /tabindex="0"/), 1);
    assert.match(rows[0]!, /tabindex="0"/);  });

  it('hasChildren shows a twisty (aria-expanded=false) before children are known', () => {
    const rows = items(render({ hasChildren: (f) => f.lazy === true }));
    assert.match(rows[1]!, /aria-expanded="false"/);
  });

  it('flat self-referential data with getParentId', () => {
    const flat = [
      { id: 1, parent: null, name: 'Root' },
      { id: 2, parent: 1, name: 'Child' },
    ];
    const html = renderToString(createElement(TreeView as (p: TreeViewProps<(typeof flat)[number]>) => ReactNode, { data: flat, getItemId: (x) => x.id, getParentId: (x) => x.parent, getItemLabel: (x) => x.name, expanded: [1], 'aria-label': 'Flat' }));
    assert.match(html, /aria-level="2"[^>]*>.*Child/);
  });

  it('server-renders only the first window by height with correct setsize/posinset', () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` }));
    const html = renderToString(createElement(TreeView as (p: TreeViewProps<(typeof big)[number]>) => ReactNode, { data: big, getItemId: (x) => x.id, getItemLabel: (x) => x.name, height: 320, 'aria-label': 'Big' }));
    const rows = items(html);
    assert.ok(rows.length >= 10 && rows.length <= 30, `rendered ${rows.length} rows`);
    assert.match(rows[0]!, /aria-setsize="5000"[^>]*aria-posinset="1"/);
    assert.match(html, /class="salmon-tree-view-sizer" style="block-size:160000px"/);
    assert.match(html, /style="block-size:320px"/);
    const all = renderToString(createElement(TreeView as (p: TreeViewProps<(typeof big)[number]>) => ReactNode, { data: big.slice(0, 300), getItemId: (x) => x.id, virtualize: false, 'aria-label': 'All' }));
    assert.equal(items(all).length, 300, 'virtualize={false} renders every visible item');
  });

  it('selection: aria-selected, aria-multiselectable, and selection="none"', () => {
    const single = render({ selected: ['docs'] });
    assert.doesNotMatch(single, /aria-multiselectable/);
    assert.equal(count(single, /aria-selected="true"/), 1);
    assert.match(single, /aria-selected="true"[^>]*data-selected=""/);
    const multi = render({ selection: 'multiple', selected: ['docs', 'pics'] });
    assert.match(multi, /aria-multiselectable="true"/);
    assert.equal(count(multi, /aria-selected="true"/), 2);
    assert.doesNotMatch(render({ selection: 'none' }), /aria-selected/);
  });

  it('the first selected item is the tab stop', () => {
    const rows = items(render({ selected: ['pics'] }));
    assert.match(rows[1]!, /tabindex="0"/);
    assert.match(rows[0]!, /tabindex="-1"/);
  });

  it('checkable: tri-state aria-checked with cascade, none, and initial checked', () => {
    const html = render({ checkable: true, expanded: ['docs', 'tax'], checked: ['t1'] });
    const rows = items(html);
    assert.equal(count(html, /class="salmon-tree-view-checkbox"/), 7);
    assert.match(rows[0]!, /aria-checked="mixed"[^>]*data-mixed=""/);
    assert.match(rows[2]!, /aria-checked="mixed"/);
    assert.match(rows[3]!, /aria-checked="true"[^>]*data-checked=""/);
    assert.match(rows[4]!, /aria-checked="false"/);
    const parent = items(render({ checkable: true, expanded: ['docs'], checked: ['docs'] }));
    assert.match(parent[1]!, /aria-checked="true"/, 'a checked parent cascades');
    const none = items(render({ checkable: true, checkPropagation: 'none', expanded: ['docs'], checked: ['docs'] }));
    assert.match(none[0]!, /aria-checked="true"/);
    assert.match(none[1]!, /aria-checked="false"/);
    assert.match(items(render({ checkable: true, defaultChecked: ['pics'] }))[1]!, /aria-checked="true"/);
    assert.doesNotMatch(render(), /aria-checked/);
  });

  it('name renders one hidden input per checked id (form integration)', () => {
    const html = render({ checkable: true, name: 'files', checked: ['tax'] });
    assert.equal(count(html, /<input type="hidden" name="files"/), 3);
    assert.match(html, /value="tax"/);
    assert.match(html, /value="t1"/);
    assert.doesNotMatch(render({ checkable: true, checked: ['tax'] }), /type="hidden"/);
  });

  it('disabled items are focusable with aria-disabled; the disabled tree too', () => {
    const rows = items(render({ isItemDisabled: (f) => f.disabled === true }));
    assert.match(rows[2]!, /aria-disabled="true"[^>]*tabindex="-1"[^>]*data-disabled=""/);
    const all = render({ disabled: true });
    assert.match(all, /role="tree"[^>]*aria-disabled="true"/);
  });

  it('icons, links, tooltip / attributes and renderItem', () => {
    const calls: string[] = [];
    const html = render({
      getItemIcon: (f) => createElement('svg', { 'data-icon': f.id }),
      getItemHref: (f) => (f.id === 'pics' ? '/pictures' : undefined),
      getItemProps: (f, ctx) => {
        calls.push(f.id);
        return { title: `${f.name} (level ${ctx.level})`, 'data-kind': f.children ? 'folder' : 'file', className: 'custom-row' };
      },
    });
    assert.match(html, /<span class="salmon-tree-view-icon" aria-hidden="true"><svg data-icon="docs"><\/svg><\/span>/);
    assert.match(html, /<a href="\/pictures" class="salmon-tree-view-link" tabindex="-1">Pictures<\/a>/);
    assert.match(html, /title="Documents \(level 1\)"[^>]*data-kind="folder"/);
    assert.match(html, /class="salmon-tree-view-item custom-row"/);
    assert.deepEqual(calls, ['docs', 'pics', 'music'], 'getItemProps runs only for rendered rows');
    const custom = render({ renderItem: (ctx) => createElement('b', null, `${ctx.label}:${ctx.level}:${String(ctx.expanded)}:${String(ctx.checked)}`), expanded: ['docs'] });
    assert.match(custom, /<b>Documents:1:true:false<\/b>/);
    assert.match(custom, /<b>CV.pdf:2:false:false<\/b>/);
    const routed = render({ getItemHref: () => '/x', renderLink: (p) => createElement('a', { ...p, 'data-router': '' }) });
    assert.match(routed, /<a href="\/x" class="salmon-tree-view-link" tabindex="-1" data-router="">/);
  });

  it('className, style, native attributes, rowHighlight and textWrap reach the root', () => {
    const html = render({ className: 'mine', style: { color: 'red' }, id: 'files', ...{ 'data-test': 'x' }, rowHighlight: 'label', textWrap: true, height: '20rem' });
    assert.match(html, /id="files"/);
    assert.match(html, /class="salmon-tree-view mine"/);
    assert.match(html, /style="block-size:20rem;color:red"/);
    assert.match(html, /data-test="x"/);
    assert.match(html, /data-highlight="label"/);
    assert.match(html, /data-wrap=""/);
    assert.match(render(), /data-highlight="full"/);
  });

  it('sort orders siblings by label', () => {
    const html = render({ sort: 'desc' });
    const labels = [...html.matchAll(/class="salmon-tree-view-label">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(labels, ['Pictures', 'Music', 'Documents']);
  });

  it('item levels carry the indentation variable; RTL needs only logical CSS', () => {
    const html = render({ expanded: ['docs'], dir: undefined } as Partial<TreeViewProps<Folder>>);
    assert.match(html, /style="--salmon-tree-view-level:1;inset-block-start:32px"/);
  });

  it('exports frozen default locale text', () => {
    assert.equal(TREE_VIEW_DEFAULT_LOCALE_TEXT.loading, 'Loading…');
    assert.ok(Object.isFrozen(TREE_VIEW_DEFAULT_LOCALE_TEXT));
    const html = render({ localeText: { retry: 'Nochmal' } });
    assert.ok(html.length > 0);
  });
});

describe('moveTreeItems', () => {
  const opts = { getItemId: (f: Folder) => f.id, getChildren: (f: Folder) => f.children, withChildren: (f: Folder, children: readonly Folder[]) => ({ ...f, children: [...children] }) };
  const ids = (list: readonly Folder[]): unknown => list.map((f) => (f.children ? { [f.id]: ids(f.children) } : f.id));

  it('moves before, after and into, keeping unchanged subtrees', () => {
    assert.deepEqual(ids(moveTreeItems(folders, { ids: ['music'], targetId: 'docs', position: 'before' }, opts)), ['music', { docs: ['cv', { tax: ['t1', 't2'] }] }, 'pics']);
    const into = moveTreeItems(folders, { ids: ['cv'], targetId: 'tax', position: 'into' }, opts);
    assert.deepEqual(ids(into), [{ docs: [{ tax: ['t1', 't2', 'cv'] }] }, 'pics', 'music']);
    const after = moveTreeItems(folders, { ids: ['t2', 'pics'], targetId: 'cv', position: 'after' }, opts);
    assert.deepEqual(ids(after), [{ docs: ['cv', 't2', 'pics', { tax: ['t1'] }] }, 'music']);
    assert.equal(after[1], folders[2], 'unchanged items keep their identity');
  });

  it('inserts items from another tree (dragGroup)', () => {
    const out = moveTreeItems(folders, { ids: ['x'], items: [{ id: 'x', name: 'X' }], targetId: 'pics', position: 'into' }, opts);
    assert.deepEqual(ids(out), [{ docs: ['cv', { tax: ['t1', 't2'] }] }, { pics: ['x'] }, 'music']);
  });
});
