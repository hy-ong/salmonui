// Server markup of the Layout display components:
// Card, Avatar, Timeline and List render
// complete HTML on the server. Card, Timeline and List are server components
// (no hooks; tooling/checks/server-boundary.mjs asserts their graphs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Avatar, AvatarGroup, initialsOf } from '@salmonui/layout/avatar';
import { Badge } from '@salmonui/notifications/badge';
import { Card, CardActions, CardBody, CardDescription, CardHeader, CardMedia, CardSeparator, CardTitle } from '@salmonui/layout/card';
import { List, ListItem } from '@salmonui/layout/list';
import { Timeline, TimelineItem } from '@salmonui/layout/timeline';

// React 19 hoists an image preload <link> before the markup; it is not the component's output.
const html = (el: ReactElement) => renderToString(el).replace(/^(<link [^>]*>)+/, '');

describe('Avatar', () => {
  it('initials from the first and last word, locale-aware; children override; role img with the name', () => {
    assert.equal(initialsOf('Ada Lovelace'), 'AL');
    assert.equal(initialsOf('  grace   brewster murray hopper '), 'GH');
    assert.equal(initialsOf('Plato'), 'P');
    assert.equal(initialsOf('ılkay ince', 'tr'), 'Iİ');
    assert.equal(initialsOf(''), '');
    const out = html(h(Avatar, { name: 'Ada Lovelace' }));
    assert.equal(out, '<span role="img" aria-label="Ada Lovelace" class="salmon-avatar" data-size="md" data-shape="square" data-tone="neutral"><span class="salmon-avatar-fallback" aria-hidden="true">AL</span></span>');
    assert.match(html(h(Avatar, { name: 'Ada Lovelace' }, 'A')), /aria-hidden="true">A<\/span>/);
  });

  it('the image is rendered over the initials on the server (decorative alt; the name is on the root)', () => {
    const out = html(h(Avatar, { src: '/ada.png', alt: 'Ada', name: 'Ada Lovelace' }));
    assert.match(out, /^<span role="img" aria-label="Ada" class="salmon-avatar"/);
    assert.match(out, /<span class="salmon-avatar-fallback" aria-hidden="true">AL<\/span><img src="\/ada.png" alt="" class="salmon-avatar-image"\/>/);
  });

  it('fallback node without a name is decorative', () => {
    const out = html(h(Avatar, { fallback: h('svg', { className: 'icon' }) }));
    assert.match(out, /^<span aria-hidden="true" class="salmon-avatar"/);
    assert.match(out, /<svg class="icon"><\/svg>/);
  });

  it('size, shape and tone are data hooks with md / square / neutral defaults', () => {
    for (const size of ['xs', 'sm', 'md', 'lg', 'xl'] as const) assert.match(html(h(Avatar, { name: 'A', size })), new RegExp(`data-size="${size}"`));
    assert.match(html(h(Avatar, { name: 'A', shape: 'circle' })), /data-shape="circle"/);
    for (const tone of ['neutral', 'primary', 'info', 'success', 'warning', 'danger'] as const) assert.match(html(h(Avatar, { name: 'A', tone })), new RegExp(`data-tone="${tone}"`));
    assert.match(html(h(Avatar, { name: 'A', className: 'mine', style: { color: 'red' } })), /style="color:red" class="salmon-avatar mine"/);
  });

  it('a numeric size is a px size: it sets --salmon-avatar-size and no data-size, and keeps the style prop', () => {
    const out = html(h(Avatar, { name: 'Olivia', size: 22, style: { color: 'red' } }));
    assert.match(out, /style="--salmon-avatar-size:22px;color:red" class="salmon-avatar" data-shape="square"/);
    assert.doesNotMatch(out, /data-size/);
    assert.match(html(h(AvatarGroup, { max: 0, size: 28 }, h(Avatar, { name: 'A' }))), /style="--salmon-avatar-size:28px" class="salmon-avatar salmon-avatar-overflow"/);
  });

  it('AvatarGroup shows max avatars and a labelled +N avatar', () => {
    const out = html(h(AvatarGroup, { max: 2, 'aria-label': 'Team' }, ['Ada L', 'Bo K', 'Cy D', 'Di E'].map((n) => h(Avatar, { key: n, name: n }))));
    assert.match(out, /^<div role="group" aria-label="Team" class="salmon-avatar-group">/);
    assert.equal((out.match(/class="salmon-avatar"/g) ?? []).length, 2);
    assert.match(out, /role="img" aria-label="2 more" class="salmon-avatar salmon-avatar-overflow" data-size="md" data-shape="circle"/);
    assert.match(out, />\+2<\/span>/);
    const fr = html(h(AvatarGroup, { max: 1, localeText: { more: (n: number) => `${n} de plus` } }, h(Avatar, { name: 'A' }), h(Avatar, { name: 'B' })));
    assert.match(fr, /aria-label="1 de plus"/);
    assert.doesNotMatch(html(h(AvatarGroup, { max: 5 }, h(Avatar, { name: 'A' }))), /overflow/);
  });

  it('a circular overlay Badge wraps the Avatar on the server; the count and its label render', () => {
    const out = html(h(Badge, { content: 3, overlap: 'circular', label: '3 unread messages' }, h(Avatar, { name: 'Ada Lovelace', shape: 'circle' })));
    assert.match(out, /^<span class="salmon-badge-host" data-overlap="circular"><span role="img" aria-label="Ada Lovelace" class="salmon-avatar"/);
    assert.match(out, /<span class="salmon-badge"[^>]*aria-hidden="true"[^>]*>3<\/span><span class="salmon-visually-hidden">3 unread messages<\/span><\/span>$/);
    const dot = html(h(Badge, { dot: true, overlap: 'circular', placement: 'bottomEnd', label: 'Online', tone: 'success' }, h(Avatar, { name: 'Ada Lovelace', shape: 'circle' })));
    assert.match(dot, /data-placement="bottomEnd" data-overlap="circular"/);
    assert.match(dot, /data-dot="true"/);
    // Avatar and Badge stay independent families: neither stylesheet carries the other.
    const avatarCss = readFileSync(new URL('../dist/avatar.css', import.meta.url), 'utf8');
    assert.doesNotMatch(avatarCss, /salmon-badge/);
  });
});

