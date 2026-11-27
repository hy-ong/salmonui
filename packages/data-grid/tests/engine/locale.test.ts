import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine } from '@salmonui/data-grid/engine';
import {
  createFormatter,
  createLocaleTextModule,
  DEFAULT_LOCALE_TEXT,
  formatLocaleText,
  formatValue,
  isRtlLocale,
  resolveLocale,
  resolveLocaleText,
} from '@salmonui/data-grid/engine/locale';

const german = { noRows: 'Keine Datensätze', pageOf: 'Seite {page} von {pageCount}', rowsSelected: { one: '1 Zeile ausgewählt', other: '{count} Zeilen ausgewählt' } };

describe('locale text', () => {
  it('ships complete English defaults', () => {
    assert.equal(DEFAULT_LOCALE_TEXT.noRows, 'No records to display');
    for (const [key, value] of Object.entries(DEFAULT_LOCALE_TEXT)) {
      const text = typeof value === 'string' ? value : value.other;
      assert.ok(text.length > 0, key);
    }
  });

  it('merges overrides, fills named placeholders, and picks plural forms', () => {
    const text = resolveLocaleText(german, { add: 'Hinzufügen' }, { bogus: 42 });
    assert.equal(text.noRows, 'Keine Datensätze');
    assert.equal(text.add, 'Hinzufügen');
    assert.equal(text.delete, 'Delete');
    assert.equal(text['bogus'], undefined, 'invalid entries are ignored');
    assert.equal(formatLocaleText(text, 'pageOf', { page: 2, pageCount: 7 }), 'Seite 2 von 7');
    assert.equal(formatLocaleText(text, 'rowsSelected', { count: 1 }, 'de-DE'), '1 Zeile ausgewählt');
    assert.equal(formatLocaleText(text, 'rowsSelected', { count: 5 }, 'de-DE'), '5 Zeilen ausgewählt');
    assert.equal(formatLocaleText(text, 'pageOf', { page: 1 }), 'Seite 1 von {pageCount}');
    assert.equal(formatLocaleText(text, 'unknownKey'), 'unknownKey');
    assert.equal(resolveLocaleText(), DEFAULT_LOCALE_TEXT);
  });

  it('formats numeric parameters with the locale number format (group captions, pager counts)', () => {
    assert.equal(formatLocaleText(DEFAULT_LOCALE_TEXT, 'groupItems', { count: 22_095 }), '22,095 items');
    assert.equal(formatLocaleText(DEFAULT_LOCALE_TEXT, 'groupItems', { count: 1 }), '1 item');
    assert.equal(formatLocaleText(DEFAULT_LOCALE_TEXT, 'pagerItems', { count: 22_095 }, 'de-DE'), '(22.095 items)');
    assert.equal(formatLocaleText({ x: '{page}/{pageCount} {name}' }, 'x', { page: 1_200, pageCount: 4_000, name: '1000' }), '1,200/4,000 1000', 'strings are inserted as given');
    // An invalid locale falls back to en-US.
    assert.equal(formatLocaleText(DEFAULT_LOCALE_TEXT, 'groupItems', { count: 5_000 }, 'not a locale!'), '5,000 items');
  });

  it('keeps the resolved text in the engine snapshot', () => {
    const engine = createDataGridEngine({
      getRowId: (r: { id: string }) => r.id,
      columns: [{ field: 'id' }],
      dataSource: [{ id: 'a' }],
      locale: 'de-DE',
      localeText: german,
      modules: [createLocaleTextModule<{ id: string }>()],
    });
    assert.equal(engine.localeText.format('noRows'), 'Keine Datensätze');
    assert.equal(engine.localeText.format('rowsSelected', { count: 3 }), '3 Zeilen ausgewählt');
    const before = engine.getSnapshot();
    engine.localeText.set({ text: { noRows: 'Leer' } });
    assert.notEqual(engine.getSnapshot(), before);
    assert.equal(engine.localeText.get().noRows, 'Leer');
    assert.equal(engine.localeText.get().pageOf, 'Page {page} of {pageCount}', 'set replaces the overrides');
  });
});

