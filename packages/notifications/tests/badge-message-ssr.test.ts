// Badge and Message server markup: every Badge / Message behavior an SSR test can check is
// asserted on renderToString output here; the dismiss interaction, RTL
// placement and axe live in tests/browser/notifications-badge-message.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Badge, type BadgeProps } from '@salmonui/notifications/badge';
import { Message, type MessageProps } from '@salmonui/notifications/message';

const html = (element: ReactElement) => renderToString(element);
const badge = (props: BadgeProps) => html(h(Badge, props));
const message = (props: MessageProps) => html(h(Message, props));
const attr = (markup: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const dist = (file: string) => readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');
const TONES = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'] as const;
const noop = () => {};

describe('Badge markup', () => {
  it('inline mode is a span with the .salmon-badge class and the children as text', () => {
    const out = badge({ children: 'New' });
    assert.equal(out, '<span class="salmon-badge">New</span>');
    const custom = badge({ children: 'New', className: 'mine', style: { color: 'red' }, id: 'b1', title: 'hint' });
    assert.equal(attr(custom, 'class'), 'salmon-badge mine');
    assert.equal(attr(custom, 'style'), 'color:red');
    assert.equal(attr(custom, 'id'), 'b1');
    assert.equal(attr(custom, 'title'), 'hint');
  });

  it('a server component renders it without a client boundary (plain function call, no hooks, no "use client")', () => {
    // Called outside React rendering: any hook would throw here.
    const element = Badge({ children: 'Paid', tone: 'success' }) as ReactElement<{ className: string }>;
    assert.equal(element.type, 'span');
    assert.equal(element.props.className, 'salmon-badge');
    const overlay = Badge({ content: 3, children: 'Inbox' }) as ReactElement;
    assert.equal(overlay.type, 'span');
    for (const file of ['badge.js', 'badge/Badge.js']) assert.doesNotMatch(dist(file), /^\s*['"]use client['"]/);
  });

  it('every tone is a data-tone hook; unset means the neutral default', () => {
    assert.equal(attr(badge({ children: 'x' }), 'data-tone'), null);
    for (const tone of TONES) assert.equal(attr(badge({ tone, children: 'x' }), 'data-tone'), tone);
    const css = dist('badge.css');
    for (const tone of TONES.slice(1)) assert.match(css, new RegExp(`\\.salmon-badge\\[data-tone='${tone}'\\]`));
  });

  it('shape is a data-shape hook (rounded default, pill, circle)', () => {
    assert.equal(attr(badge({ children: 'x' }), 'data-shape'), null);
    for (const shape of ['rounded', 'pill', 'circle'] as const) assert.equal(attr(badge({ shape, children: '1' }), 'data-shape'), shape);
    const css = dist('badge.css');
    assert.match(css, /\.salmon-badge\[data-shape='pill'\]/);
    assert.match(css, /\.salmon-badge\[data-shape='circle'\] \{ inline-size: 20px; padding: 0; border-radius: 50%; \}/);
  });

  it('variant is a data-variant hook (soft default, solid, outline)', () => {
    assert.equal(attr(badge({ children: 'x' }), 'data-variant'), null);
    for (const variant of ['soft', 'solid', 'outline'] as const) assert.equal(attr(badge({ variant, children: 'x' }), 'data-variant'), variant);
    assert.match(dist('badge.css'), /\.salmon-badge\[data-variant='outline'\]/);
  });

  it('status dot: variant="dot" is an inline data-variant hook; the dot is an empty pseudo-element, so the text alone is announced', () => {
    const out = badge({ variant: 'dot', tone: 'success', children: 'Shipped' });
    assert.equal(out, '<span class="salmon-badge" data-tone="success" data-variant="dot">Shipped</span>');
    const css = dist('badge.css');
    assert.match(css, /\.salmon-badge\[data-variant='dot'\]::before \{[^}]*content: '';[^}]*background: var\(--salmon-badge-c\);/);
    // Logical properties only: the dot sits at the inline start under either direction.
    const rules = css.slice(css.indexOf(".salmon-badge[data-variant='dot'] {"), css.indexOf(".salmon-badge[data-shape='pill']"));
    assert.ok(rules.length > 0);
    assert.doesNotMatch(rules, /(margin|padding|inset)-(left|right)|\b(left|right):/);
    assert.match(css, /forced-colors[^]*\.salmon-badge\[data-variant='dot'\]::before \{ background: CanvasText; \}/);
  });

  it('overlay mode wraps the host; numbers above max render as "99+" with locale digits', () => {
    const out = badge({ content: 5, children: h('button', { type: 'button' }, 'Inbox') });
    assert.equal(out, '<span class="salmon-badge-host"><button type="button">Inbox</button><span class="salmon-badge">5</span></span>');
    assert.match(badge({ content: 120, max: 99, children: 'x' }), /<span class="salmon-badge">99\+<\/span>/);
    assert.match(badge({ content: 99, max: 99, children: 'x' }), /<span class="salmon-badge">99<\/span>/);
    assert.match(badge({ content: 1500, children: 'x' }), /<span class="salmon-badge">1,500<\/span>/);
    assert.match(badge({ content: 120, max: 99, locale: 'ar-EG', children: 'x' }), /<span class="salmon-badge">٩٩\+<\/span>/);
    assert.match(badge({ content: 'new', children: 'x' }), /<span class="salmon-badge">new<\/span>/);
    // Overlay props reach the host, not the indicator.
    const custom = badge({ content: 1, className: 'mine', id: 'host', children: 'x' });
    assert.equal(attr(custom, 'class'), 'salmon-badge-host mine');
    assert.equal(attr(custom, 'id'), 'host');
  });

  it('dot renders an empty indicator with its label in a visually hidden span', () => {
    const out = badge({ dot: true, label: 'Online', tone: 'success', children: 'Avatar' });
    assert.match(out, /<span class="salmon-badge" data-tone="success" data-dot="true" aria-hidden="true"><\/span>/);
    assert.match(out, /<span class="salmon-visually-hidden">Online<\/span>/);
    // badge.css carries the visually hidden class (the core a11y module); the core theme does not.
    assert.match(dist('badge.css'), /\.salmon-visually-hidden \{/);
    assert.doesNotMatch(readFileSync(new URL(import.meta.resolve('@salmonui/core/styles.css')), 'utf8'), /\.salmon-visually-hidden/);
  });

  it('overlap and placement are data hooks on the host; CSS uses logical insets and mirrors under RTL', () => {
    const out = badge({ content: 1, overlap: 'circular', placement: 'bottomStart', children: 'x' });
    assert.equal(attr(out, 'data-overlap'), 'circular');
    assert.equal(attr(out, 'data-placement'), 'bottomStart');
    for (const placement of ['topEnd', 'topStart', 'bottomEnd', 'bottomStart'] as const) assert.equal(attr(badge({ content: 1, placement, children: 'x' }), 'data-placement'), placement);
    const css = dist('badge.css');
    assert.match(css, /inset-inline-end: var\(--salmon-badge-o\)/);
    assert.match(css, /--salmon-badge-x: calc\(50% \* var\(--salmon-dir, 1\)\)/);
    assert.doesNotMatch(css, /:dir\(/);
    assert.match(css, /\[data-overlap='circular'\] > \.salmon-badge \{ --salmon-badge-o: 14%; \}/);
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right):/);
  });

  it('render returns another element (a link) with every computed prop', () => {
    const out = badge({ tone: 'info', className: 'mine', children: 'Docs', render: (props) => h('a', { ...props, href: '/docs' }) });
    assert.equal(out, '<a class="salmon-badge mine" data-tone="info" href="/docs">Docs</a>');
  });

  it('composes inline inside a Button-like host and in overlay mode around any element', () => {
    const inline = html(h('button', { type: 'button' }, 'Inbox ', h(Badge, { tone: 'danger', children: '3' })));
    assert.equal(inline, '<button type="button">Inbox <span class="salmon-badge" data-tone="danger">3</span></button>');
    const avatar = badge({ content: 2, overlap: 'circular', children: h('span', { className: 'avatar' }, 'AL') });
    assert.match(avatar, /^<span class="salmon-badge-host" data-overlap="circular"><span class="avatar">AL<\/span><span class="salmon-badge">2<\/span><\/span>$/);
  });

  it('label replaces the count for assistive technology; invisible and empty content hide and silence the badge', () => {
    const labelled = badge({ content: 5, label: '5 unread', children: 'Inbox' });
    assert.match(labelled, /<span class="salmon-badge" aria-hidden="true">5<\/span><span class="salmon-visually-hidden">5 unread<\/span>/);
    const invisible = badge({ content: 5, label: '5 unread', invisible: true, children: 'Inbox' });
    assert.match(invisible, /<span class="salmon-badge" hidden="" aria-hidden="true">5<\/span><\/span>$/);
    assert.doesNotMatch(invisible, /5 unread/);
    for (const content of [null, undefined, false, '']) assert.match(badge({ content, children: 'x' }), /<span class="salmon-badge" hidden="">/);
    assert.match(badge({ content: 0, children: 'x' }), /<span class="salmon-badge">0<\/span>/);
    assert.match(dist('badge.css'), /\.salmon-badge\[hidden\] \{ display: none; \}/);
  });
});

describe('Message markup', () => {
  it('children are the content, title a heading line above it; a server component renders it as a plain call', () => {
    const out = message({ children: 'Saved.' });
    assert.match(out, /^<div class="salmon-message"><span class="salmon-message-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="[^"]+"><\/path><\/svg><\/span><div class="salmon-message-body">Saved.<\/div><\/div>$/);
    const titled = message({ title: 'Heads up', children: h('p', null, 'Body') });
    assert.match(titled, /<div class="salmon-message-body"><div class="salmon-message-title">Heads up<\/div><p>Body<\/p><\/div>/);
    // No hooks in the body: a direct call outside React rendering works.
    const element = Message({ children: 'x', onDismiss: noop }) as ReactElement<{ className: string }>;
    assert.equal(element.type, 'div');
    assert.equal(element.props.className, 'salmon-message');
    assert.doesNotMatch(dist('message.js'), /^\s*['"]use client['"]/);
    assert.doesNotMatch(dist('message/Message.js'), /^\s*['"]use client['"]/);
    assert.match(dist('message/Dismiss.js'), /^\s*['"]use client['"]/);
  });

  it('tone is a data-tone hook with a built-in icon per tone (neutral when unset)', () => {
    assert.equal(attr(message({ children: 'x' }), 'data-tone'), null);
    const paths = new Set<string | null>();
    for (const tone of TONES) {
      const out = message({ tone, children: 'x' });
      assert.equal(attr(out, 'data-tone'), tone);
      paths.add(attr(out, 'd'));
    }
    assert.equal(paths.size, 4, 'success, warning, danger and the info glyph (neutral, primary, info)');
  });

  it('variant is a data-variant hook (soft default, outline, solid)', () => {
    assert.equal(attr(message({ children: 'x' }), 'data-variant'), null);
    for (const variant of ['soft', 'outline', 'solid'] as const) assert.equal(attr(message({ variant, children: 'x' }), 'data-variant'), variant);
    const css = dist('message.css');
    assert.match(css, /\.salmon-message\[data-variant='outline'\]/);
    assert.match(css, /\.salmon-message\[data-variant='solid'\]/);
  });

  it('icon replaces the built-in icon (decorative); false hides it', () => {
    assert.match(message({ icon: h('i', { className: 'custom' }), children: 'x' }), /<span class="salmon-message-icon" aria-hidden="true"><i class="custom"><\/i><\/span>/);
    assert.doesNotMatch(message({ icon: false, children: 'x' }), /salmon-message-icon/);
  });

  it('onDismiss shows a native close button named by localeText.dismiss (default "Dismiss"); action renders after the content', () => {
    assert.doesNotMatch(message({ children: 'x' }), /<button/);
    const out = message({ onDismiss: noop, action: h('button', { type: 'button' }, 'Undo'), children: 'x' });
    assert.match(out, /<div class="salmon-message-action"><button type="button">Undo<\/button><\/div><button type="button" class="salmon-message-dismiss" aria-label="Dismiss"><svg/);
    assert.match(message({ onDismiss: noop, localeText: { dismiss: 'Schließen' }, children: 'x' }), /aria-label="Schließen"/);
  });

  it('hidden is the native attribute; with live the region stays and the message leaves it', () => {
    assert.match(message({ hidden: true, children: 'x' }), /^<div class="salmon-message" hidden="">/);
    assert.match(dist('message.css'), /\.salmon-message\[hidden\] \{ display: none; \}/);
    assert.equal(message({ hidden: true, live: 'polite', children: 'x' }), '<div class="salmon-message-live" role="status" aria-live="polite" aria-atomic="true"></div>');
  });

  it('no live role by default; polite is role="status", assertive role="alert", the region wraps the message', () => {
    const plain = message({ children: 'x' });
    assert.doesNotMatch(plain, /role=|aria-live/);
    assert.match(message({ live: 'polite', children: 'x' }), /^<div class="salmon-message-live" role="status" aria-live="polite" aria-atomic="true"><div class="salmon-message">/);
    assert.match(message({ live: 'assertive', children: 'x' }), /^<div class="salmon-message-live" role="alert" aria-live="assertive" aria-atomic="true"><div class="salmon-message">/);
  });

  it('align is a data-align hook with logical text alignment', () => {
    for (const align of ['start', 'center', 'end'] as const) assert.equal(attr(message({ align, children: 'x' }), 'data-align'), align);
    const css = dist('message.css');
    assert.match(css, /\[data-align='center'\] \.salmon-message-body \{ text-align: center; \}/);
    assert.match(css, /\[data-align='end'\] \.salmon-message-body \{ text-align: end; \}/);
  });

  it('className / style / DOM props pass through; the stylesheet is logical so dir is inherited', () => {
    const out = message({ className: 'mine', style: { maxInlineSize: 400 }, id: 'm1', 'aria-label': 'Status', children: 'x' });
    assert.equal(attr(out, 'class'), 'salmon-message mine');
    assert.equal(attr(out, 'style'), 'max-inline-size:400px');
    assert.equal(attr(out, 'id'), 'm1');
    assert.equal(attr(out, 'aria-label'), 'Status');
    assert.doesNotMatch(dist('message.css'), /\b(left|right|margin-left|margin-right|padding-left|padding-right|text-align: (left|right)):/);
    assert.match(dist('message.css'), /margin-inline-end: -4px/);
  });
});

describe('Notifications styles.css (Badge, Message)', () => {
  it('styles.css carries both stylesheets', () => {
    const all = dist('styles.css');
    assert.ok(all.includes(readFileSync(new URL('../styles/badge.css', import.meta.url), 'utf8')));
    assert.ok(all.includes(readFileSync(new URL('../styles/message.css', import.meta.url), 'utf8')));
  });
});
