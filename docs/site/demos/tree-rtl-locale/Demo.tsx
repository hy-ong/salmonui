'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridLocaleText } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { germanLocaleText } from '../../lib/locale-de';

interface Office {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly country: string;
  readonly revenue: number;
  readonly opened: Date;
}

// Dates in UTC: the same text on the server and in the browser.
const offices: Office[] = [
  { id: 'emea', parentId: null, name: 'EMEA', country: 'DE', revenue: 0, opened: new Date(Date.UTC(2014, 2, 1)) },
  { id: 'emea-de', parentId: 'emea', name: 'Berlin', country: 'DE', revenue: 1_284_500.5, opened: new Date(Date.UTC(2014, 2, 1)) },
  { id: 'emea-de-mu', parentId: 'emea-de', name: 'Munich', country: 'DE', revenue: 642_100, opened: new Date(Date.UTC(2019, 8, 15)) },
  { id: 'emea-ae', parentId: 'emea', name: 'Dubai', country: 'AE', revenue: 918_250.75, opened: new Date(Date.UTC(2017, 0, 9)) },
  { id: 'emea-eg', parentId: 'emea', name: 'Cairo', country: 'EG', revenue: 311_900, opened: new Date(Date.UTC(2021, 5, 20)) },
  { id: 'apac', parentId: null, name: 'APAC', country: 'SG', revenue: 0, opened: new Date(Date.UTC(2016, 10, 3)) },
  { id: 'apac-sg', parentId: 'apac', name: 'Singapore', country: 'SG', revenue: 1_050_000, opened: new Date(Date.UTC(2016, 10, 3)) },
  { id: 'apac-my', parentId: 'apac', name: 'Kuala Lumpur', country: 'MY', revenue: 402_330.2, opened: new Date(Date.UTC(2020, 3, 27)) },
];

// Lookup rows: the cell stores the code and shows the name (lookup column).
const COUNTRIES = {
  en: [
    { code: 'DE', name: 'Germany' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'EG', name: 'Egypt' },
    { code: 'SG', name: 'Singapore' },
    { code: 'MY', name: 'Malaysia' },
  ],
  de: [
    { code: 'DE', name: 'Deutschland' },
    { code: 'AE', name: 'Vereinigte Arabische Emirate' },
    { code: 'EG', name: 'Ägypten' },
    { code: 'SG', name: 'Singapur' },
    { code: 'MY', name: 'Malaysia' },
  ],
};

// The tree keys of `localeText` (toggle labels, announcements, adaptive level, indent items).
const germanTreeText: DataGridLocaleText = {
  ...germanLocaleText,
  treeExpand: '{row} aufklappen',
  treeCollapse: '{row} zuklappen',
  treeExpanded: '{row} aufgeklappt, {count} Unterelemente',
  treeCollapsed: '{row} zugeklappt',
  treeLoading: 'Unterelemente werden geladen',
  treeLoadError: 'Unterelemente konnten nicht geladen werden',
  treeRetry: 'Unterelemente von {row} erneut laden',
  treeLevel: 'Ebene {level}',
  indent: 'Einrücken',
  outdent: 'Ausrücken',
};

type Lang = 'en' | 'de';

function columnsFor(lang: Lang): DataGridColumn<Office>[] {
  return [
    { field: 'name', header: lang === 'de' ? 'Standort' : 'Office', width: 220, validation: { required: true } },
    { field: 'country', header: lang === 'de' ? 'Land' : 'Country', width: 200, lookup: { data: COUNTRIES[lang], keyField: 'code', displayField: 'name' } },
    { field: 'revenue', header: lang === 'de' ? 'Umsatz' : 'Revenue', type: 'number', format: 'C2', align: 'end', width: 150, validation: { min: 0 } },
    { field: 'opened', header: lang === 'de' ? 'Eröffnet' : 'Opened', type: 'date', format: 'yMMMd', width: 140 },
    // Hidden key column: edits address rows by it.
    { field: 'id', header: 'ID', primaryKey: true, hidden: true },
  ];
}

const DIRECTION_OPTIONS = [
  { value: 'rtl', label: 'Right to left' },
  { value: 'ltr', label: 'Left to right' },
];

const LANGUAGE_OPTIONS = [
  { value: 'de', label: 'German (de-DE)' },
  { value: 'en', label: 'English (en-US)' },
];

export default function TreeRtlLocaleDemo() {
  const [dir, setDir] = useState<'ltr' | 'rtl'>('rtl');
  const [lang, setLang] = useState<Lang>('de');
  const [adaptive, setAdaptive] = useState(false);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Direction
          <Select aria-label="Direction" data={DIRECTION_OPTIONS} value={dir} onValueChange={(value) => value != null && setDir(value as 'ltr' | 'rtl')} />
        </label>
        <label>
          Language
          <Select aria-label="Language" data={LANGUAGE_OPTIONS} value={lang} onValueChange={(value) => value != null && setLang(value as Lang)} />
        </label>
        <Checkbox checked={adaptive} onCheckedChange={(checked) => setAdaptive(checked)}>
          Adaptive cards
        </Checkbox>
      </div>
      <DataGrid<Office>
        // Adaptive mode is read when the grid is created: a new grid when it changes.
        key={adaptive ? 'adaptive' : 'table'}
        aria-label="Offices"
        data={offices}
        columns={columnsFor(lang)}
        getRowId={(row) => row.id}
        tree={{ parentIdField: 'parentId' }}
        dir={dir}
        locale={lang === 'de' ? 'de-DE' : 'en-US'}
        currency="EUR"
        timeZone="UTC"
        {...(lang === 'de' ? { localeText: germanTreeText } : {})}
        {...(adaptive ? { adaptive: { target: 'both', rowLayout: 'vertical' } as const } : {})}
        editing={{ mode: 'cell' }}
        toolbar={['indent', 'outdent']}
        rowDrag
        height={420}
      />
      <p className="demo-status">
        In right-to-left mode the indentation and chevrons mirror, and ArrowLeft expands while ArrowRight collapses; Alt+Shift+ArrowLeft indents. The toolbar items, the toggle labels and the expand announcements follow the language, and numbers, currency and dates follow the locale. Edit a revenue below zero or clear an office name to see validation; the Country column edits a lookup.
      </p>
    </>
  );
}