describe('Intl formatting', () => {
  it('formats numbers, money, and percent per locale', () => {
    const en = createFormatter({ locale: 'en-US' });
    assert.equal(en.number(1234.5, 'N2'), '1,234.50');
    assert.equal(en.money(1234.5), '$1,234.50');
    assert.equal(en.percent(0.256, 1), '25.6%');
    assert.equal(en.number(1234.5, '#,##0.0'), '1,234.5');
    const de = createFormatter({ locale: 'de-DE', currency: 'EUR' });
    assert.equal(de.number(1234.5, 'N2'), '1.234,50');
    assert.match(de.money(1234.5), /1\.234,50\s€/);
    assert.equal(formatValue(42.5, 'N1', { locale: 'en-US' }), '42.5');
  });

  it('formats dates with skeletons and patterns in an injected time zone', () => {
    const f = createFormatter({ locale: 'en-US', timeZone: 'UTC' });
    const date = new Date(Date.UTC(2026, 10, 11, 9, 5));
    assert.equal(f.date(date), '11/11/2026');
    assert.equal(f.dateTime(date, 'dd/MM/yyyy HH:mm'), '11/11/2026 09:05');
    assert.equal(createFormatter({ locale: 'ja-JP', timeZone: 'UTC' }).date(date, 'yMd'), '2026/11/11');
  });

  it('number patterns: negative and zero sections after `;`', () => {
    const en = createFormatter({ locale: 'en-US' });
    assert.equal(en.number(-1234.5, '#,##0.00;(#,##0.00)'), '(1,234.50)');
    assert.equal(en.number(1234.5, '#,##0.00;(#,##0.00)'), '1,234.50');
    assert.equal(en.number(-5, '0;0 CR'), '5 CR');
    assert.equal(en.number(0, '0.0;-0.0;\'nil\''), 'nil');
    assert.equal(en.number(-2, '0.0;-0.0;\'nil\''), '-2.0');
    assert.equal(en.number(-3, '#,##0'), '-3', 'no negative section: the minus sign stays');
    assert.equal(en.number(-3, '\'a;b\' 0'), 'a;b -3', 'a quoted `;` is a literal');
    assert.equal(formatValue(-0.125, '0.0%;(0.0%)', { locale: 'en-US' }), '(12.5%)');
  });

  it('date tokens `c` (standalone weekday) and `z` (time zone name)', () => {
    const date = new Date(Date.UTC(2026, 10, 11, 9, 5)); // Wednesday
    const utc = createFormatter({ locale: 'en-US', timeZone: 'UTC' });
    assert.equal(utc.dateTime(date, 'cccc, d MMM'), 'Wednesday, 11 Nov');
    assert.equal(utc.dateTime(date, 'ccc'), 'Wed');
    assert.equal(utc.dateTime(date, 'c'), '4', 'en-US weeks start on Sunday');
    assert.equal(createFormatter({ locale: 'de-DE', timeZone: 'UTC' }).dateTime(date, 'c'), '3', 'de-DE weeks start on Monday');
    assert.equal(utc.dateTime(date, 'HH:mm z'), '09:05 UTC');
    const ny = createFormatter({ locale: 'en-US', timeZone: 'America/New_York' });
    assert.equal(ny.dateTime(date, 'HH:mm z'), '04:05 EST');
    assert.equal(ny.dateTime(date, 'zzzz'), 'Eastern Standard Time');
  });
});

