// SidebarLayout server rendering: renders through react-dom/server with DOM globals
// removed. Interaction, measurement and hydration are covered by
// tests/browser/sidebar-layout.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'matchMedia']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h } = await import('react');
const { renderToString } = await import('react-dom/server');
const { SidebarLayout, SidebarPanel, SidebarMain, SidebarTrigger, SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT } = await import('@salmonui/navigation/sidebar-layout');

type Props = Record<string, unknown>;
const layout = (props: Props = {}, panel: Props = {}, trigger: Props = {}) =>
  renderToString(h(SidebarLayout, props, h(SidebarPanel, panel, h('a', { href: '#a' }, 'A')), h(SidebarMain, null, h(SidebarTrigger, trigger), 'Content')));
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};

describe('SidebarLayout structure', () => {
  it('renders the layout root with an <aside> panel, the main content and a trigger', () => {
    const html = layout();
    const root = tag(html, /<div[^>]*class="salmon-sidebar-layout"[^>]*>/);
    assert.match(root, /data-side="start"/);
    assert.match(root, /data-mode="push"/);
    assert.match(root, /data-presentation="push"/);
    assert.match(root, /data-state="open"/);
    const aside = tag(html, /<aside[^>]*>/);
    assert.match(aside, /class="salmon-sidebar-panel"/);
    assert.match(aside, /data-salmon-surface="sidebar"/);
    assert.match(aside, /aria-label="Sidebar"/, 'default accessible name from localeText');
    assert.doesNotMatch(aside, /inert/);
    assert.match(html, /<div class="salmon-sidebar-main" data-side="start">/);
    assert.match(html, /<a href="#a">A<\/a>/);
  });

  it('navigation renders <nav>; aria-label or aria-labelledby replaces the default name', () => {
    assert.match(tag(layout({}, { navigation: true, 'aria-label': 'Main navigation' }), /<nav[^>]*>/), /aria-label="Main navigation"/);
    const labelled = tag(layout({}, { 'aria-labelledby': 'title' }), /<aside[^>]*>/);
    assert.match(labelled, /aria-labelledby="title"/);
    assert.doesNotMatch(labelled, /aria-label=/);
  });

  it('SidebarTrigger is a button with aria-expanded and aria-controls pointing at the panel', () => {
    const html = layout();
    const panelId = tag(html, /<aside[^>]*>/).match(/id="([^"]+)"/)?.[1];
    assert.ok(panelId);
    const button = tag(html, /<button[^>]*>/);
    assert.match(button, /type="button"/);
    assert.match(button, /aria-expanded="true"/);
    assert.match(button, new RegExp(`aria-controls="${panelId}"`));
    assert.match(button, /aria-label="Toggle sidebar"/);
    assert.match(button, /class="salmon-sidebar-trigger"/);
    assert.match(html, /<span class="salmon-sidebar-trigger__icon" aria-hidden="true"><svg/);
  });

  it('the rail trigger has its own built-in icon, distinct from the menu icon', () => {
    const html = renderToString(h(SidebarLayout, null, h(SidebarPanel), h(SidebarMain, null, h(SidebarTrigger), h(SidebarTrigger, { action: 'collapse' }))));
    const icons = [...html.matchAll(/<span class="salmon-sidebar-trigger__icon" aria-hidden="true">(<svg.*?<\/svg>)<\/span>/g)].map((m) => m[1]);
    assert.equal(icons.length, 2);
    assert.notEqual(icons[0], icons[1]);
  });

  it('a trigger with text content has no default aria-label; icon replaces the built-in icon', () => {
    const html = renderToString(h(SidebarLayout, null, h(SidebarPanel), h(SidebarMain, null, h(SidebarTrigger, { icon: h('i', null, '=') }, 'Menu'))));
    const button = tag(html, /<button[^>]*>/);
    assert.doesNotMatch(button, /aria-label=/);
    assert.match(html, /aria-hidden="true"><i>=<\/i><\/span>Menu<\/button>/);
  });

  it('the layout bounds the panel to its own element (no portal, no fixed position on the server)', () => {
    const html = layout({ mode: 'overlay' });
    assert.match(html, /^<div[^>]*class="salmon-sidebar-layout"[^>]*><aside/);
  });
});

describe('push mode, size, rail and side', () => {
  it('defaultOpen={false} renders a closed, inert panel and aria-expanded="false"', () => {
    const html = layout({ defaultOpen: false });
    assert.match(tag(html, /<div[^>]*salmon-sidebar-layout[^>]*>/), /data-state="closed"/);
    const aside = tag(html, /<aside[^>]*>/);
    assert.match(aside, /data-state="closed"/);
    assert.match(aside, /inert=""/);
    assert.match(tag(html, /<button[^>]*>/), /aria-expanded="false"/);
  });

  it('size and railSize set the track variables; numbers are px', () => {
    const root = tag(layout({ size: 240, railSize: '4rem' }), /<div[^>]*salmon-sidebar-layout[^>]*>/);
    assert.match(root, /style="--salmon-sidebar-size:240px;--salmon-sidebar-rail-size:4rem"/);
    assert.doesNotMatch(tag(layout(), /<div[^>]*salmon-sidebar-layout[^>]*>/), /style=/, 'defaults live in the CSS');
  });

  it('defaultCollapsed marks the rail; a collapse trigger reports aria-expanded="false" and its own name', () => {
    const html = layout({ defaultCollapsed: true }, {}, { action: 'collapse' });
    assert.match(tag(html, /<aside[^>]*>/), /data-collapsed=""/);
    const button = tag(html, /<button[^>]*>/);
    assert.match(button, /aria-expanded="false"/);
    assert.match(button, /data-action="collapse"/);
    assert.match(button, /aria-label="Collapse sidebar"/);
  });

  it("side='end' is logical: data-side on the root, panel and main", () => {
    const html = layout({ side: 'end' });
    assert.match(tag(html, /<div[^>]*salmon-sidebar-layout[^>]*>/), /data-side="end"/);
    assert.match(tag(html, /<aside[^>]*>/), /data-side="end"/);
    assert.match(html, /class="salmon-sidebar-main" data-side="end"/);
  });

  it('collapsed controlled prop wins over defaultCollapsed', () => {
    assert.doesNotMatch(tag(layout({ collapsed: false, defaultCollapsed: true }), /<aside[^>]*>/), /data-collapsed/);
  });
});

