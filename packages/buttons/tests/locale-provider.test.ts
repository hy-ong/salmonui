import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Menu, MenuItem, Menubar, MenubarItem, MenubarMenu } from '@salmonui/buttons/menu';
import { Tag, TagGroup } from '@salmonui/buttons/tag-group';

// Every buttons family reads the nearest LocaleProvider:
// the zh-TW pack reaches the markup, and a component's own
// `localeText` still wins over the provider. ContextMenu's label is on its
// popup, which renders only after a right-click.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('buttons families under LocaleProvider', () => {
  it('menubar', () => {
    const bar = (props: Record<string, unknown>) => h(Menubar, { 'aria-label': 'Editor', overflow: 'scroll', ...props }, h(MenubarMenu, { value: 'file', label: 'File' }, h(Menu, null, h(MenuItem, { id: 'new' }, 'New'))), h(MenubarItem, { id: 'save' }, 'Save'));
    const html = zh(bar({}));
    assert.match(html, /title="向後捲動"/);
    assert.match(html, /title="向前捲動"/);
    assert.match(zh(bar({ localeText: { scrollForward: 'Next' } })), /title="Next"/);
  });

  it('tagGroup: the function-valued remove label', () => {
    const tags = (props: Record<string, unknown>) => h(TagGroup, { 'aria-label': 'Labels', onRemove: () => {}, ...props }, h(Tag, { value: 'a' }, 'Design'));
    assert.match(zh(tags({})), /aria-label="移除 Design"/);
    assert.match(zh(tags({ localeText: { remove: (label: string) => `Drop ${label}` } })), /aria-label="Drop Design"/);
  });
});