describe('custom format patterns', () => {
  const date = new Date(Date.UTC(2026, 10, 11, 9, 5, 7, 123)); // Wednesday
  const utc = createFormatter({ locale: 'en-US', timeZone: 'UTC' });

  it('date token `G` (era): short, long and narrow', () => {
    assert.equal(utc.dateTime(date, 'y G'), '2026 AD');
    assert.equal(utc.dateTime(date, 'y GGGG'), '2026 Anno Domini');
    assert.equal(utc.dateTime(date, 'y GGGGG'), '2026 A');
    assert.equal(utc.dateTime(new Date(Date.UTC(-50, 0, 1)), 'y G'), '51 BC');
  });

  it('date token `L` (standalone month) differs from the in-date `M` form', () => {
    assert.equal(utc.dateTime(date, 'LLL'), 'Nov');
    assert.equal(utc.dateTime(date, 'LLLL'), 'November');
    assert.equal(utc.dateTime(date, 'LL/y'), '11/2026');
    const ru = createFormatter({ locale: 'ru-RU', timeZone: 'UTC' });
    assert.equal(ru.dateTime(date, 'LLLL'), 'ноябрь', 'standalone (nominative)');
    assert.equal(ru.dateTime(date, 'd MMMM'), '11 ноября', 'format form (genitive)');
  });

  it('date token `f` (fraction of the second, truncated)', () => {
    assert.equal(utc.dateTime(date, 'ss.f'), '07.1');
    assert.equal(utc.dateTime(date, 'ss.ff'), '07.12');
    assert.equal(utc.dateTime(date, 'HH:mm:ss.fff'), '09:05:07.123');
    assert.equal(utc.dateTime(date, 'fffff'), '12300', 'zero-padded past milliseconds');
    assert.equal(utc.dateTime(new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 5)), 'fff'), '005');
  });

  it('quoted date literals and the escaped quote', () => {
    assert.equal(utc.dateTime(date, "EEE d MMM y 'at' h:mm a"), 'Wed 11 Nov 2026 at 9:05 AM');
    assert.equal(utc.dateTime(date, "h 'o''clock'"), "9 o'clock", '`\'\'` inside a literal');
    assert.equal(utc.dateTime(date, "HH''mm"), "09'05", '`\'\'` outside a literal');
    assert.equal(utc.dateTime(date, "'yyyy' yyyy"), 'yyyy 2026', 'tokens inside quotes are literal');
  });

  it('an unquoted `$` is the currency symbol; a quoted one is literal', () => {
    assert.equal(utc.number(1234.5, '$#,##0.00'), '$1,234.50');
    assert.equal(utc.number(-1234.5, '$#,##0.00;($#,##0.00)'), '($1,234.50)');
    const eur = createFormatter({ locale: 'en-US', currency: 'EUR' });
    assert.equal(eur.number(1234.5, '$#,##0.00'), '€1,234.50');
    assert.equal(eur.number(1234, "'$'#,##0"), '$1,234');
    assert.equal(createFormatter({ locale: 'de-DE', currency: 'EUR' }).number(1234.5, '#,##0.00 $'), '1.234,50 €');
    assert.equal(formatValue(7, { type: 'number', format: '$0', currency: 'JPY' }, { locale: 'ja-JP' }), '￥7');
  });

  it('object forms `{ type: \'date\', skeleton }` and `{ type, format }`', () => {
    assert.equal(utc.date(date, { type: 'date', skeleton: 'yMMMd' }), 'Nov 11, 2026');
    assert.equal(utc.date(date, { type: 'date', skeleton: 'yMMMEd' }), 'Wed, Nov 11, 2026');
    assert.equal(utc.dateTime(date, { type: 'date', skeleton: 'medium' }), 'Nov 11, 2026', 'type date keeps a style date-only');
    assert.equal(utc.date(date, { type: 'datetime', skeleton: 'short' }), '11/11/26, 9:05 AM');
    assert.equal(utc.date(date, { type: 'date', format: 'dd/MM/yyyy' }), '11/11/2026');
    assert.equal(utc.date(date, { type: 'date', format: 'yMMMd' }), 'Nov 11, 2026', 'a skeleton in `format`');
    assert.equal(formatValue(date, { type: 'date', format: "d MMM 'at' HH:mm" }, { locale: 'en-US', timeZone: 'UTC' }), '11 Nov at 09:05');
    assert.equal(formatValue(1234.5, { type: 'number', format: '#,##0.0' }, { locale: 'de-DE' }), '1.234,5');
    assert.equal(formatValue('1234.5', { type: 'number', format: '0.00' }, { locale: 'en-US' }), '1234.50');
  });

  it('column formats use the same object forms', () => {
    const engine = createDataGridEngine({
      getRowId: (r: { id: string; at: Date; stamp: Date }) => r.id,
      columns: [
        { field: 'id', primaryKey: true },
        { field: 'at', type: 'datetime', format: { type: 'date', skeleton: 'medium' } },
        { field: 'stamp', type: 'datetime', format: { type: 'datetime', format: 'yyyy-MM-dd HH:mm:ss.fff' } },
      ],
      dataSource: [{ id: 'a', at: date, stamp: date }],
      locale: 'en-US',
      timeZone: 'UTC',
    });
    assert.equal(engine.getCellSnapshot('a', 'at')?.formattedValue, 'Nov 11, 2026');
    assert.equal(engine.getCellSnapshot('a', 'stamp')?.formattedValue, '2026-11-11 09:05:07.123');
  });
});

