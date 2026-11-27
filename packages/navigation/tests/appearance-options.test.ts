import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Pager } from '@salmonui/navigation/pager';
import { SidebarMenu, type SidebarMenuEntry } from '@salmonui/navigation/sidebar-menu';

// Opt-in appearance options: Pager `size` / `variant` and SidebarMenu
// `dividers`. Unset, the markup carries no new attribute (the default look).

const ITEMS: SidebarMenuEntry[] = [
  { type: 'group', id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1', href: '/a1' }] },
  { type: 'group', id: 'b', label: 'B', children: [{ id: 'b1', label: 'B1', href: '/b1' }] },
];
const nav = (html: string): string => /<nav[^>]*>/.exec(html)![0];

describe('Pager size and variant', () => {
  it('writes no hook by default', () => {
    const root = nav(renderToString(h(Pager, { totalCount: 96 })));
    assert.ok(!root.includes('data-size') && !root.includes('data-variant') && !root.includes('style='));
  });
  it('size="sm" sets the 24px control metrics inline; variant="outline" marks the root', () => {
    const root = nav(renderToString(h(Pager, { totalCount: 96, size: 'sm', variant: 'outline', style: { color: 'red' } })));
    assert.match(root, /data-size="sm"/);
    assert.match(root, /data-variant="outline"/);
    assert.match(root, /--salmon-control-height-md:24px/);
    assert.match(root, /--salmon-control-padding-md:6px/);
    assert.match(root, /color:red/);
  });
});

describe('SidebarMenu dividers', () => {
  it('is off by default and writes data-dividers when on', () => {
    assert.ok(!renderToString(h(SidebarMenu, { items: ITEMS })).includes('data-dividers'));
    assert.match(renderToString(h(SidebarMenu, { items: ITEMS, dividers: true })), /data-dividers=""/);
  });
});