describe('overlay mode and collapseBelow on the server', () => {
  it('overlay mode renders closed on the server even with defaultOpen (it opens after hydration)', () => {
    const html = layout({ mode: 'overlay', defaultOpen: true });
    const aside = tag(html, /<aside[^>]*>/);
    assert.match(aside, /data-presentation="overlay"/);
    assert.match(aside, /data-state="closed"/);
    assert.match(aside, /inert=""/);
  });

  it('collapseBelow (container px) emits a per-instance container query and leaves data-presentation unset', () => {
    const html = layout({ collapseBelow: 768 });
    const root = tag(html, /<div[^>]*salmon-sidebar-layout[^>]*>/);
    assert.doesNotMatch(root, /data-presentation/);
    assert.doesNotMatch(tag(html, /<aside[^>]*>/), /data-presentation/);
    const id = root.match(/data-layout="([^"]+)"/)?.[1];
    assert.ok(id);
    const style = tag(html, /<style>[\s\S]*?<\/style>/);
    assert.ok(style.includes(`@container salmon-sidebar-layout (width &lt; 768px)`) || style.includes('@container salmon-sidebar-layout (width < 768px)'), style);
    assert.ok(style.includes(`.salmon-sidebar-panel[data-layout=&quot;${id}&quot;]:not([data-presentation])`) || style.includes(`.salmon-sidebar-panel[data-layout="${id}"]:not([data-presentation])`), style);
    assert.match(style, /visibility:hidden/);
  });

  it('a media query string becomes an @media rule; braces and angle brackets are stripped', () => {
    const style = tag(layout({ collapseBelow: '(max-width: 700px)' }), /<style>[\s\S]*?<\/style>/);
    assert.match(style, /@media \(max-width: 700px\)\{/);
    const hostile = tag(layout({ collapseBelow: '(max-width: 1px)}</style><script>' }), /<style>[\s\S]*?<\/style>/);
    assert.doesNotMatch(hostile, /<script>/);
  });

  it('server markup is deterministic and has no per-render values', () => {
    const el = h(SidebarLayout, { collapseBelow: 500 }, h(SidebarPanel), h(SidebarMain));
    assert.equal(renderToString(el), renderToString(el));
  });
});

describe('passthrough, locale and exports', () => {
  it('className, style and DOM props reach the root, panel, main and trigger', () => {
    const html = renderToString(
      h(
        SidebarLayout,
        { className: 'app', style: { height: 300 }, title: 'Layout', ...{ 'data-test': 'root' } },
        h(SidebarPanel, { className: 'side', style: { padding: 4 }, title: 'Panel' }),
        h(SidebarMain, { className: 'content', id: 'main' }, h(SidebarTrigger, { className: 'menu', title: 'Menu' })),
      ),
    );
    const root = tag(html, /<div[^>]*salmon-sidebar-layout[^>]*>/);
    assert.match(root, /class="salmon-sidebar-layout app"/);
    assert.match(root, /style="height:300px"/);
    assert.match(root, /title="Layout"/);
    assert.match(root, /data-test="root"/);
    const aside = tag(html, /<aside[^>]*>/);
    assert.match(aside, /class="salmon-sidebar-panel side"/);
    assert.match(aside, /style="padding:4px"/);
    assert.match(html, /<div id="main" class="salmon-sidebar-main content"/);
    assert.match(tag(html, /<button[^>]*>/), /class="salmon-sidebar-trigger menu"/);
  });

  it('SidebarMain and SidebarTrigger render props receive the computed props', () => {
    const html = renderToString(
      h(
        SidebarLayout,
        null,
        h(SidebarPanel),
        h(SidebarMain, { render: (p: object) => h('main', p) }, h(SidebarTrigger, { render: (p: object) => h('a', { ...p, href: '#menu' }) })),
      ),
    );
    assert.match(html, /<main class="salmon-sidebar-main" data-side="start">/);
    const link = tag(html, /<a [^>]*href="#menu"[^>]*>/);
    assert.match(link, /aria-expanded="true"/);
    assert.match(link, /aria-controls=/);
    assert.doesNotMatch(link, /type="button"/);
  });

  it('localeText overrides the default names; the defaults are exported and frozen', () => {
    const html = layout({ localeText: { panel: 'Barra lateral', toggle: 'Alternar barra' } });
    assert.match(tag(html, /<aside[^>]*>/), /aria-label="Barra lateral"/);
    assert.match(tag(html, /<button[^>]*>/), /aria-label="Alternar barra"/);
    assert.equal(SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT.panel, 'Sidebar');
    assert.ok(Object.isFrozen(SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT));
  });

  it('parts outside a SidebarLayout throw a descriptive error', () => {
    assert.throws(() => renderToString(h(SidebarTrigger)), /SidebarTrigger must be rendered inside a SidebarLayout/);
  });
});