describe('direction', () => {
  it('resolves ltr, rtl, and auto, and detects RTL locales', () => {
    assert.equal(resolveLocale({ locale: 'ar-SA' }).direction, 'ltr');
    assert.equal(resolveLocale({ locale: 'ar-SA', direction: 'auto' }).direction, 'rtl');
    assert.equal(resolveLocale({ locale: 'en-US', direction: 'rtl' }).direction, 'rtl');
    assert.equal(resolveLocale({ localeText: german }).localeText.noRows, 'Keine Datensätze');
    for (const locale of ['ar', 'he-IL', 'fa-IR', 'ur-PK']) assert.equal(isRtlLocale(locale), true, locale);
    for (const locale of ['en-US', 'de-DE', 'ja-JP', 'not a locale']) assert.equal(isRtlLocale(locale), false, locale);
  });
});

describe('runtime locale (engine.setLocale)', () => {
  const rows = [
    { id: 'a', amount: 1234.5, name: 'Zoë' },
    { id: 'b', amount: 99, name: 'Ångström' },
  ];
  const make = () =>
    createDataGridEngine({
      getRowId: (r: (typeof rows)[number]) => r.id,
      columns: [
        { field: 'id', primaryKey: true },
        { field: 'amount', type: 'number', format: 'N2' },
        { field: 'name' },
      ],
      dataSource: rows,
      instrument: true,
    });

  it('recompiles formatters once and updates the snapshot locale', () => {
    const engine = make();
    assert.equal(engine.getCellSnapshot('a', 'amount')?.formattedValue, '1,234.50');
    let notified = 0;
    engine.subscribe(() => notified++);
    assert.equal(engine.setLocale({ locale: 'de-DE' }), true);
    assert.equal(notified, 1);
    assert.equal(engine.getSnapshot().locale, 'de-DE');
    assert.equal(engine.getCellSnapshot('a', 'amount')?.formattedValue, '1.234,50');
    assert.equal(engine.getInstrumentation()?.columnCompiles, 2);
    assert.equal(engine.setLocale({ locale: 'de-DE' }), false, 'unchanged');
    assert.equal(engine.getInstrumentation()?.columnCompiles, 2);
  });

  it('switches direction without recompiling and keeps focus in sync', () => {
    const engine = make();
    const before = engine.getSnapshot();
    assert.equal(engine.setLocale({ direction: 'rtl' }), true);
    assert.equal(engine.getSnapshot().direction, 'rtl');
    assert.notEqual(engine.getSnapshot(), before);
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
  });
});

