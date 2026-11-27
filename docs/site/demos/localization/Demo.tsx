'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn, type DataGridLocaleText, type DataGridSorting } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { createOrders, type Order } from '../../lib/fixtures';
import { germanLocaleText } from '../../lib/locale-de';

const orders = createOrders(500, 31);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 130 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 140 },
  { field: 'quantity', header: 'Quantity', type: 'number', format: 'N0', align: 'end', width: 140 },
  { field: 'unitPrice', header: 'Unit price', type: 'number', format: 'N2', align: 'end', width: 145 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 150 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

// A few Arabic overrides; every other string falls back to English.
const arabicLocaleText: DataGridLocaleText = {
  noRows: 'لا توجد سجلات',
  search: 'بحث',
  filter: 'تصفية',
  sortAscending: 'ترتيب تصاعدي',
  sortDescending: 'ترتيب تنازلي',
  clearSort: 'إزالة الترتيب',
  pageOf: 'الصفحة {page} من {pageCount}',
  pagerInfo: 'الصفحة {page} من {pageCount}',
  pagerItems: { one: '(سجل واحد)', other: '({count} سجل)' },
  pageSize: 'صفوف لكل صفحة',
  columnChooser: 'الأعمدة',
};

const LANGUAGES = {
  en: { label: 'English (en-US, USD)', locale: 'en-US', currency: 'USD', localeText: undefined },
  de: { label: 'Deutsch (de-DE, EUR)', locale: 'de-DE', currency: 'EUR', localeText: germanLocaleText },
  ar: { label: 'العربية (ar-EG, EGP, right-to-left)', locale: 'ar-EG', currency: 'EGP', localeText: arabicLocaleText },
} as const;
type Language = keyof typeof LANGUAGES;

const LANGUAGE_ITEMS = (Object.keys(LANGUAGES) as Language[]).map((key) => ({ value: key, label: LANGUAGES[key].label }));

// Constants: the option props are reactive, a new object each render would reset them.
const sorting: DataGridSorting = { sortBy: [{ field: 'amount', direction: 'desc' }] };
const filtering = { ui: 'menu' } as const;
const paging = { pageSize: 10, pageSizeOptions: [10, 25, 50] } as const;
const toolbar = ['search', 'columnChooser'] as const;

export default function LocalizationDemo() {
  const [language, setLanguage] = useState<Language>('en');
  const settings = LANGUAGES[language];
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Language{' '}
          <Select aria-label="Language" data={LANGUAGE_ITEMS} value={language} onValueChange={(value) => value != null && setLanguage(value as Language)} />
        </label>
      </div>
      <DataGrid<Order>
        aria-label="Localized orders"
        data={orders}
        columns={columns}
        // All reactive: switching updates formats, labels and direction in place.
        locale={settings.locale}
        currency={settings.currency}
        timeZone="UTC"
        {...(settings.localeText ? { localeText: settings.localeText } : {})}
        // 'auto' follows the locale script: ar-EG renders right to left.
        dir="auto"
        sorting={sorting}
        filtering={filtering}
        paging={paging}
        search
        columnChooser
        columnMenu
        toolbar={toolbar}
        height={360}
      />
      <p className="demo-status">
        Sort, filter or change the page, then switch the language: the grid is not remounted, so it keeps its sort, filters and page while labels, number, currency and date formats and the direction change.
      </p>
    </>
  );
}
