// Tooltip server markup:
// the trigger renders on the server, the content and aria-describedby
// never do. Interaction tests: tests/browser/tooltip.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Tooltip, TooltipProvider, type TooltipContentProps } from '@salmonui/overlays/tooltip';

describe('Tooltip markup', () => {
  it('children render in a display: contents wrapper; no content or aria-describedby on the server, even when open', () => {
    for (const defaultOpen of [false, true]) {
      const out = renderToString(h(Tooltip, { content: 'Save the order', defaultOpen }, h('button', { type: 'button' }, 'Save')));
      assert.equal(out, '<span class="salmon-tooltip-trigger" style="display:contents"><button type="button">Save</button></span>');
    }
  });

  it('the render prop renders the trigger itself with the computed props', () => {
    const out = renderToString(h(Tooltip, { content: 'Tip', render: (p) => h('button', { ...p, type: 'button', className: 'x' }, 'Go') }));
    assert.equal(out, '<button type="button" class="x">Go</button>');
  });

  it('contentProps takes data-* attributes in an object literal', () => {
    // A type test first: before TooltipContentProps a `data-*` key in an object literal failed to compile.
    const contentProps: TooltipContentProps = { 'data-variant': 'warning', title: 'Hint' };
    const out = renderToString(h(Tooltip, { content: 'Tip', contentProps }, h('button', { type: 'button' }, 'Go')));
    assert.equal(contentProps['data-variant'], 'warning');
    assert.match(out, /<button type="button">Go<\/button>/);
  });

  it('Tooltip.Provider is the flat TooltipProvider and renders no element', () => {
    assert.equal(Tooltip.Provider, TooltipProvider);
    assert.equal(renderToString(h(TooltipProvider, { delay: 0 }, 'x')), 'x');
  });

  it('the stylesheet is self-contained and in the package styles.css', () => {
    const css = readFileSync(new URL('../dist/tooltip.css', import.meta.url), 'utf8');
    assert.match(css, /\.salmon-tooltip\b/);
    assert.match(css, /prefers-reduced-motion/);
    assert.doesNotMatch(css, /@import/);
    // Each module sits in its cascade layer: the aggregate holds the source module.
    assert.ok(readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8').includes(readFileSync(new URL('../styles/tooltip.css', import.meta.url), 'utf8')));
  });
});
