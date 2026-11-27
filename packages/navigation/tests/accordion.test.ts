import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Accordion, AccordionItem, type AccordionProps } from '@salmonui/navigation/accordion';
import { toggleAccordionValue } from '../dist/accordion/Accordion.js';
import { isCollapseMounted } from '../dist/internal/collapse.js';

// Accordion server markup and value logic.
// Interaction, find-in-page and hydration run in
// tests/browser/accordion.spec.ts; axe and ARIA snapshots in accordion-a11y.spec.ts.

const render = (el: ReactElement): string => renderToString(el);
const items = (props: Partial<AccordionProps> = {}) =>
  render(
    h(
      Accordion,
      props as AccordionProps,
      h(AccordionItem, { value: 'shipping', header: 'Shipping' }, h('p', { id: 'ship-body' }, 'Ships in 2 days')),
      h(AccordionItem, { value: 'returns', header: 'Returns', disabled: true }, h('p', { id: 'ret-body' }, 'Within 30 days')),
      h(AccordionItem, { value: 'faq', header: 'FAQ' }, h('p', { id: 'faq-body' }, 'Questions')),
    ),
  );
const buttons = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];
const regions = (html: string): string[] => html.match(/<div[^>]*role="region"[^>]*>/g) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

describe('Accordion markup', () => {
  it('AccordionItem children render a header button and a panel each, with the header content', () => {
    const html = items();
    assert.match(html, /^<div class="salmon-accordion" data-type="multiple">/);
    assert.equal(buttons(html).length, 3);
    assert.equal(regions(html).length, 3);
    assert.match(html, /<span class="salmon-accordion-label">Shipping<\/span>/);
  });

  it('header button inside an h3 with aria-expanded / aria-controls; panel role="region" labelled by the header', () => {
    const html = items({ defaultValue: ['shipping'] });
    const [first, second] = buttons(html);
    const [panel] = regions(html);
    assert.match(html, /<h3 class="salmon-accordion-heading"><button/);
    assert.equal(attr(first!, 'aria-expanded'), 'true');
    assert.equal(attr(second!, 'aria-expanded'), 'false');
    assert.equal(attr(first!, 'aria-controls'), attr(panel!, 'id'));
    assert.equal(attr(panel!, 'aria-labelledby'), attr(first!, 'id'));
    assert.equal(attr(first!, 'type'), 'button');
  });

  it('disabled items carry aria-disabled; headingLevel picks the heading element', () => {
    const html = items({ headingLevel: 2 });
    assert.equal(attr(buttons(html)[1]!, 'aria-disabled'), 'true');
    assert.equal(attr(buttons(html)[0]!, 'aria-disabled'), null);
    assert.match(html, /<h2 class="salmon-accordion-heading">/);
    assert.doesNotMatch(html, /<h3/);
    assert.match(html, /class="salmon-accordion-item" data-state="closed" data-disabled=""/);
  });

  it('single non-collapsible mode marks the expanded header aria-disabled (APG)', () => {
    const html = items({ type: 'single', collapsible: false, defaultValue: ['faq'] });
    assert.match(html, /data-type="single"/);
    assert.equal(attr(buttons(html)[2]!, 'aria-disabled'), 'true');
    assert.equal(attr(buttons(html)[0]!, 'aria-disabled'), null);
  });

  it('icon renders decoratively before the header; hidden items render nothing', () => {
    const html = render(h(Accordion, null, h(AccordionItem, { value: 'a', header: 'A', icon: h('svg', { id: 'ico' }) }), h(AccordionItem, { value: 'b', header: 'B', hidden: true }, 'secret')));
    assert.match(html, /<span class="salmon-accordion-icon" aria-hidden="true"><svg id="ico"><\/svg><\/span><span class="salmon-accordion-label">A/);
    assert.doesNotMatch(html, /secret|>B</);
  });

  it('className, style and DOM props reach the root, the item, the header button and the panel', () => {
    const html = render(
      h(
        Accordion,
        { className: 'mine', style: { maxWidth: 400 }, id: 'acc', 'aria-label': 'Help' } as AccordionProps,
        h(AccordionItem, { value: 'a', header: 'A', className: 'item', style: { color: 'red' }, headerProps: { className: 'hdr', title: 'Open A' }, panelProps: { className: 'pnl', style: { padding: 4 } } }, 'x'),
      ),
    );
    assert.match(html, /^<div style="max-width:400px" id="acc" aria-label="Help" class="salmon-accordion mine"/);
    assert.match(html, /<div style="color:red" class="salmon-accordion-item item"/);
    assert.match(buttons(html)[0]!, /title="Open A"/);
    assert.match(buttons(html)[0]!, /class="salmon-accordion-trigger hdr"/);
    assert.match(regions(html)[0]!, /class="salmon-accordion-panel pnl"/);
    assert.match(regions(html)[0]!, /style="padding:4px"/);
  });
});

