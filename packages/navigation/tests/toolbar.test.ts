import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Button } from '@salmonui/buttons/button';
import { Toolbar, ToolbarGroup, ToolbarItem, ToolbarSeparator, ToolbarSpacer, TOOLBAR_DEFAULT_LOCALE_TEXT, type ToolbarItemSize } from '@salmonui/navigation/toolbar';
import { computeSteps, type SizedEntry } from '../dist/toolbar/sizing.js';

// Server markup of the Toolbar family. Keyboard, overflow measuring and
// the overflow menu run in tests/browser/toolbar.spec.ts; axe and ARIA in
// tests/browser/toolbar-a11y.spec.ts.

const render = (el: ReactElement): string => renderToString(el);
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};
const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;

describe('Toolbar server markup', () => {
  it('renders role="toolbar" with aria-orientation and wraps each plain child in a measured item', () => {
    const html = render(h(Toolbar, { 'aria-label': 'Format' }, h(Button, null, 'Bold'), h(Button, null, 'Italic'), h('span', null, 'Plain')));
    const root = tag(html, /<div[^>]*role="toolbar"[^>]*>/);
    assert.match(root, /aria-label="Format"/);
    assert.match(root, /aria-orientation="horizontal"/);
    assert.match(root, /class="salmon-toolbar"/);
    assert.match(root, /data-overflow="menu"/);
    assert.equal(count(html, /class="salmon-toolbar-item"/g), 3);
    assert.match(html, /Bold/);
    assert.match(html, /<span>Plain<\/span>/);
  });

  it('the server renders every item (none hidden) and a hidden overflow menu button, never a menu', () => {
    const html = render(h(Toolbar, { 'aria-label': 'T' }, ...Array.from({ length: 30 }, (_, i) => h(Button, { key: i }, `Item ${i}`))));
    assert.equal(count(html, /class="salmon-toolbar-item"/g), 30);
    assert.doesNotMatch(html, /class="salmon-toolbar-item"[^>]*hidden/);
    const more = tag(html, /<button[^>]*salmon-toolbar-more[^>]*>/);
    assert.match(more, /hidden=""/);
    assert.match(more, /aria-haspopup="menu"/);
    assert.match(more, /aria-expanded="false"/);
    assert.match(more, /aria-label="More"/);
    assert.doesNotMatch(html, /role="menu"/);
  });

  it('ToolbarItem keeps any content (inputs, templates) and writes overflow attributes', () => {
    const html = render(
      h(
        Toolbar,
        { 'aria-label': 'T' },
        h(ToolbarItem, { label: 'Find', overflow: 'never' }, h('input', { 'aria-label': 'Find' })),
        h(ToolbarItem, { label: 'Undo', overflow: 'always', overflowPriority: 3 }, h(Button, null, 'Undo')),
        h(ToolbarItem, { overflow: 'auto' }, h('strong', null, 'Template')),
      ),
    );
    assert.match(html, /data-overflow-mode="never"[^>]*><input aria-label="Find"/);
    assert.match(html, /data-overflow-mode="always" data-overflow-priority="3"/);
    assert.match(html, /<strong>Template<\/strong>/);
    assert.equal(count(html, /data-overflow-mode="auto"/g), 0, 'auto is the default and is not written');
  });

  it('ToolbarSeparator is a non-focusable separator perpendicular to the toolbar', () => {
    const html = render(h(Toolbar, { 'aria-label': 'T' }, h(Button, null, 'A'), h(ToolbarSeparator), h(Button, null, 'B')));
    const sep = tag(html, /<div[^>]*role="separator"[^>]*>/);
    assert.match(sep, /aria-orientation="vertical"/);
    assert.match(sep, /class="salmon-toolbar-separator"/);
    assert.doesNotMatch(sep, /tabindex/);
    const vertical = render(h(Toolbar, { 'aria-label': 'T', orientation: 'vertical' }, h(Button, null, 'A'), h(ToolbarSeparator), h(Button, null, 'B')));
    assert.match(tag(vertical, /<div[^>]*role="separator"[^>]*>/), /aria-orientation="horizontal"/);
  });
});

