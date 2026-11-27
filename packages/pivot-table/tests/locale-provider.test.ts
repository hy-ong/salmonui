import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { PivotController, PivotFieldList, PivotTable, type PivotModelInput } from '@salmonui/pivot-table';

// LocaleProvider: the pivot parts read the
// provider's `pivotTable` catalog under their own `localeText`.

interface Sale {
  region: string;
  year: number;
  amount: number;
}

const MODEL: PivotModelInput = { rows: [{ field: 'region' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'sum' }] };
const data: Sale[] = [
  { region: 'Asia', year: 2024, amount: 10 },
  { region: 'Europe', year: 2025, amount: 20 },
];

const inProvider = (element: ReactElement): string => renderToString(createElement(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, element));

describe('PivotTable in a LocaleProvider', () => {
  it('renders the zh-TW catalog in the table and the field list', () => {
    const pivot = new PivotController<Sale>({ data, defaultPivotModel: MODEL });
    const html = inProvider(createElement('div', null, createElement(PivotTable<Sale>, { pivot, toolbar: ['expandAll'] }), createElement(PivotFieldList<Sale>, { pivot })));
    assert.match(html, /aria-label="樞紐分析表"/);
    assert.match(html, /樞紐分析表工具列/);
    assert.match(html, /搜尋欄位/);
  });

  it('the own localeText wins over the provider', () => {
    const pivot = new PivotController<Sale>({ data, defaultPivotModel: MODEL });
    const html = inProvider(createElement(PivotTable<Sale>, { pivot, toolbar: ['expandAll'], localeText: { pivotTable: 'Sales pivot' } }));
    assert.match(html, /aria-label="Sales pivot"/);
    assert.match(html, /樞紐分析表工具列/);
    assert.doesNotMatch(renderToString(createElement(PivotTable<Sale>, { pivot })), /樞紐分析表/);
  });
});