describe('Card', () => {
  const card = (props: Record<string, unknown> = {}) =>
    html(
      h(
        Card,
        props,
        h(CardHeader, { media: h(Avatar, { name: 'Ada Lovelace', shape: 'circle' }) }, h(CardTitle, null, 'Ada'), h(CardDescription, null, 'Mathematician')),
        h(CardMedia, { title: 'Analytical engine' }, h('img', { src: '/e.png', alt: '' })),
        h(CardBody, null, 'Body'),
        h(CardSeparator),
        h(CardActions, { orientation: 'vertical' }, h('button', { type: 'button' }, 'Share')),
      ),
    );

  it('a div root by default, render swaps the element, orientation hook', () => {
    assert.match(card(), /^<div class="salmon-card" data-orientation="vertical">/);
    assert.match(card({ orientation: 'horizontal', className: 'x' }), /^<div class="salmon-card x" data-orientation="horizontal">/);
    assert.match(card({ render: (p: object) => h('article', p) }), /^<article class="salmon-card" data-orientation="vertical">/);
    assert.match(card({ render: (p: object) => h('a', { ...p, href: '/ada' }) }), /^<a class="salmon-card" data-orientation="vertical" href="\/ada">/);
  });

  it('header with media, caption, title heading and description', () => {
    const out = card();
    assert.match(out, /<div class="salmon-card-header"><div class="salmon-card-header-media"><span role="img" aria-label="Ada Lovelace" class="salmon-avatar" data-size="md" data-shape="circle"/);
    assert.match(out, /<div class="salmon-card-header-caption"><h3 class="salmon-card-title">Ada<\/h3><p class="salmon-card-description">Mathematician<\/p><\/div>/);
    assert.match(html(h(CardTitle, { level: 2 }, 'T')), /^<h2 class="salmon-card-title">T<\/h2>$/);
  });

  it('body, media with a title overlay, actions, separator', () => {
    const out = card();
    assert.match(out, /<div class="salmon-card-media"><img src="\/e.png" alt=""\/><div class="salmon-card-media-title">Analytical engine<\/div><\/div>/);
    assert.match(out, /<div class="salmon-card-body">Body<\/div><hr class="salmon-card-separator"\/>/);
    assert.match(out, /<div data-orientation="vertical" class="salmon-card-actions"><button type="button">Share<\/button><\/div>/);
    assert.match(html(h(CardActions)), /data-orientation="horizontal"/);
  });

  it('the parts are dot and flat exports', () => {
    assert.equal(Card.Header, CardHeader);
    assert.equal(Card.Actions, CardActions);  });
});

