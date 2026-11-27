// LocaleProvider: PdfViewer reads the provider's catalog entry under its
// own `localeText` (own keys win).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { PdfViewer } from '@salmonui/pdf-viewer';

const zh = (child: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, child));
const props = { src: '/doc.pdf', pageSizes: { width: 612, height: 792 }, pageCount: 2, zoom: 1 };

describe('pdf-viewer locale provider', () => {
  it('PdfViewer shows the provider text; its own localeText wins', () => {
    const html = zh(h(PdfViewer, props));
    assert.match(html, /aria-label="PDF 工具"/);
    assert.match(html, /aria-label="第 1 頁，共 2 頁"/);
    const own = zh(h(PdfViewer, { ...props, localeText: { toolbar: 'Mine' } }));
    assert.match(own, /aria-label="Mine"/);
    assert.match(own, /aria-label="第 1 頁，共 2 頁"/);
  });
});