describe('Toolbar layout', () => {
  it('ToolbarGroup align and ToolbarSpacer', () => {
    const html = render(
      h(
        Toolbar,
        { 'aria-label': 'T' },
        h(ToolbarGroup, null, h(Button, null, 'A')),
        h(ToolbarGroup, { align: 'center', 'aria-label': 'Middle' }, h(Button, null, 'B')),
        h(ToolbarSpacer),
        h(ToolbarGroup, { align: 'end' }, h(Button, null, 'C')),
      ),
    );
    assert.match(html, /<div class="salmon-toolbar-group" data-align="start">/);
    assert.match(html, /<div role="group" aria-label="Middle" class="salmon-toolbar-group" data-align="center">/);
    assert.match(html, /data-align="end"/);
    assert.match(html, /<div aria-hidden="true" class="salmon-toolbar-spacer"><\/div>/);
    // Group children are wrapped in measured items too.
    assert.equal(count(html, /class="salmon-toolbar-item"/g), 3);
  });

  it('overflow="scroll" renders pointer-only scroll buttons; "wrap" renders neither scroll buttons nor a menu button', () => {
    const scroll = render(h(Toolbar, { 'aria-label': 'T', overflow: 'scroll' }, h(Button, null, 'A')));
    assert.match(scroll, /data-overflow="scroll"/);
    assert.equal(count(scroll, /class="salmon-toolbar-scroll-button"/g), 2);
    assert.match(tag(scroll, /<button[^>]*data-scroll="back"[^>]*>/), /tabindex="-1"[^>]*aria-hidden="true"/);
    assert.doesNotMatch(scroll, /salmon-toolbar-more/);
    const wrap = render(h(Toolbar, { 'aria-label': 'T', overflow: 'wrap' }, h(Button, null, 'A')));
    assert.match(wrap, /data-overflow="wrap"/);
    assert.doesNotMatch(wrap, /salmon-toolbar-scroll-button|salmon-toolbar-more/);
  });

  it('orientation="vertical" sets aria-orientation and data-orientation', () => {
    const html = render(h(Toolbar, { 'aria-label': 'T', orientation: 'vertical' }, h(Button, null, 'A')));
    const root = tag(html, /<div[^>]*role="toolbar"[^>]*>/);
    assert.match(root, /aria-orientation="vertical"/);
    assert.match(root, /data-orientation="vertical"/);
  });
});

describe('Toolbar states, locale and passthrough', () => {
  it('disabled disables every control through a disabled fieldset and sets aria-disabled', () => {
    const html = render(h(Toolbar, { 'aria-label': 'T', disabled: true }, h(Button, null, 'A')));
    assert.match(tag(html, /<div[^>]*role="toolbar"[^>]*>/), /aria-disabled="true"[^>]*data-disabled=""/);
    assert.match(html, /<fieldset role="none" class="salmon-toolbar-content" disabled=""/);
    assert.doesNotMatch(render(h(Toolbar, { 'aria-label': 'T' }, h(Button, null, 'A'))), /aria-disabled|<fieldset[^>]*disabled/);
  });

  it('an item disabled on its own child keeps the child disabled; visible is conditional rendering', () => {
    const show = false;
    const html = render(h(Toolbar, { 'aria-label': 'T' }, h(Button, { disabled: true }, 'Off'), show ? h(Button, null, 'Gone') : null));
    assert.match(html, /<button[^>]*disabled=""[^>]*>.*Off/);
    assert.doesNotMatch(html, /Gone/);
    assert.equal(count(html, /class="salmon-toolbar-item"/g), 1);
  });

  it('localeText overrides the default strings; moreIcon replaces the dots', () => {
    assert.deepEqual(TOOLBAR_DEFAULT_LOCALE_TEXT, {
      more: 'More',
      scrollBack: 'Scroll back',
      scrollForward: 'Scroll forward',
    });
    assert.ok(Object.isFrozen(TOOLBAR_DEFAULT_LOCALE_TEXT));
    const html = render(
      h(
        Toolbar,
        {
          'aria-label': 'T',
          localeText: { more: 'Weitere' },
          moreIcon: h('i', { id: 'ico' }),
        },
        h(Button, null, 'A'),
      ),
    );
    assert.match(tag(html, /<button[^>]*salmon-toolbar-more[^>]*>/), /aria-label="Weitere"/);
    assert.match(html, /<i id="ico"><\/i>/);
    const scroll = render(
      h(
        Toolbar,
        {
          'aria-label': 'T',
          overflow: 'scroll',
          localeText: { scrollBack: 'Zurück' },
        },
        h(Button, null, 'A'),
      ),
    );
    assert.match(scroll, /title="Zurück"/);
  });

  it('className, style and DOM props reach the toolbar and its parts', () => {
    const html = render(
      h(
        Toolbar,
        {
          'aria-label': 'T',
          className: 'mine',
          style: { width: 300 },
          id: 'tb',
          ...{ 'data-test': 'x' },
        },
        h(ToolbarItem, { className: 'it', style: { color: 'red' } }, 'A'),
        h(ToolbarGroup, { className: 'grp' }, 'B'),
        h(ToolbarSeparator, { className: 'sep' }),
        h(ToolbarSpacer, { className: 'sp' }),
      ),
    );
    const root = tag(html, /<div[^>]*role="toolbar"[^>]*>/);
    assert.match(root, /class="salmon-toolbar mine"/);
    assert.match(root, /style="width:300px"/);
    assert.match(root, /id="tb"/);
    assert.match(root, /data-test="x"/);
    assert.match(html, /style="color:red" class="salmon-toolbar-item it"/);
    assert.match(html, /class="salmon-toolbar-group grp"/);
    assert.match(html, /class="salmon-toolbar-separator sep"/);
    assert.match(html, /class="salmon-toolbar-spacer sp"/);
  });
});

