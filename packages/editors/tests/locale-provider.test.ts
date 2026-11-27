// LocaleProvider: InlineEdit, MarkdownEditor and ImageEditor read the
// provider's catalog entry under their own `localeText` (own keys win).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { ImageEditor } from '@salmonui/editors/image-editor';
import { InlineEdit } from '@salmonui/editors/inline-edit';
import { MarkdownEditor } from '@salmonui/editors/markdown-editor';

const zh = (child: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, child));

describe('editors locale provider', () => {
  it('InlineEdit shows the provider text; its own localeText wins', () => {
    assert.match(zh(h(InlineEdit, {})), />空白<\/button>/);
    assert.match(zh(h(InlineEdit, { localeText: { empty: 'Mine' } })), />Mine<\/button>/);
  });

  it('MarkdownEditor shows the provider text; its own localeText wins', () => {
    const html = zh(h(MarkdownEditor, {}));
    assert.match(html, /aria-label="Markdown 原始碼"/);
    assert.match(html, /aria-label="粗體"/);
    const own = zh(h(MarkdownEditor, { localeText: { bold: 'Mine' } }));
    assert.match(own, /aria-label="Mine"/);
    assert.match(own, /aria-label="Markdown 原始碼"/);
  });

  it('ImageEditor shows the provider text; its own localeText wins', () => {
    const html = zh(h(ImageEditor, {}));
    assert.match(html, /aria-label="圖片編輯"/);
    assert.match(html, /aria-label="編輯中的圖片"/);
    const own = zh(h(ImageEditor, { localeText: { toolbar: 'Mine' } }));
    assert.match(own, /aria-label="Mine"/);
    assert.match(own, /aria-label="編輯中的圖片"/);
  });
});
