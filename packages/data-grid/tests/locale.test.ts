import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_LOCALE_TEXT } from '@salmonui/data-grid/engine/locale';
import { createPagingModule } from '@salmonui/data-grid/engine';
import { DATA_GRID_DEFAULT_LOCALE_TEXT, type DataGridColumn } from '@salmonui/data-grid';
import { germanLocaleText } from '../../../docs/site/lib/locale-de.ts';
import { count, personColumns, render, type Person } from './fixtures.ts';

// Globalization in the React layer: the `localeText` catalog, `locale`,
// `dir`, lookup columns, and `persistState` in the server HTML. Client
// behavior is covered by tests/browser/globalization.spec.ts.

describe('localeText catalog', () => {
  it('the German sample catalog translates every built-in key', () => {
    const missing = Object.keys(DEFAULT_LOCALE_TEXT).filter((k) => !(k in germanLocaleText));
    assert.deepEqual(missing, []);
    assert.equal(DATA_GRID_DEFAULT_LOCALE_TEXT, DEFAULT_LOCALE_TEXT);
    for (const [key, value] of Object.entries(germanLocaleText)) {
      const english = DEFAULT_LOCALE_TEXT[key as keyof typeof DEFAULT_LOCALE_TEXT];
      const params = (text: unknown) => [...JSON.stringify(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual([...new Set(params(value))], [...new Set(params(english))], `placeholders of ${key}`);
    }
  });

  it('renders the pager, header buttons, and assistive labels from the catalog', () => {
    const html = render({
      rows: 30,
      columns: [{ type: 'selection' }, ...personColumns],
      modules: [createPagingModule<Person>()],
      paging: { pageSize: 10 },
      columnMenu: true,
      resizable: true,
      localeText: germanLocaleText,
    });
    assert.match(html, /aria-label="Seitennavigation"/);
    assert.match(html, /aria-label="Erste Seite"/);
    assert.match(html, /1 von 3 Seiten/);
    assert.match(html, /\(30 Elemente\)/);
    assert.match(html, /aria-label="Alle Zeilen auswählen"/);
    assert.match(html, /aria-label="Spaltenmenü Name"/);
    assert.match(html, /aria-label="Größe von Name ändern"/);
    assert.match(html, /aria-roledescription="Spaltengrößenänderung"/);
    assert.doesNotMatch(html, /First page|column menu|Select all rows|Pagination/);
  });

  it('plural forms follow the locale; unknown keys fall back to English', () => {
    const html = render({ rows: 1, modules: [createPagingModule<Person>()], paging: { pageSize: 10 }, localeText: { pagerItems: { one: '(ein Element)', other: '({count} Elemente)' } } });
    assert.match(html, /\(ein Element\)/);
    assert.match(html, /aria-label="First page"/);
  });

  it('boolean cells and the empty text come from the catalog', () => {
    const columns: DataGridColumn<Person>[] = [
      { field: 'id', primaryKey: true },
      { field: 'active', type: 'boolean' },
    ];
    const html = render({ rows: 2, columns, localeText: germanLocaleText });
    assert.match(html, />wahr</);
    assert.match(html, />falsch</);
    assert.match(render({ rows: 0, columns, localeText: germanLocaleText }), /Keine Datensätze vorhanden/);
  });
});

describe('locale and dir', () => {
  it('locale drives Intl formats', () => {
    const columns: DataGridColumn<Person>[] = [
      { field: 'id', primaryKey: true },
      { field: 'age', type: 'number', format: 'N2' },
    ];
    const html = render({ rows: 2, columns, locale: 'de-DE' });
    assert.match(html, />20,00</);
  });

  it('custom patterns render in server markup: era, standalone month, fraction, quoted literals, `$`, object forms', () => {
    const columns: DataGridColumn<Person>[] = [
      { field: 'id', primaryKey: true },
      { field: 'age', type: 'number', format: '$#,##0.00' },
      { field: 'joined', type: 'date', format: "LLLL y G 'at' HH:mm:ss.fff" },
      { field: 'name', format: { type: 'date', skeleton: 'yMMMd' }, valueGetter: (row) => row.joined },
    ];
    const html = render({ rows: 1, columns, locale: 'en-US', currency: 'EUR', timeZone: 'UTC' });
    assert.match(html, />€20\.00</);
    assert.match(html, />January 2024 AD at 00:00:00\.000</);
    assert.match(html, />Jan 1, 2024</);
  });

  it("dir='auto' resolves from the locale script; an explicit dir wins", () => {
    assert.match(render({ rows: 1, locale: 'ar-EG', dir: 'auto' }), /role="grid"[^>]*dir="rtl"/);
    assert.match(render({ rows: 1, locale: 'de-DE', dir: 'auto' }), /role="grid"[^>]*dir="ltr"/);
    assert.match(render({ rows: 1, locale: 'he', dir: 'ltr' }), /role="grid"[^>]*dir="ltr"/);
    assert.doesNotMatch(render({ rows: 1 }), /role="grid"[^>]*dir=/, 'inherited by default');
  });
});

describe('lookup columns', () => {
  const departments = [
    { code: 20, name: 'Sales' },
    { code: 21, name: 'Support' },
  ];

  it('registers the lookup module automatically and renders display values', () => {
    const columns: DataGridColumn<Person>[] = [
      { field: 'id', primaryKey: true },
      { field: 'age', header: 'Department', lookup: { data: departments, keyField: 'code', displayField: 'name' } },
    ];
    const html = render({ rows: 2, columns });
    assert.match(html, />Sales</);
    assert.match(html, />Support</);
    assert.doesNotMatch(html, /data-lookup-status/, 'local lookups have no load status');
  });

  it('server markup sorts and groups a lookup column by the display text', () => {
    // Keys 20..23 (the ages of the first four people) in a different order than their names.
    const names = [
      { code: 20, name: 'Zed' },
      { code: 21, name: 'Amy' },
      { code: 22, name: 'Max' },
      { code: 23, name: 'Bob' },
    ];
    const columns: DataGridColumn<Person>[] = [
      { field: 'id', primaryKey: true },
      { field: 'age', header: 'Owner', lookup: { data: names, keyField: 'code', displayField: 'name' } },
    ];
    const order = (html: string): string[] =>
      ['Amy', 'Bob', 'Max', 'Zed'].map((n) => [n, html.indexOf(`>${n}<`)] as const).sort((x, y) => x[1] - y[1]).map(([n]) => n);
    const sorted = render({ rows: 4, columns, sorting: { sortBy: [{ field: 'age', direction: 'asc' }] } });
    assert.deepEqual(order(sorted), ['Amy', 'Bob', 'Max', 'Zed']);
    const desc = render({ rows: 4, columns, sorting: { sortBy: [{ field: 'age', direction: 'desc' }] } });
    assert.deepEqual(order(desc), ['Zed', 'Max', 'Bob', 'Amy']);
    const grouped = render({ rows: 4, columns, grouping: { groupBy: ['age'] } });
    assert.match(grouped, /salmon-data-grid-group-caption/);
    assert.deepEqual(order(grouped), ['Amy', 'Bob', 'Max', 'Zed']);
  });

  it('a remote lookup loads only after mount: the server renders no request', () => {
    let loads = 0;
    const source = { load: () => (loads++, []) };
    const columns: DataGridColumn<Person>[] = [
      { field: 'id', primaryKey: true },
      { field: 'age', header: 'Department', lookup: { data: source, keyField: 'code', displayField: 'name' } },
    ];
    render({ rows: 3, columns });
    assert.equal(loads, 0);
  });
});

describe('persistState on the server', () => {
  it('never touches the storage while rendering and renders the definition state', () => {
    const calls: string[] = [];
    const storage = {
      load: (key: string) => (calls.push(`load:${key}`), null),
      save: (key: string) => void calls.push(`save:${key}`),
    };
    const plain = render({ rows: 5, id: 'people' });
    const persisted = render({ rows: 5, id: 'people', persistState: { storage } });
    assert.deepEqual(calls, []);
    // The same markup; the `persistState` render feature only adds the pending mark of a gated grid.
    assert.equal(persisted.replace(' data-salmon-pending=""', ''), plain);
    assert.equal(count(render({ rows: 5, id: 'people', persistState: true }), /role="row"/), count(plain, /role="row"/));
  });
});
