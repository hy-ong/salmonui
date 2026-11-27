// Toaster server markup:
// the server renders the empty labelled region with its live regions, so
// toasts inserted after hydration are announced. Behavior is asserted in
// tests/browser/notifications-toast.spec.ts and the queue in
// toast-queue.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { createToastQueue, Toaster, useToast, type ToasterProps } from '@salmonui/notifications/toast';

const render = (props: ToasterProps = {}) => renderToString(h(Toaster, props));
const dist = new URL('../dist/', import.meta.url);

describe('Toaster server markup', () => {
  it('an empty labelled region landmark with pre-existing polite and assertive live regions', () => {
    const out = render();
    assert.match(out, /^<section class="salmon-toaster" aria-label="Notifications" data-placement="bottomEnd" popover="manual">/);
    assert.match(out, /<div class="salmon-visually-hidden" role="status" aria-live="polite" aria-atomic="true"><\/div>/);
    assert.match(out, /<div class="salmon-visually-hidden" role="alert" aria-live="assertive" aria-atomic="true"><\/div>/);
    assert.match(out, /<ol class="salmon-toaster-list"><\/ol><\/section>$/);
  });

  it('a queue with toasts added before the server render still renders empty (add is a no-op on the server)', () => {
    const queue = createToastQueue();
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
    try {
      assert.equal(queue.add({ title: 'Leaks between requests' }), '');
    } finally {
      console.warn = warn;
    }
    assert.match(String(warnings[0]), /called on the server/);
    assert.match(render({ queue }), /<ol class="salmon-toaster-list"><\/ol>/);
  });

  it('placement is a data-placement hook (default bottomEnd)', () => {
    for (const placement of ['topStart', 'top', 'topEnd', 'bottomStart', 'bottom', 'bottomEnd'] as const) {
      assert.match(render({ placement }), new RegExp(`data-placement="${placement}"`));
    }
  });

  it('className, style, DOM props and localeText.notifications reach the region', () => {
    const out = render({ className: 'app-toasts', style: { insetBlockEnd: 48 }, id: 'toasts', dir: 'rtl', localeText: { notifications: 'Benachrichtigungen' } });
    assert.match(out, /^<section style="inset-block-end:48px" id="toasts" dir="rtl" class="salmon-toaster app-toasts" aria-label="Benachrichtigungen"/);
  });

  it('a scoped Toaster (container) renders nothing on the server; children still render with the queue context', () => {
    function Child() {
      const queue = useToast();
      return h('span', null, typeof queue.add);
    }
    const out = renderToString(h(Toaster, { container: null }, h(Child)));
    assert.equal(out, '<span>function</span>');
  });

  it('useToast() outside a Toaster throws', () => {
    function Lonely() {
      useToast();
      return null;
    }
    assert.throws(() => renderToString(h(Lonely)), /needs a <Toaster> ancestor/);
  });

  it('is render-safe client code: the entry is "use client"', () => {
    assert.match(readFileSync(new URL('toast.js', dist), 'utf8'), /^\s*['"]use client['"]/);
  });
});
