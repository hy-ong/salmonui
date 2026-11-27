// LocaleProvider: RichTextEditor and BlockEditor read the provider's
// catalog entry under their own `localeText` (own keys win).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { BlockEditor, RichTextEditor } from '@salmonui/rich-text';

const zh = (child: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, child));

describe('rich-text locale provider', () => {
  it('RichTextEditor shows the provider text; its own localeText wins', () => {
    const html = zh(h(RichTextEditor, { toolbar: ['bold', 'italic'] }));
    assert.match(html, /aria-label="格式化文字編輯器"/);
    assert.match(html, /aria-label="格式設定"/);
    const own = zh(h(RichTextEditor, { toolbar: ['bold'], localeText: { content: 'Mine' } }));
    assert.match(own, /aria-label="Mine"/);
    assert.match(own, /aria-label="格式設定"/);
  });

  it('BlockEditor shows the provider text; its own localeText wins', () => {
    assert.match(zh(h(BlockEditor, {})), /aria-label="編輯器"/);
    assert.match(zh(h(BlockEditor, { localeText: { editor: 'Mine' } })), /aria-label="Mine"/);
  });
});
