---
title: Editors
description: The calculated field editor with live formula validation, the number format and conditional format dialogs, and the grouping dialog for number ranges, date parts and custom groups, opened from menus, the toolbar or the instance API.
category: Fields and filters
order: 55
demos: [pivot-table-editors]
---

Each editor is a modal `dialog` with form fields that writes one part of
the report model through a cancellable command. The dialogs load on first
open, return focus on close and become full-screen sheets below 640 px.

| Editor | Opened from | Writes | Instance API |
| --- | --- | --- | --- |
| Calculated field | toolbar Formatting menu or `calculatedField` item, value field menu of a calculated field | `pivotModel.calculatedFields` | `api.openCalculatedFieldEditor(name?)` |
| Number format | toolbar Formatting menu or `numberFormat` item, value field menu | `pivotModel.formats[measure].number` | `api.openNumberFormatEditor(measure?)` |
| Conditional format | toolbar Formatting menu or `conditionalFormat` item | `pivotModel.conditionalFormats` | `api.openConditionalFormatEditor()` |
| Grouping | "Group…" in the menu of a row or column field | `pivotModel.groups[field]` | `pivot.openDialog({ kind: 'grouping', field })` |

`api` is the `PivotTable` ref (`PivotTableApi`); with a shared store,
`pivot.openDialog({ kind: 'calculatedField', name: null })` (and
`numberFormat`, `conditionalFormat`, `grouping`) does the same. The dialogs
render inside the mounted `PivotTable` that uses the store.

The engine side of each (formula language, format options, rule matching,
group semantics) is in [Calculated fields](/docs/pivot-table/aggregation#calculated-fields),
[Aggregation](/docs/pivot-table/aggregation) and
[Grouping](/docs/pivot-table/filtering-and-sorting#grouping).

Where an editor or a rule takes a `measure`, it is the value field's
measure id: its `field`, or `field#aggregate` when the same field is
summarized twice (`amount#sum`, `amount#average`; `measureId()` in
`@salmonui/pivot-table/engine`). A calculated field's measure id is its
`name`.

## Calculated field

The editor has a name, an optional caption and a formula `textbox`:

```text
"Sum(revenue)" - "Sum(cost)"
IF("Sum(units)" > 0, "Sum(revenue)" / "Sum(units)", 0)
```

The formula is compiled on every keystroke by the engine's parser (no
`eval`, no `new Function`, so it runs under a strict CSP); an error shows
under the field with its message (`aria-invalid`, `role="alert"`) and
disables OK. Opening it for an existing field edits that field, with a
Remove button; a new field is added to the values. From code:

```ts
pivot.setCalculatedField('margin', { name: 'margin', caption: 'Margin', formula: '"Sum(revenue)" - "Sum(cost)"' }, { addToValues: true });
pivot.setCalculatedField('margin', null); // remove
```

`onBeforeCalculatedFieldChange` (cancellable) and `onCalculatedFieldChange`
receive `{ name, calculatedField, previous }`.

## Number format

Pick a measure, a style (decimal, currency, percent), decimals, digit
grouping and a currency code. OK writes `Intl.NumberFormat` options:

```ts
pivot.setFormat('revenue', { number: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } });
```

Date member formats are `formats[field].date` (`Intl.DateTimeFormat`
options), set in the model.

## Conditional format

A list of rules, each with a measure (or every value field), an operator, one
or two values and a tone (`accent`, `success`, `warning`, `danger`,
`neutral`); Add condition and Remove condition edit the list, OK writes it. Tones
are colored from the five theme seeds; rules written in code may instead
set a `className` or a `style`:

```ts
pivot.setConditionalFormats([
  { measure: 'revenue', operator: 'lessThan', value: 0, tone: 'danger' },
  { measure: 'revenue', operator: 'greaterThan', value: 50_000, className: 'top-seller', applyGrandTotals: false },
]);
```

The same rules color the cells of an XLSX export ([Export](/docs/pivot-table/export)).

## Grouping

"Group…" opens the grouping dialog for the field's type:

- Number fields: start, end and interval (`{ kind: 'number', start, end, interval }`).
- Date fields: start, end and the date parts: years, quarters, quarter
  and year, months, days, hours, minutes, seconds (`{ kind: 'date', parts }`).
- Other fields: check members, name the group and add it (`{ kind: 'custom', groups }`).

"Ungroup" in the field menu removes the grouping. From code:

```ts
pivot.setGrouping('orderDate', { kind: 'date', parts: ['years', 'quarters'] });
pivot.setGrouping('age', { kind: 'number', start: 0, end: 100, interval: 10 });
pivot.setGrouping('age', null);
```

Every editor's change also fires `onBeforePivotModelChange` /
`onPivotModelChange` with `action` `calculatedField`, `format`,
`conditionalFormat` or `group` ([State and events](/docs/pivot-table/state)).
