import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { DashboardLayout, DashboardLayoutPanel } from '@salmonui/layout/dashboard-layout';
import { Splitter, SplitterPane } from '@salmonui/layout/splitter';

// The layout families read the nearest LocaleProvider; a component's own `localeText` still wins.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('layout families under LocaleProvider', () => {
  it('splitter', () => {
    const split = (props: Record<string, unknown>) => h(Splitter, props, h(SplitterPane, { id: 'a' }, 'A'), h(SplitterPane, { id: 'b' }, 'B'));
    assert.match(zh(split({})), /aria-label="調整大小"/);
    assert.match(zh(split({ localeText: { resizePane: 'Drag' } })), /aria-label="Drag"/);
  });

  it('dashboardLayout', () => {
    const board = (props: Record<string, unknown>) => h(DashboardLayout, props, h(DashboardLayoutPanel, { id: 'a', header: 'Sales' }, 'Body'));
    const html = zh(board({}));
    assert.match(html, /aria-roledescription="面板"/);
    assert.match(html, /按 Enter 或空白鍵拿起面板/);
    assert.match(zh(board({ localeText: { panel: 'tile' } })), /aria-roledescription="tile"/);
  });
});
