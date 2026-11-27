import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { BreadcrumbItem, Breadcrumbs } from '@salmonui/navigation/breadcrumbs';
import { Carousel, CarouselSlide } from '@salmonui/navigation/carousel';
import { Pager } from '@salmonui/navigation/pager';
import { SidebarMenu } from '@salmonui/navigation/sidebar-menu';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';
import { Step, Stepper } from '@salmonui/navigation/stepper';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { Toolbar } from '@salmonui/navigation/toolbar';
import { TreeView, type TreeViewProps } from '@salmonui/navigation/tree-view';

// Every navigation family reads the nearest LocaleProvider: the zh-TW pack reaches the markup, and a component's own
// `localeText` still wins over the provider.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('navigation families under LocaleProvider', () => {
  it('pager: provider text and locale, own localeText wins', () => {
    const html = zh(h(Pager, { totalCount: 22095 }));
    assert.match(html, /aria-label="分頁"/);
    assert.match(html, /（共 22,095 筆）/);
    assert.match(zh(h(Pager, { totalCount: 10, localeText: { label: 'Pages' } })), /aria-label="Pages"/);
  });

  it('sidebar menu', () => {
    const items = [{ id: 'a', label: 'A', href: '/a' }];
    assert.match(zh(h(SidebarMenu, { items })), /aria-label="主選單"/);
    assert.match(zh(h(SidebarMenu, { items, localeText: { label: 'Admin' } })), /aria-label="Admin"/);
  });

  it('breadcrumbs', () => {
    const trail = (props: Record<string, unknown>) => h(Breadcrumbs, { maxItems: 2, ...props }, h(BreadcrumbItem, { href: '/' }, 'A'), h(BreadcrumbItem, { href: '/b' }, 'B'), h(BreadcrumbItem, null, 'C'));
    const html = zh(trail({}));
    assert.match(html, /aria-label="導覽路徑"/);
    assert.match(html, /aria-label="顯示隱藏的導覽路徑"/);
    assert.match(zh(trail({ localeText: { label: 'Trail' } })), /aria-label="Trail"/);
  });

  it('carousel', () => {
    const slides = [h(CarouselSlide, { key: 1 }, 'One'), h(CarouselSlide, { key: 2 }, 'Two')];
    const html = zh(h(Carousel, { 'aria-label': 'C' }, ...slides));
    assert.match(html, /aria-roledescription="輪播"/);
    assert.match(html, /aria-label="第 1 張，共 2 張"/);
    assert.match(html, /上一張/);
    assert.match(zh(h(Carousel, { 'aria-label': 'C', localeText: { previous: 'Back' } }, ...slides)), /Back/);
  });

  it('sidebarLayout', () => {
    const layout = (props: Record<string, unknown>) => h(SidebarLayout, props, h(SidebarPanel), h(SidebarMain, null, h(SidebarTrigger, { action: 'collapse' })));
    const html = zh(layout({}));
    assert.match(html, /aria-label="側邊欄"/);
    assert.match(html, /aria-label="收合側邊欄"/);
    assert.match(zh(layout({ localeText: { panel: 'Nav' } })), /aria-label="Nav"/);
  });

  it('stepper', () => {
    const steps = (props: Record<string, unknown>) => h(Stepper, { value: 1, ...props }, h(Step, { label: 'A' }), h(Step, { label: 'B', optional: true }));
    const html = zh(steps({}));
    assert.match(html, /選填/);
    assert.match(html, /已完成/);
    assert.match(zh(steps({ localeText: { optional: 'Opt' } })), /Opt/);
  });

  it('tabs', () => {
    const tabs = (props: Record<string, unknown>) => h(Tabs, { defaultValue: 'a', ...props }, h(TabList, null, h(Tab, { value: 'a', onClose: () => {} }, 'A')), h(TabPanel, { value: 'a' }, 'Panel'));
    assert.match(zh(tabs({})), /title="關閉"/);
    assert.match(zh(tabs({ localeText: { close: 'X' } })), /title="X"/);
  });

  it('toolbar', () => {
    assert.match(zh(h(Toolbar, { 'aria-label': 'T' }, h('button', null, 'A'))), /aria-label="更多"/);
    assert.match(zh(h(Toolbar, { 'aria-label': 'T', localeText: { more: 'More!' } }, h('button', null, 'A'))), /aria-label="More!"/);
  });

  it('treeView: the provider locale reaches the store; its own locale wins', () => {
    type Item = { readonly id: string; readonly name: string };
    const data: Item[] = [
      { id: 'b', name: 'b' },
      { id: 'a', name: 'ä' },
    ];
    const props: TreeViewProps<Item> = { data, getItemId: (i) => i.id, getItemLabel: (i) => i.name, sort: 'asc', 'aria-label': 'Tree' } as TreeViewProps<Item>;
    const tree = (extra: Partial<TreeViewProps<Item>>) => h(TreeView as (p: TreeViewProps<Item>) => ReactNode, { ...props, ...extra } as TreeViewProps<Item>);
    // Swedish collation puts ä after b; the provider's locale reaches the store unless the tree has its own.
    const order = (html: string): string[] => [...html.matchAll(/class="salmon-tree-view-label">([^<]+)</g)].map((m) => m[1]!);
    const sv = renderToString(h(LocaleProvider, { locale: 'sv' }, tree({})));
    const en = renderToString(h(LocaleProvider, { locale: 'sv' }, tree({ locale: 'en' })));
    assert.deepEqual(order(sv), ['b', 'ä']);
    assert.deepEqual(order(en), ['ä', 'b']);
  });
});
