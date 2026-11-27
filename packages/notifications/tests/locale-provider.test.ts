import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Message } from '@salmonui/notifications/message';
import { Toaster } from '@salmonui/notifications/toast';

// Every notifications family reads the nearest LocaleProvider: the zh-TW pack reaches the markup, and a component's own
// `localeText` still wins over the provider. Message's text is read by its
// close button (the client island); Badge, Progress and Spinner are server
// components and keep their own props.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('notifications families under LocaleProvider', () => {
  it('toaster', () => {
    assert.match(zh(h(Toaster)), /aria-label="通知"/);
    assert.match(zh(h(Toaster, { localeText: { notifications: 'Alerts' } })), /aria-label="Alerts"/);
  });

  it('message: the close button island', () => {
    assert.match(zh(h(Message, { onDismiss: () => {} }, 'Saved')), /aria-label="關閉"/);
    assert.match(zh(h(Message, { onDismiss: () => {}, localeText: { dismiss: 'Hide' } }, 'Saved')), /aria-label="Hide"/);
    assert.match(renderToString(h(Message, { onDismiss: () => {} }, 'Saved')), /aria-label="Dismiss"/);
  });
});
