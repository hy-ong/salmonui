---
title: Localization
description: Translate every grid string with the localeText catalog, format numbers, dates and money per locale, and pick the text direction from the locale.
category: Globalization and Localization
order: 118
demos: [localization, format-patterns, text-matching, date-picker]
---

## Text

Every visible and assistive string of the grid (pager, filter UI, menus,
column chooser, toolbar, empty and loading states, live announcements) comes
from one flat catalog. `DATA_GRID_DEFAULT_LOCALE_TEXT` is the built-in English
catalog; its keys are typed as `DataGridLocaleTextKey`. The `localeText`
prop merges overrides over English, so a partial catalog is fine:

```tsx
import { DataGrid, type DataGridLocaleText } from '@salmonui/data-grid';

const de: DataGridLocaleText = {
  noRows: 'Keine Datensätze vorhanden',
  pageOf: 'Seite {page} von {pageCount}',
  rowsSelected: { one: '1 Zeile ausgewählt', other: '{count} Zeilen ausgewählt' },
};

<DataGrid localeText={de} locale="de-DE" data={orders} columns={columns} />;
```

To localize every grid (and every other Salmon UI component) at once, put
them under a [`LocaleProvider`](/docs/data-grid/locale-provider): its
catalog's `dataGrid` entry has the keys of this prop, the built-in
`@salmonui/core/locale/zh-TW` pack translates all of them, and a grid's own
`localeText` and `locale` still win over the provider's:

```tsx
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';

<LocaleProvider locale="zh-TW" localeText={zhTW}>
  <DataGrid data={orders} columns={columns} paging />
</LocaleProvider>;
```

A message is either a string with `{param}` placeholders or a set of plural
forms (`zero`, `one`, `two`, `few`, `many`, `other`) chosen with
`Intl.PluralRules` for the grid `locale`; `other` is required. Numeric
parameters are written with the locale's number format (`{count} items`
reads "22,095 items" in `en-US`, "22.095" in `de-DE`). The catalog
is plain JSON with no functions, so it can live in a JSON file or be loaded
in a server component and passed to a client `DataGrid`. Column headers are your
own `header` values, so translate them with the rest of your app.

## Formats

`locale` drives the `Intl` number, date and currency formatters of every
column `format` (`N2`, `C2`, `P1`, `yMMMd`, ...). `currency` sets
the currency of `C` formats, and `timeZone` the IANA time zone of
date formats; set `timeZone` for SSR so the server and the browser format
identically.

### Custom patterns

Besides the presets, `format` takes custom patterns that map onto `Intl`:

| Pattern | Meaning | `1234567.891` in `en-US` |
| --- | --- | --- |
| `#,##0.00` | Grouping, exactly two decimals | `1,234,567.89` |
| `0.0##` | One to three decimals, no grouping | `1234567.891` |
| `'USD' #,##0` | Quoted literal text, no decimals | `USD 1,234,568` |
| `$#,##0.00` | Unquoted `$`: the currency symbol of `currency` in the grid locale (`'$'` is a literal dollar sign) | `$1,234,567.89` (`€1,234,567.89` with `currency: 'EUR'`) |
| `0.0%` | Percent (the value is multiplied by 100) | `0.1234` → `12.3%` |
| `000` | Minimum integer digits | `7` → `007` |
| `#,##0.00;(#,##0.00)` | Negative section after `;` (no minus sign is added) | `-1234.5` → `(1,234.50)` |
| `0.0;-0.0;'nil'` | Third section for zero | `0` → `nil` |

Date patterns use the tokens `G` (era: `G` short such as `AD`, `GGGG` long,
`GGGGG` narrow), `y`, `M` / `L` (month: `MMM` / `MMMM` names in their in-date
form, `LLL` / `LLLL` the standalone form, which differ in e.g. `ru-RU`:
`d MMMM` → `11 ноября`, `LLLL` → `ноябрь`), `d`, `E`
(weekday), `c` (standalone weekday: `ccc` / `cccc` names, `c` the number of
the day in the locale's week), `h` / `H`, `m`, `s`, `f` (fraction of the
second, truncated to the token length: `f` tenths, `fff` milliseconds), `a` and
`z` (time zone name: `z` short such as `UTC` or `EST`, `zzzz` long), with
literal text in single quotes and `''` for a quote:
`yyyy-MM-dd HH:mm:ss.fff`, `EEE d MMM y 'at' h:mm a`, `h 'o''clock'`. A
format made only of the letters `G y M L d E h H m s` (such as `yMMMd`) is
read as a skeleton, not a pattern. Month and
weekday names, digits and separators still come from the grid `locale`. For
locale-ordered dates, pass an object with a CLDR skeleton instead of a
pattern: `format: { type: 'date', skeleton: 'yMMMEd' }` renders
`Thu, Mar 5, 2026` in `en-US` and `Do., 5. März 2026` in `de-DE`;
`{ type: 'date', skeleton: 'medium' }` stays date-only even on a `datetime`
column, and `{ type, format }` takes a pattern or skeleton in `format`
(`{ type: 'number', format: '#,##0.0' }`). The object
form also takes `currency`, `timeZone`, `minimumFractionDigits`,
`maximumFractionDigits` and `useGrouping`.

