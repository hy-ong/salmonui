---
title: Accessibility and localization
description: The ARIA patterns and keyboard map of PivotTable, PivotFieldList, PivotAxisBar, PivotToolbar and the pivot dialogs, the localeText catalog, number and date formatting per locale, and right-to-left layouts.
category: Pivot Table
order: 85
demos: [pivot-table-accessibility]
---

Every pivot part is a WAI-ARIA pattern with a keyboard path for each
pointer action, including drag and drop. The parts are audited with axe in
light, dark and right-to-left layouts.

## ARIA patterns

| Part | Pattern |
| --- | --- |
| `PivotTable`, compact layout | `treegrid`: member rows carry `aria-level` and `aria-expanded`; stacked column headers use `aria-colspan`; row headers are `rowheader`s and value cells `gridcell`s. The server renders a `grid` and the client upgrades it to `treegrid` after hydration, so the server HTML is valid without tree attributes. |
| `PivotTable`, tabular layout | `grid` with one pinned `rowheader` column per row field; drill toggles are buttons with `aria-expanded`. |
| `PivotFieldList` | A `group` holding the field `listbox` (multi-select) and one `listbox` per axis (Filters, Columns, Rows, Values). |
| `PivotAxisBar` | One `toolbar` per axis with a button per field. |
| `PivotToolbar` | `toolbar` with menu buttons (`aria-haspopup="menu"`) and toggles (`aria-pressed`). |
| Field menu | `menu` with `menuitem`s and submenus, opened from the field button. |
| Field list popup, member editor, calculated field, number and conditional formatting, grouping, drill through | Modal `dialog`s: focus moves in, Tab stays inside, Escape closes and focus returns to the control that opened the dialog. The member editor holds a `searchbox` and a checkbox `listbox`; the formula field reports errors through `role="alert"`; drill through holds a `DataGrid`. |
| Loading | `aria-busy` on the root and a `role="status"` message while the pivot computes. |

## Keyboard map

Inside the table, the [Data Grid keyboard map](/docs/data-grid/accessibility)
applies (arrows, Home / End, Page Up / Page Down, Tab out). On top of it:

| Where | Key | Action |
| --- | --- | --- |
| Member row or column header | Enter or Space | Drill down or up |
| Table | Ctrl+ArrowDown / Ctrl+ArrowUp (Cmd on macOS) | Expand or collapse every row member |
| Value cell | Enter | Open drill through (when `drillThrough` is on) |
| Toolbar, axis bar | ArrowLeft / ArrowRight, Home, End | Move between buttons (one Tab stop per toolbar; mirrored in RTL) |
| Field list axis | ArrowUp / ArrowDown, Home, End | Move between fields |
| Field button (list or bar) | Enter, Shift+F10 or the context menu key | Open the field menu (sort, filter, aggregate, "Move to" an axis, remove) |
| Field button on an axis | Alt+ArrowUp / Alt+ArrowDown | Move the field one step inside its axis; focus follows it |
| Field button on an axis | Delete or Backspace | Remove the field from the report |
| Field list | Space | Check or uncheck the field |
| Menu | Arrows, Enter, Escape | Navigate, run, close (focus returns to the field button) |
| Dialog | Tab, Escape | Move inside the dialog, close it |

The "Move to" menu, Alt+Arrow and Delete are the keyboard alternative to
dragging fields between axes. On touch screens the same menu replaces the
drag gesture.

## Text and formatting

Every visible and assistive string comes from one plain-JSON catalog.
`localeText` overrides any key; `{param}` placeholders are substituted:

```tsx
import { PivotTable, PIVOT_DEFAULT_LOCALE_TEXT, type PivotLocaleText } from '@salmonui/pivot-table';

const de: PivotLocaleText = {
  grandTotal: 'Gesamtergebnis',
  subtotal: '{label} Ergebnis',
  expand: '{label} erweitern',
  collapse: '{label} reduzieren',
  rows: 'Zeilen',
  columns: 'Spalten',
  values: 'Werte',
  filters: 'Filter',
};

<PivotTable pivot={pivot} localeText={de} />
<PivotFieldList pivot={pivot} localeText={de} />
```

Pass the same `localeText` to `PivotFieldList`, `PivotAxisBar` and
`PivotToolbar` when you render them on their own; inside `PivotTable` the
axis bar, toolbar and dialogs inherit it. `PIVOT_DEFAULT_LOCALE_TEXT` lists
every key with its English default.

Numbers, dates and member sorting follow `locale` on `usePivot()` (or
`PivotTable`), through `Intl`; measure formats (`formats`) are `Intl`
options, so currency and grouping separators come from the locale:

```tsx
const pivot = usePivot({ data, fields, defaultPivotModel: model, locale: 'de-DE' });
```

## Right to left

Set `dir="rtl"` on the page or a container. The pivot styles use logical
properties only, so the row headers move to the right, the toolbars and
the axis bar mirror their arrow keys, and the dialogs, menus and the field
list follow the inherited direction. There is no RTL prop.
