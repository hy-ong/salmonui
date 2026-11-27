import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Combobox, type ComboboxProps } from '@salmonui/dropdowns/combobox';
import { Listbox, type ListboxProps } from '@salmonui/dropdowns/listbox';
import { Mention } from '@salmonui/dropdowns/mention';
import { Select, type SelectProps } from '@salmonui/dropdowns/select';
import { TreeSelect, type TreeSelectProps } from '@salmonui/dropdowns/tree-select';

// Every dropdowns family reads the nearest LocaleProvider: the zh-TW pack reaches the markup, and a component's own
// `localeText` still wins over the provider. Mention's text is in its popup
// (opened by typing), so it is only checked to render under the provider.

interface Fruit {
  readonly value: string;
  readonly label: string;
}
const FRUITS: Fruit[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'kiwi', label: 'Kiwi' },
];

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));
const select = (props: Partial<SelectProps<Fruit>>) => h(Select as (p: SelectProps<Fruit>) => ReactElement, { data: FRUITS, 'aria-label': 'F', ...props } as SelectProps<Fruit>);
const combobox = (props: Partial<ComboboxProps<Fruit>>) => h(Combobox as (p: ComboboxProps<Fruit>) => ReactElement, { data: FRUITS, 'aria-label': 'F', ...props } as ComboboxProps<Fruit>);

describe('dropdowns families under LocaleProvider', () => {
  it('select: provider text, own localeText wins', () => {
    assert.match(zh(select({ clearable: true, defaultValue: 'kiwi' })), /class="salmon-select-clear" aria-label="清除"/);
    assert.match(zh(select({ multiple: true, valueDisplay: 'count', defaultValue: ['apple', 'kiwi'] } as Partial<SelectProps<Fruit>>)), />已選取 2 項</);
    assert.match(zh(select({ clearable: true, defaultValue: 'kiwi', localeText: { clear: 'Wipe' } })), /aria-label="Wipe"/);
  });

  it('combobox', () => {
    assert.match(zh(combobox({})), /aria-label="顯示選項"/);
    assert.match(zh(combobox({ localeText: { toggle: 'Open' } })), /aria-label="Open"/);
  });

  it('treeSelect', () => {
    const tree = (props: Record<string, unknown>) => h(TreeSelect as (p: TreeSelectProps<Fruit>) => ReactNode, { data: FRUITS, 'aria-label': 'F', defaultValue: 'apple', clearable: true, ...props } as TreeSelectProps<Fruit>);
    assert.match(zh(tree({})), /aria-label="清除"/);
    assert.match(zh(tree({ localeText: { clear: 'Empty' } })), /aria-label="Empty"/);
  });

  it('listbox', () => {
    const list = (props: Record<string, unknown>) => h(Listbox as (p: ListboxProps<Fruit>) => ReactNode, { data: [], 'aria-label': 'None', ...props } as ListboxProps<Fruit>);
    assert.match(zh(list({})), /class="salmon-listbox-empty">沒有項目</);
    assert.match(zh(list({ localeText: { noData: 'Nothing' } })), />Nothing</);
  });

  it('mention renders under the provider', () => {
    assert.match(zh(h(Mention, { data: ['Ann'] }, h('textarea', { 'aria-label': 'Comment' }))), /aria-label="Comment"/);
  });
});
