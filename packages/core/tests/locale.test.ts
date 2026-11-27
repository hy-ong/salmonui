import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider, useLocale } from '@salmonui/core/locale';
import { zhTW, pager, locale as zhLocale } from '@salmonui/core/locale/zh-TW';
import { useLocale as useOwnLocale, useLocaleText } from '../dist/internal/locale.js';

type Text = { readonly a?: string; readonly b?: string };

/** Renders `read` inside the given tree and returns what it captured. */
function capture<T>(wrap: (child: ReactNode) => ReactNode, read: () => T): T {
  let out: T | undefined;
  function Probe(): null {
    out = read();
    return null;
  }
  renderToString(wrap(h(Probe)));
  return out as T;
}

describe('LocaleProvider', () => {
  it('returns the own props unchanged without a provider', () => {
    const own: Text = { a: 'own' };
    assert.equal(capture((c) => c, () => useLocaleText('x', own)), own);
    assert.equal(capture((c) => c, () => useLocaleText<Text>('x', undefined)), undefined);
    assert.equal(capture((c) => c, () => useOwnLocale('de-DE')), 'de-DE');
    assert.equal(capture((c) => c, () => useOwnLocale(undefined)), undefined);
    assert.equal(capture((c) => c, () => useLocale()), undefined);
  });

  it('merges the family entry under the own localeText, own keys winning', () => {
    const catalog = { x: { a: 'provider a', b: 'provider b' } };
    const wrap = (c: ReactNode) => h(LocaleProvider, { locale: 'zh-TW', localeText: catalog }, c);
    assert.deepEqual(capture(wrap, () => useLocaleText<Text>('x', { a: 'own a' })), { a: 'own a', b: 'provider b' });
    assert.equal(capture(wrap, () => useLocaleText<Text>('x', undefined)), catalog.x);
    const own: Text = { a: 'own' };
    assert.equal(capture(wrap, () => useLocaleText('other', own)), own);
    assert.equal(capture(wrap, () => useOwnLocale(undefined)), 'zh-TW');
    assert.equal(capture(wrap, () => useOwnLocale('ja-JP')), 'ja-JP');
    assert.equal(capture(wrap, () => useLocale()), 'zh-TW');
  });

  it('keeps the merged object identity while the own localeText keeps its identity', () => {
    const own: Text = { a: 'own' };
    const catalog = { x: { b: 'provider' } };
    const seen: unknown[] = [];
    function Probe(): null {
      seen.push(useLocaleText('x', own), useLocaleText('x', own));
      return null;
    }
    renderToString(h(LocaleProvider, { localeText: catalog }, h(Probe), h(Probe)));
    assert.equal(seen.length, 4);
    assert.ok(seen.every((v) => v === seen[0]));
    assert.notEqual(seen[0], own);
  });

  it('merges nested providers per family, key by key, inner winning', () => {
    const wrap = (c: ReactNode) =>
      h(LocaleProvider, { locale: 'zh-TW', localeText: { x: { a: 'outer a', b: 'outer b' }, y: { a: 'outer y' } } }, h(LocaleProvider, { localeText: { x: { a: 'inner a' } } }, c));
    assert.deepEqual(capture(wrap, () => useLocaleText<Text>('x', undefined)), { a: 'inner a', b: 'outer b' });
    assert.deepEqual(capture(wrap, () => useLocaleText<Text>('y', undefined)), { a: 'outer y' });
    assert.equal(capture(wrap, () => useLocale()), 'zh-TW');
    const inner = (c: ReactNode) => h(LocaleProvider, { locale: 'zh-TW' }, h(LocaleProvider, { locale: 'en-GB' }, c));
    assert.equal(capture(inner, () => useLocale()), 'en-GB');
  });

  it('renders no element of its own', () => {
    assert.equal(renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, 'text')), 'text');
  });

  it('the zh-TW pack is frozen data with named family exports', () => {
    assert.equal(zhLocale, 'zh-TW');
    assert.ok(Object.isFrozen(zhTW));
    assert.equal(zhTW.pager, pager);
    assert.ok(Object.isFrozen(pager));
  });
});