describe('Timeline', () => {
  const items = [
    { content: 'Ordered', opposite: '09:00', tone: 'primary' as const, key: 'a' },
    { content: 'Shipped', opposite: '12:00', marker: h('svg', { className: 'truck' }), className: 'ship' },
    { content: 'Delivered', disabled: true },
  ];

  it('an ol of li items with opposite, marker, tone, className and disabled', () => {
    const out = html(h(Timeline, { items, 'aria-label': 'Order' }));
    assert.match(out, /^<ol aria-label="Order" class="salmon-timeline" data-orientation="vertical" data-align="end">/);
    assert.match(out, /<li class="salmon-timeline-item" data-tone="primary"><div class="salmon-timeline-opposite">09:00<\/div><div class="salmon-timeline-marker" aria-hidden="true"><span class="salmon-timeline-dot"><\/span><\/div><div class="salmon-timeline-content">Ordered<\/div><\/li>/);
    assert.match(out, /<li class="salmon-timeline-item ship" data-tone="neutral">.*<svg class="truck"><\/svg>/);
    assert.match(out, /<li class="salmon-timeline-item" data-tone="neutral" aria-disabled="true">/);
  });

  it('Timeline.Item children give the same markup; renderItem gets index, first and last', () => {
    const fromItems = html(h(Timeline, { items: [{ content: 'A', opposite: '1' }, { content: 'B' }] }));
    const fromChildren = html(h(Timeline, null, h(TimelineItem, { opposite: '1' }, 'A'), h(TimelineItem, null, 'B')));
    assert.equal(fromChildren, fromItems);
    const out = html(h(Timeline, { items, renderItem: (item: { content?: unknown }, s: { index: number; first: boolean; last: boolean }) => `${String(item.content)}:${s.index}:${s.first}:${s.last}` }));
    assert.match(out, /Ordered:0:true:false/);
    assert.match(out, /Delivered:2:false:true/);
  });

  it('orientation, align, reverse (DOM order) and className / style', () => {
    assert.match(html(h(Timeline, { items, orientation: 'horizontal', align: 'alternate' })), /data-orientation="horizontal" data-align="alternate"/);
    for (const align of ['start', 'end', 'alternate', 'alternateReverse'] as const) assert.match(html(h(Timeline, { items, align })), new RegExp(`data-align="${align}"`));
    const out = html(h(Timeline, { items, reverse: true, className: 'x', style: { maxWidth: 300 } }));
    assert.ok(out.indexOf('Delivered') < out.indexOf('Ordered'));
    assert.match(out, /style="max-width:300px" class="salmon-timeline x"/);
    assert.equal(Timeline.Item, TimelineItem);
  });
});

describe('List', () => {
  it('ul / ol with salmon-list classes, composing Avatar', () => {
    const out = html(h(List, { 'aria-label': 'People' }, h(ListItem, null, h(Avatar, { name: 'Ada Lovelace', size: 'sm' }), 'Ada', h('span', { className: 'salmon-list-item-description' }, 'Mathematician'))));
    assert.match(out, /^<ul aria-label="People" class="salmon-list"><li class="salmon-list-item"><span role="img" aria-label="Ada Lovelace" class="salmon-avatar" data-size="sm"/);
    assert.match(html(h(List, { ordered: true, className: 'x' }, h(ListItem, null, 'a'))), /^<ol class="salmon-list x"><li class="salmon-list-item">a<\/li><\/ol>$/);
    assert.equal(List.Item, ListItem);
  });
});

describe('stylesheets', () => {
  it('each family has a self-contained stylesheet with logical properties, included in styles.css', () => {
    const all = readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8');
    for (const name of ['card', 'avatar', 'timeline', 'list']) {
      const css = readFileSync(new URL(`../dist/${name}.css`, import.meta.url), 'utf8');
      assert.match(css, new RegExp(`\\.salmon-${name}\\b`));
      assert.doesNotMatch(css, /@import/);
      assert.doesNotMatch(css, /(?<![-\w])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/, name);
      // Each module sits in its cascade layer: the aggregate holds the source module.
      assert.ok(all.includes(readFileSync(new URL(`../styles/${name}.css`, import.meta.url), 'utf8')), `${name}.css is in styles.css`);
    }
  });
});