describe('AppBar recipe', () => {
  it('a header.salmon-app-bar wraps a Toolbar; position, sticky and tone are data attributes', () => {
    const html = render(
      h(
        'header',
        {
          className: 'salmon-app-bar',
          'data-position': 'bottom',
          'data-sticky': '',
          'data-tone': 'primary',
        },
        h(Toolbar, { 'aria-label': 'Application' }, h(Button, null, 'Menu'), h(ToolbarSpacer), h(ToolbarItem, { overflow: 'never' }, h('input', { 'aria-label': 'Search' }))),
      ),
    );
    assert.match(html, /^<header class="salmon-app-bar" data-position="bottom" data-sticky="" data-tone="primary"><div[^>]*role="toolbar"/);
    assert.match(html, /aria-label="Application"/);
    assert.match(html, /<input aria-label="Search"\/>/);
  });
});

describe('Toolbar multi-size items and labelled groups', () => {
  it('a multi-size item renders its first size on the server, lists its sizes and passes the size to a function child', () => {
    const seen: ToolbarItemSize[] = [];
    const html = render(
      h(
        Toolbar,
        { 'aria-label': 'Home' },
        h(ToolbarItem, { sizes: ['lg', 'md', 'sm'], overflowPriority: 2, children: (size: ToolbarItemSize) => (seen.push(size), h(Button, null, `Paste ${size}`)) }),
        h(ToolbarItem, { sizes: ['sm'], children: (size: ToolbarItemSize) => h(Button, null, `Cut ${size}`) }),
        h(ToolbarItem, { children: (size: ToolbarItemSize) => h(Button, null, `Copy ${size}`) }),
      ),
    );
    assert.match(html, /data-overflow-priority="2" data-overflow-sizes="lg md sm" data-size="lg"/);
    assert.match(html, /Paste lg/);
    assert.deepEqual(seen, ['lg']);
    // A single size is fixed: no stepping list, the size is still written.
    assert.match(html, /<div class="salmon-toolbar-item" data-overflow-item="[^"]+" data-size="sm"><button[^>]*><span[^>]*>Cut sm/);
    // Without sizes the function child receives 'md' and no size attribute is written.
    assert.match(html, /<div class="salmon-toolbar-item" data-overflow-item="[^"]+"><button[^>]*><span[^>]*>Copy md/);
  });

  it('ToolbarGroup label renders a visible label that names the group, with the action slot next to it', () => {
    const html = render(
      h(
        Toolbar,
        { 'aria-label': 'Home' },
        h(
          ToolbarGroup,
          {
            label: 'Clipboard',
            action: h(Button, { iconOnly: true, 'aria-label': 'Clipboard options' }, '+'),
          },
          h(Button, null, 'Paste'),
        ),
        h(ToolbarGroup, { label: 'Font', 'aria-label': 'Font settings' }, h(Button, null, 'Bold')),
      ),
    );
    const group = tag(html, /<div role="group"[^>]*data-labelled=""[^>]*>/);
    const labelId = /aria-labelledby="([^"]+)"/.exec(group)?.[1];
    assert.ok(labelId);
    assert.match(
      html,
      new RegExp(
        `<div class="salmon-toolbar-group-items"><div class="salmon-toolbar-item"[^>]*><button[^>]*><span[^>]*>Paste</span></button></div></div><div class="salmon-toolbar-group-label"><span id="${labelId}">Clipboard</span><button[^>]*aria-label="Clipboard options"`,
      ),
    );
    // The visible label names the group (aria-labelledby wins over an aria-label; pass aria-labelledby to override).
    assert.match(html, /role="group" aria-labelledby="[^"]+" aria-label="Font settings"/);
    const custom = render(h(Toolbar, { 'aria-label': 'T' }, h(ToolbarGroup, { label: 'Font', 'aria-labelledby': 'mine' }, h(Button, null, 'A'))));
    assert.match(custom, /role="group" aria-labelledby="mine"/);
    // A group without a label keeps the old markup.
    const plain = render(h(Toolbar, { 'aria-label': 'T' }, h(ToolbarGroup, null, h(Button, null, 'A'))));
    assert.match(plain, /<div class="salmon-toolbar-group" data-align="start"><div class="salmon-toolbar-item"/);
  });
});

