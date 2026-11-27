// LocaleProvider: Conversation reads the provider's catalog entry under its
// own `localeText` (own keys win) and the provider's `locale`. InlineAssist
// renders nothing on the server and `useTextSuggest` writes its hint from a
// layout effect, so those two are covered by the locale coverage test and
// the browser tests only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Conversation } from '@salmonui/chat/conversation';

const zh = (child: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, child));
const messages = [{ id: 'm1', author: 'u2', text: 'Hello', createdAt: '2026-01-01T09:05:00Z' }];

describe('chat locale provider', () => {
  it('Conversation shows the provider text; its own localeText wins', () => {
    const html = zh(h(Conversation, { messages, timeZone: 'UTC' }));
    assert.match(html, /role="feed"[^>]*aria-label="訊息"|aria-label="訊息"[^>]*role="feed"/);
    const own = zh(h(Conversation, { messages, timeZone: 'UTC', localeText: { feedLabel: 'Mine' } }));
    assert.match(own, /aria-label="Mine"/);
  });

  it('Conversation formats with the provider locale unless its own locale is set', () => {
    const date = (html: string): string | undefined => /<time[^>]*>([^<]*)</.exec(html)?.[1];
    const zhHtml = zh(h(Conversation, { messages, timeZone: 'UTC' }));
    const enHtml = zh(h(Conversation, { messages, timeZone: 'UTC', locale: 'en-US' }));
    assert.notEqual(date(zhHtml), undefined);
    assert.notEqual(date(zhHtml), date(enHtml));
    assert.equal(date(enHtml), date(renderToString(h(Conversation, { messages, timeZone: 'UTC' }))));
  });
});
