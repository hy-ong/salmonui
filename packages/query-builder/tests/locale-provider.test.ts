// LocaleProvider: QueryBuilder reads the provider's catalog entry under its
// own `localeText` (own keys win).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { QueryBuilder } from '@salmonui/query-builder';

const zh = (child: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, child));
const fields = [{ name: 'name', label: 'Name', type: 'string' }];
const defaultValue = { logic: 'and', filters: [{ field: 'name', operator: 'equal', value: 'v' }] };

describe('query-builder locale provider', () => {
  it('QueryBuilder shows the provider text; its own localeText wins', () => {
    const html = zh(h(QueryBuilder, { fields, defaultValue } as never));
    assert.match(html, /新增規則/);
    assert.match(html, /等於/);
    const own = zh(h(QueryBuilder, { fields, defaultValue, localeText: { addCondition: 'Mine' } } as never));
    assert.match(own, /Mine/);
    assert.doesNotMatch(own, /新增規則/);
    assert.match(own, /新增群組/);
  });
});