describe('toolbar sizing: computeSteps', () => {
  const steps = (entries: SizedEntry[], available: number): number[] => [...computeSteps(entries, available)];
  it('keeps every item at its first size while everything fits', () => {
    assert.deepEqual(steps([{ widths: [80, 50, 30] }, { widths: [80, 50, 30] }], 160), [0, 0]);
  });
  it('steps the last item of the lowest priority first, one size at a time, down to its last size, then the next', () => {
    const e: SizedEntry[] = [{ widths: [80, 50, 30] }, { widths: [80, 50, 30] }, { widths: [80, 50, 30] }];
    assert.deepEqual(steps(e, 210), [0, 0, 1]);
    assert.deepEqual(steps(e, 190), [0, 0, 2]);
    assert.deepEqual(steps(e, 160), [0, 1, 2]);
    assert.deepEqual(steps(e, 140), [0, 2, 2]);
    assert.deepEqual(steps(e, 90), [2, 2, 2]);
  });
  it('a higher priority steps down later; never and auto modes both step; always items never step', () => {
    const e: SizedEntry[] = [{ widths: [80, 30] }, { widths: [80, 30], priority: 5, mode: 'never' }, { widths: [80, 30], priority: 1 }, { widths: [80, 30], mode: 'always' }];
    assert.deepEqual(steps(e, 200), [1, 0, 0, 0]);
    assert.deepEqual(steps(e, 150), [1, 0, 1, 0]);
    assert.deepEqual(steps(e, 100), [1, 1, 1, 0]);
  });
  it('an unmeasured size counts as 0, so it is tried (rendered and measured) before a smaller one', () => {
    assert.deepEqual(steps([{ widths: [80, Number.NaN, 30] }], 60), [1]);
  });
  it('stops when nothing can step (the overflow takes over)', () => {
    assert.deepEqual(steps([{ widths: [80, 50] }, { widths: [40] }], 10), [1, 0]);
  });
});

describe('toolbar styles', () => {
  const css = readFileSync(new URL('../styles/toolbar.css', import.meta.url), 'utf8');
  const rule = (selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `no rule ${selector}`);
    return css.slice(at, css.indexOf('}', at));
  };
  it('the app bar recipe: bottom position, sticky and primary tone', () => {
    assert.match(rule('.salmon-app-bar[data-position="bottom"]'), /border-block-start: 1px solid/);
    assert.match(rule('.salmon-app-bar[data-sticky]'), /position: sticky;\s*inset-block-start: 0/);
    assert.match(rule('.salmon-app-bar[data-sticky][data-position="bottom"]'), /inset-block-end: 0/);
    assert.match(rule('.salmon-app-bar[data-tone="primary"]'), /background: var\(--salmon-color-primary\)/);
  });
  it('wrap mode wraps; hidden slots never show; only logical properties and --salmon-* colors', () => {
    assert.match(rule('.salmon-toolbar[data-overflow="wrap"] > .salmon-toolbar-content'), /flex-wrap: wrap/);
    assert.match(css, /\.salmon-toolbar-item\[hidden\],[\s\S]*?display: none !important/);
    assert.doesNotMatch(css, /(^|[\s;{])(left|right|margin-left|margin-right|padding-left|padding-right|width|height):/m);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  });
});
