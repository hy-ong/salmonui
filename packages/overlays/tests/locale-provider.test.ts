import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { AlertDialog, Dialog } from '@salmonui/overlays/dialog';
import { Drawer } from '@salmonui/overlays/drawer';

// Every overlays family reads the nearest LocaleProvider: the zh-TW pack reaches the markup, and a component's own
// `localeText` still wins over the provider. Dialog and Drawer share the
// `dialog` family of the dialog core.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('overlays families under LocaleProvider', () => {
  it('dialog and drawer: the close button', () => {
    assert.match(zh(h(Dialog, { keepMounted: true, closeButton: true, title: 'T' })), /aria-label="關閉"/);
    assert.match(zh(h(Drawer, { keepMounted: true, closeButton: true, title: 'T' })), /aria-label="關閉"/);
    assert.match(zh(h(Dialog, { keepMounted: true, closeButton: true, title: 'T', localeText: { close: 'Fermer' } })), /aria-label="Fermer"/);
  });

  it('alertDialog', () => {
    const html = zh(h(AlertDialog, { defaultOpen: true, title: 'Delete?', onCancel: () => {} }));
    assert.match(html, />確定</);
    assert.match(html, />取消</);
    assert.match(zh(h(AlertDialog, { defaultOpen: true, title: 'Delete?', localeText: { ok: 'Yes' } })), />Yes</);
  });
});