### Formatting in templates

`formatValue(value, format, { locale, currency, timeZone, type })` from
`@salmonui/data-grid/engine/locale` formats any value with the same vocabulary, for
cell templates, tooltips or text outside the grid. Formatters
are cached per locale, currency and time zone:

```tsx
import { formatValue } from '@salmonui/core/format';

const columns: DataGridColumn<Sale>[] = [
  {
    field: 'amount',
    renderCell: ({ value }) => formatValue(value, 'C0', { locale: 'de-DE', currency: 'EUR' }),
  },
];
```

Inside a template, `ctx.formattedValue` already holds the column's own
formatted text, and `ctx.column.formatValue(value, row)` formats another
value with the column's format.

<!-- demo: format-patterns -->

## Accents and case

Search and filters compare text without case and with accents by default.
Two options, named the same everywhere, change that:

- `matchCase: true` makes the comparison case-sensitive
  (`filtering.matchCase`, `search.matchCase`, and per condition in
  `filtering.filters` or `api.filterColumn(field, operator, value, { matchCase })`).
- `ignoreAccents: true` folds diacritics before comparing, so `rene` finds
  `Renée` and `malaga` finds `Málaga` (`filtering.ignoreAccents`,
  `search.ignoreAccents`, per condition, and `columnChooser.ignoreAccents`).

Both options are reactive: changing them re-runs the active search and
filters.

<!-- demo: text-matching -->

## Date editors and calendars

The `date` and `datetime` editors are a text input plus a calendar button. The
input shows the date in the numeric order of the grid `locale`
(`12/24/2026` in `en-US`, `24.12.2026` in `de-DE`, `2026/12/24` in `ja-JP`)
and also accepts ISO `2026-12-24`; `datetime` adds a 24-hour time
(`24.12.2026 14:30`, `am` / `pm` accepted). Text that does not parse keeps
the last valid value.

Alt+ArrowDown or the button opens a calendar dialog that follows the
WAI-ARIA date picker pattern: arrow keys move by day and week (mirrored
right to left), Home and End go to the start and end of the week, PageUp and
PageDown change the month (with Shift, the year), Enter or Space choose the
day, and Escape closes the calendar and returns focus to the input without
ending the edit. The `datetime` calendar also has a time input. See
[Accessibility](/docs/data-grid/accessibility) for the full key map.

Weekday and month names come from `Intl.DateTimeFormat`, and the first day of
the week from `Intl.Locale` week info of the `locale` (Sunday in `en-US`,
Monday in `de-DE`, Saturday in `ar-EG`; browsers without week info use the
CLDR region table). Override it per column with
`editorProps.firstDayOfWeek` (`0` Sunday ... `6` Saturday):

```tsx
const columns: DataGridColumn<Booking>[] = [
  { field: 'arrival', type: 'date', editorProps: { firstDayOfWeek: 1 } },
  { field: 'checkIn', type: 'datetime', editorProps: { calendar: 'japanese' } },
];
```

The calendar grid is always laid out in Gregorian months, and stored values
are plain `Date`s. `editorProps.calendar` (default: the `locale`'s calendar,
so `-u-ca-` extensions such as `ja-JP-u-ca-japanese` work) relabels it where
the calendar shares the Gregorian months: `buddhist` (`th-TH`), `japanese`
and `roc` show their era years in the month heading. Calendars with other
months (`islamic-umalqura`, `hebrew`, `persian`, `chinese`, ...) keep the
Gregorian heading and give each day an accessible name and tooltip with the
date in that calendar; a month grid laid out in those calendars is not
offered.

<!-- demo: date-picker -->

## Direction

`dir` sets the text direction: `'ltr'`, `'rtl'`, or `'auto'`, which follows
the script of `locale` (`ar`, `he`, `fa`, `ur`, ... render right to left).
Without `dir` the grid inherits the direction of its ancestors. A
right-to-left grid mirrors its layout and flips the arrow keys, including in
the pager. See [Right-to-left](/docs/data-grid/rtl).

`localeText`, `locale`, `currency`, `timeZone` and `dir` are all reactive:
changing them re-renders labels and formatted cells in place, without
remounting the grid or losing its sort, filters, page or selection.

<!-- demo: localization -->

## API reference

See [`DataGridLocaleText`](/docs/reference/data-grid/DataGridLocaleText),
[`DATA_GRID_DEFAULT_LOCALE_TEXT`](/docs/reference/data-grid/DATA_GRID_DEFAULT_LOCALE_TEXT),
[`FormatOptions`](/docs/reference/data-grid/engine/FormatOptions) and
[`formatValue`](/docs/reference/data-grid/engine-locale/formatValue) in the API
reference.