---
title: Aggregation
description: Pivot aggregation types over mergeable states, show values as, the getCellValue override, calculated field formulas and automatic data compression.
category: Engine
order: 110
demos: [pivot-table-aggregation]
---

Each entry in `pivotModel.values` is one measure: a source `field`, an
`aggregate`, and an optional `caption`, `showAs` and `customId`.

```ts
values: [
  { field: 'amount', aggregate: 'sum' },
  { field: 'amount', aggregate: 'average', caption: 'Avg amount' },
  { field: 'country', aggregate: 'distinctCount' },
]
```

## Aggregation types

| `aggregate` | Notes |
| --- | --- |
| `sum`, `product`, `min`, `max` | Numeric values only; empty when a cell has none |
| `count` | Non-blank values of any type |
| `distinctCount` | Distinct non-blank values of any type |
| `average` | Sum and count, merged exactly |
| `median` | Exact; computed only when used |
| `populationVar`, `sampleVar`, `populationStdev`, `sampleStdev` | Welford states, merged exactly |
| `custom` | `customAggregates[customId]`: `{ init, add, merge, result }` |

Aggregates are kept as mergeable states in typed arrays, so subtotals, grand
totals, column drill and collapse never re-read the raw rows. A non-numeric
field supports `count` and `distinctCount`; any other aggregate over it
returns empty cells.

**Measure ids.** Every value field has an id that is unique within
`values`. It is the `field` itself, `field#aggregate` when another value field
uses the same field (`amount#sum`, `amount#average`), and
`field#aggregate#index` if even that repeats. The id appears in
`PivotHeaderNode.measure`, `PivotCell.measure` and header keys, and
`measureId(values, index)` computes it. `valueSort.measure`, value filters and
`formats` also accept the plain field name.

## Show values as

`showAs` transforms the aggregate after it is computed. It is separate from
`aggregate`.

| `showAs.kind` | Value |
| --- | --- |
| `percentOfGrandTotal`, `percentOfColumnTotal`, `percentOfRowTotal` | v / grand total, column total, row total |
| `percentOfParentRowTotal`, `percentOfParentColumnTotal` | v / the parent member's total on that axis |
| `percentOfParentTotal` | v / the total of the ancestor at `baseField` |
| `runningTotal`, `percentOfRunningTotal` | Cumulative along the members of `baseField` (default: the innermost row field) |
| `differenceFrom`, `percentOfDifferenceFrom` | v − the value at `baseItem` of `baseField` (empty for the base item itself) |
| `index` | (v × grand total) / (row total × column total) |

`cellAt().rawValue` keeps the aggregate before the transform. Percent kinds
are formatted as percentages unless `formats[measure]` says otherwise.

## Overriding a cell

`getCellValue(cell)` is a pure function. It
receives the computed `PivotCell` and returns the value to show, and the
formatted text follows the new value:

```ts
createPivotEngine({ data, model, getCellValue: (c) => (c.kind === 'grandTotal' ? null : c.value) });
```

In React, pass `getCellValue` (and `customAggregates`) to `usePivot()` or
`PivotTable`. Both are read when the store is created: keep them stable
(module-level functions), and remount with a new `key` to switch them.

## Changing the aggregate at run time

The menu of a value field button on the axis bar or in the field list has
"Summarize values by". It offers the
`aggregateOptions` prop of `PivotTable`, `PivotAxisBar` or `PivotFieldList`
(default: every built-in aggregate; a non-numeric field offers only `count`
and `distinctCount`), and `onBeforeAggregateMenuOpen` receives
`{ field, index, items }` with a mutable `items` copy to change the list per
field, or `preventDefault()` to leave the submenu out. From code,
`pivot.setAggregate(index, aggregate)` changes `values[index].aggregate`.

```tsx
<PivotTable
  data={data}
  defaultPivotModel={model}
  axisBar
  aggregateOptions={['sum', 'count', 'average', 'min', 'max']}
  onBeforeAggregateMenuOpen={(event) => {
    if (event.field === 'units') event.items.push('distinctCount');
  }}
/>
```

## Calculated fields

`calculatedFields` defines measures computed from other aggregated measures.
To show one, add its `name` to `values` (the `aggregate` you give it there is
ignored). Write references as `"Sum(Amount)"` (quoted) or
`Sum(Amount)`. The aggregate names are `Sum`, `Count`, `DistinctCount`,
`Avg`, `Average`, `Min`, `Max`, `Product`, `Median`, `PopulationStDev`,
`SampleStDev`, `PopulationVar` and `SampleVar`.

```ts
calculatedFields: [{ name: 'price', formula: '"Sum(amount)" / "Sum(units)"', format: { number: { maximumFractionDigits: 2 } } }],
values: [{ field: 'price', aggregate: 'sum' }],
```

| Supported | |
| --- | --- |
| Operators | `+ - * / % ^`, `= == != <> < <= > >=`, `&& \|\|`, unary `- + !`, parentheses |
| Functions | `IF`, `AND`, `OR`, `NOT`, `ABS`, `MIN`, `MAX`, `ROUND`, `CEILING`, `FLOOR`, `TRUNC`, `SIGN`, `SQRT`, `POWER`, `EXP`, `LOG`, `LOG10`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN` |
| Constants | `TRUE`, `FALSE`, `PI` |

Formulas are parsed into closures and are never run as code: no `eval` and no
`Function` constructor, so they work under a strict Content Security Policy.
An empty measure makes arithmetic empty, and a non-finite result such as
division by zero is empty too. `compileFormula(formula, fields)` (also at
`@salmonui/pivot-table/engine/formula`, 2 KB) validates a formula. It throws
a `PivotFormulaError` with the character `position`. If a formula in the model
does not compile, the result reports it in `errors`
(`{ name, message, position }`) and its cells stay empty.

## Data compression

Data compression needs no prop and never makes an aggregate coarser. When
grouping the rows by their row and column member tuples is guaranteed to
cut the work at least 4×, the engine pre-aggregates them into one record per
tuple and aggregates the records instead of the rows. The records keep exact
states, so averages, variances and custom aggregates come out identical, and
distinct count and median still read the raw rows. Compression is skipped when
it cannot pay off, for example when almost every row has its own tuple.
