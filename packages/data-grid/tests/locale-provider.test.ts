import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { createPagingModule } from '@salmonui/data-grid/engine';
import { DataGrid, type DataGridProps } from '@salmonui/data-grid';
import { people, personColumns, type Person } from './fixtures.ts';

// LocaleProvider: the grid reads the provider's
// `dataGrid` catalog and locale under its own `localeText` / `locale`.

const grid = (props: Partial<DataGridProps<Person>> = {}): ReactElement =>
  createElement(DataGrid as (p: DataGridProps<Person>) => ReactElement, {
    'aria-label': 'People',
    data: people(30),
    columns: [{ type: 'selection' }, ...personColumns],
    modules: [createPagingModule<Person>()],
    paging: { pageSize: 10 },
    timeZone: 'UTC',
    ...props,
  } as DataGridProps<Person>);

const inProvider = (element: ReactElement): string => renderToString(createElement(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, element));

describe('DataGrid in a LocaleProvider', () => {
  it('renders the zh-TW catalog', () => {
    const html = inProvider(grid());
    assert.match(html, /aria-label="選取所有列"/);
    assert.match(html, /aria-label="第一頁"/);
    assert.match(html, /第 1 頁，共 3 頁/);
  });

  it('keeps English without a provider', () => {
    const html = renderToString(grid());
    assert.match(html, /aria-label="Select all rows"/);
  });

  it('the grid own localeText wins over the provider', () => {
    const html = inProvider(grid({ localeText: { selectAllRows: 'Pick everything' } }));
    assert.match(html, /aria-label="Pick everything"/);
    assert.match(html, /aria-label="第一頁"/);
  });
});