describe('Accordion value', () => {
  it('value / defaultValue hold item values (not indexes); controlled value wins', () => {
    const fromDefault = items({ defaultValue: ['faq'] });
    assert.deepEqual(buttons(fromDefault).map((b) => attr(b, 'aria-expanded')), ['false', 'false', 'true']);
    const controlled = items({ value: ['shipping', 'faq'], defaultValue: ['returns'] });
    assert.deepEqual(buttons(controlled).map((b) => attr(b, 'aria-expanded')), ['true', 'false', 'true']);
  });

  it('toggling in multiple mode adds and removes; single replaces; collapsible decides closing', () => {
    assert.deepEqual(toggleAccordionValue(['a'], 'b', false, true), ['a', 'b']);
    assert.deepEqual(toggleAccordionValue(['a', 'b'], 'a', false, true), ['b']);
    assert.deepEqual(toggleAccordionValue(['a'], 'b', true, true), ['b']);
    assert.deepEqual(toggleAccordionValue(['a'], 'a', true, true), []);
    const value = ['a'];
    assert.equal(toggleAccordionValue(value, 'a', true, false), value, 'a non-collapsible single accordion keeps its item');
  });
});

describe('Lazy panels', () => {
  it('collapsed panels have no content on the server; expanded ones do; panels hide through data-state', () => {
    const html = items({ defaultValue: ['shipping'] });
    assert.match(html, /id="ship-body"/);
    assert.doesNotMatch(html, /ret-body|faq-body/);
    assert.equal(attr(regions(html)[1]!, 'data-state'), 'closed');
    assert.equal(attr(regions(html)[1]!, 'hidden'), null, 'hidden="until-found" is set on the client only');
  });

  it('forceMount renders every panel on the server (per accordion or per item)', () => {
    const all = items({ forceMount: true });
    assert.match(all, /ship-body/);
    assert.match(all, /ret-body/);
    assert.match(all, /faq-body/);
    const one = render(h(Accordion, null, h(AccordionItem, { value: 'a', header: 'A', forceMount: true }, h('i', { id: 'a-body' })), h(AccordionItem, { value: 'b', header: 'B' }, h('i', { id: 'b-body' }))));
    assert.match(one, /a-body/);
    assert.doesNotMatch(one, /b-body/);
  });

  it('mount rule: open, forced, or opened once while keepMounted', () => {
    assert.equal(isCollapseMounted(false, false), false);
    assert.equal(isCollapseMounted(true, true), true);
    assert.equal(isCollapseMounted(false, true), true);
    assert.equal(isCollapseMounted(false, true, false), false);
    assert.equal(isCollapseMounted(false, false, true, true), true);
  });

  it('the stylesheet animates block-size with interpolate-size and turns it off under reduced motion', () => {
    const css = readFileSync(new URL('../styles/accordion.css', import.meta.url), 'utf8');
    assert.match(css, /interpolate-size: allow-keywords/);
    assert.match(css, /\[data-state='closed'\] \{\s*block-size: 0;/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.salmon-accordion-panel[\s\S]*transition: none/);
    assert.doesNotMatch(css, /\b(left|right)\s*:/, 'logical properties only');
  });
});

describe('Nested accordions', () => {
  it('an Accordion inside a panel has its own root, state and ids', () => {
    const html = render(
      h(Accordion, { defaultValue: ['outer'] }, h(AccordionItem, { value: 'outer', header: 'Outer' }, h(Accordion, { defaultValue: [] }, h(AccordionItem, { value: 'outer', header: 'Inner' }, 'inner body')))),
    );
    assert.equal(html.match(/class="salmon-accordion"/g)?.length, 2);
    const [outer, inner] = buttons(html);
    assert.equal(attr(outer!, 'aria-expanded'), 'true');
    assert.equal(attr(inner!, 'aria-expanded'), 'false', 'the same item value in the inner accordion is independent');
    assert.notEqual(attr(outer!, 'id'), attr(inner!, 'id'));
  });
});
