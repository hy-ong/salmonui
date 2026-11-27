// Spinner and Skeleton server markup: both are server components (no "use client", no hooks), so every
// behavior is asserted on renderToString output; animation, RTL and reduced
// motion are asserted in tests/browser/notifications-spinner-skeleton.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Spinner, type SpinnerProps } from '@salmonui/notifications/spinner';
import { Skeleton, type SkeletonProps } from '@salmonui/notifications/skeleton';

const html = (element: ReactElement) => renderToString(element);
const spinner = (props: SpinnerProps = {}) => html(h(Spinner, props));
const skeleton = (props: SkeletonProps = {}) => html(h(Skeleton, props));
const attr = (markup: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const dist = new URL('../dist/', import.meta.url);

describe('Spinner markup', () => {
  it('without a label the spinner is decorative; with one it is a status region with hidden text', () => {
    const plain = spinner();
    assert.match(plain, /^<span class="salmon-spinner"/);
    assert.equal(attr(plain, 'aria-hidden'), 'true');
    assert.equal(attr(plain, 'role'), null);
    const named = spinner({ label: 'Loading orders' });
    assert.equal(attr(named, 'role'), 'status');
    assert.equal(attr(named, 'aria-hidden'), null);
    assert.match(named, /<span class="salmon-visually-hidden">Loading orders<\/span>/);
  });

  it('size is a data hook for the three metric sets or a pixel diameter', () => {
    assert.equal(attr(spinner(), 'data-size'), 'md');
    for (const size of ['sm', 'md', 'lg'] as const) assert.equal(attr(spinner({ size }), 'data-size'), size);
    const custom = spinner({ size: 48 });
    assert.equal(attr(custom, 'data-size'), null);
    assert.match(attr(custom, 'style') ?? '', /--salmon-spinner-size:48px/);
  });

  it('className and style reach the root; other DOM props spread onto it', () => {
    const out = spinner({ className: 'mine', style: { color: 'red' }, id: 's1', 'data-test': 'x' } as SpinnerProps);
    assert.equal(attr(out, 'class'), 'salmon-spinner mine');
    assert.equal(attr(out, 'style'), 'color:red');
    assert.equal(attr(out, 'id'), 's1');
    assert.equal(attr(out, 'data-test'), 'x');
  });

  it('indicator replaces the built-in ring', () => {
    assert.match(spinner(), /salmon-spinner__ring/);
    const out = spinner({ indicator: h('svg', { className: 'dots' }) });
    assert.doesNotMatch(out, /salmon-spinner__ring/);
    assert.match(out, /<svg class="dots">/);
  });

  it('overlay covers the positioned parent; with children the wrapper is aria-busy and the children inert', () => {
    assert.equal(attr(spinner({ overlay: true }), 'data-overlay'), '');
    const out = html(h(Spinner, { label: 'Saving', className: 'card' }, h('p', null, 'Form')));
    assert.match(out, /^<div class="salmon-spinner-container card" data-loading="" aria-busy="true">/);
    assert.match(out, /<div class="salmon-spinner-content" inert="">\s*<p>Form<\/p><\/div>/);
    assert.match(out, /<span class="salmon-spinner" data-size="md" data-overlay="" role="status">/);
  });

  it('loading={false} renders only the children (or nothing) and keeps the wrapper', () => {
    assert.equal(spinner({ loading: false }), '');
    const out = html(h(Spinner, { loading: false }, h('p', null, 'Form')));
    assert.equal(out, '<div class="salmon-spinner-container"><div class="salmon-spinner-content"><p>Form</p></div></div>');
  });
});

describe('Skeleton markup', () => {
  it('text is the default shape; lines renders one bar per line', () => {
    const one = skeleton();
    assert.match(one, /^<span class="salmon-skeleton"/);
    assert.equal(attr(one, 'data-shape'), 'text');
    assert.doesNotMatch(one, /salmon-skeleton__line/);
    const three = skeleton({ lines: 3 });
    assert.equal(attr(three, 'data-lines'), '3');
    assert.equal(three.match(/salmon-skeleton__line/g)?.length, 3);
  });

  it('circle and rect shapes', () => {
    assert.equal(attr(skeleton({ shape: 'circle' }), 'data-shape'), 'circle');
    assert.equal(attr(skeleton({ shape: 'rect', width: 120, height: 120 }), 'data-shape'), 'rect');
  });

  it('width and height accept pixels or CSS lengths', () => {
    assert.equal(attr(skeleton({ shape: 'rect', width: 120, height: '4rem' }), 'style'), 'inline-size:120px;block-size:4rem');
    assert.equal(attr(skeleton(), 'style'), null);
  });

  it('wave is the default animation; pulse and none are data hooks', () => {
    assert.equal(attr(skeleton(), 'data-animation'), 'wave');
    assert.equal(attr(skeleton({ animation: 'pulse' }), 'data-animation'), 'pulse');
    assert.equal(attr(skeleton({ animation: false }), 'data-animation'), 'none');
  });

  it('the wave reuses the Data Grid shimmer keyframes, stopped under reduced motion', () => {
    const css = readFileSync(new URL('skeleton.css', dist), 'utf8');
    const grid = readFileSync(new URL(import.meta.resolve('@salmonui/data-grid/styles.css')), 'utf8');
    const shimmer = readFileSync(new URL('../../core/styles/shimmer.css', import.meta.url), 'utf8');
    // One keyframes source (the core shimmer module), carried by both stylesheets under one name.
    const keyframes = /@keyframes salmon-data-grid-shimmer\s*\{/g;
    assert.ok(css.includes(shimmer) && grid.includes(shimmer), 'skeleton.css and the Data Grid stylesheet carry the shimmer module');
    assert.equal(css.match(keyframes)?.length, 1);
    assert.equal(grid.match(keyframes)?.length, 1);
    assert.doesNotMatch(readFileSync(new URL(import.meta.resolve('@salmonui/core/styles.css')), 'utf8'), keyframes);
    assert.match(css, /animation: salmon-data-grid-shimmer /);
    assert.match(grid, /animation: salmon-data-grid-shimmer /);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^{]*\{\s*\.salmon-skeleton::after/);
  });

  it('loading with children sizes the placeholder from inert children; loading={false} renders them alone', () => {
    const out = html(h(Skeleton, null, h('p', null, 'Card')));
    assert.equal(attr(out, 'data-content'), '');
    assert.match(out, /<span class="salmon-skeleton__content" inert="">\s*<p>Card<\/p><\/span>/);
    assert.equal(html(h(Skeleton, { loading: false }, h('p', null, 'Card'))), '<p>Card</p>');
    assert.equal(skeleton({ loading: false }), '');
  });

  it('every skeleton is aria-hidden', () => {
    for (const shape of ['text', 'circle', 'rect'] as const) assert.equal(attr(skeleton({ shape }), 'aria-hidden'), 'true');
  });

  it('className and style pass through; DOM props spread on the root', () => {
    const out = skeleton({ className: 'mine', style: { opacity: 0.5 }, id: 'k' });
    assert.equal(attr(out, 'class'), 'salmon-skeleton mine');
    assert.equal(attr(out, 'style'), 'opacity:0.5');
    assert.equal(attr(out, 'id'), 'k');
  });
});

describe('Spinner and Skeleton entries', () => {
  it('are server components: no "use client" directive', () => {
    for (const entry of ['spinner.js', 'skeleton.js', 'spinner/Spinner.js', 'skeleton/Skeleton.js']) {
      assert.doesNotMatch(readFileSync(new URL(entry, dist), 'utf8'), /^\s*['"]use client['"]/);
    }
  });
});
