'use client';

import { useMemo, useState } from 'react';
import { formatValue } from '@salmonui/core/format';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';

interface Sale {
  readonly id: number;
  readonly amount: number;
  readonly share: number;
  readonly units: number;
  readonly placed: Date;
}

const sales: Sale[] = [
  { id: 1, amount: 1234567.891, share: 0.1234, units: 7, placed: new Date(Date.UTC(2026, 2, 5, 14, 30)) },
  { id: 2, amount: 98.5, share: 0.5, units: 42, placed: new Date(Date.UTC(2026, 10, 21, 9, 5)) },
  { id: 3, amount: 0.25, share: 1, units: 315, placed: new Date(Date.UTC(2026, 0, 1, 0, 0)) },
];

const locales = ['en-US', 'de-DE', 'fr-FR'] as const;
const LOCALE_OPTIONS = locales.map((l) => ({ value: l, label: l }));

export default function FormatPatternsDemo() {
  const [locale, setLocale] = useState<(typeof locales)[number]>('en-US');
  // Only the template column reads `locale`; the memo keeps the definitions stable between renders.
  const columns = useMemo<DataGridColumn<Sale>[]>(() => [
    { field: 'id', header: '#', type: 'number', primaryKey: true, width: 60 },
    // Custom number patterns: grouping, fixed and optional decimals, a quoted literal, a percent.
    { id: 'grouped', field: 'amount', header: '#,##0.00', type: 'number', format: '#,##0.00', align: 'end', width: 150 },
    { id: 'optional', field: 'amount', header: '0.0##', type: 'number', format: '0.0##', align: 'end', width: 130 },
    { id: 'literal', field: 'amount', header: "'USD' #,##0", type: 'number', format: "'USD' #,##0", align: 'end', width: 150 },
    { field: 'share', header: '0.0%', type: 'number', format: '0.0%', align: 'end', width: 90 },
    { field: 'units', header: '000', type: 'number', format: '000', align: 'end', width: 80 },
    // Custom date patterns, a quoted literal, and a skeleton object.
    { id: 'iso', field: 'placed', header: 'yyyy-MM-dd HH:mm', type: 'datetime', format: 'yyyy-MM-dd HH:mm', width: 190 },
    { id: 'long', field: 'placed', header: "EEE d MMM y 'at' h:mm a", type: 'datetime', format: "EEE d MMM y 'at' h:mm a", width: 220 },
    { id: 'skeleton', field: 'placed', header: "{ skeleton: 'yMMMEd' }", type: 'datetime', format: { type: 'date', skeleton: 'yMMMEd' }, width: 170 },
    {
      id: 'template',
      field: 'amount',
      header: 'formatValue in a template',
      width: 220,
      // `formatValue` formats any value with the grid's format vocabulary, here in another currency.
      renderCell: ({ value }) => (
        <span>
          {formatValue(value, 'C0', { locale, currency: 'EUR' })} / {formatValue(value, 'C0', { locale, currency: 'JPY' })}
        </span>
      ),
    },
  ], [locale]);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Locale{' '}
          <Select aria-label="Locale" data={LOCALE_OPTIONS} value={locale} onValueChange={(value) => value != null && setLocale(value as (typeof locales)[number])} />
        </label>
      </div>
      <DataGrid<Sale>
        aria-label="Custom number and date format patterns"
        data={sales}
        columns={columns}
        height="auto"
        selection={false}
        locale={locale}
        currency="USD"
        timeZone="UTC"
      />
    </>
  );
}
