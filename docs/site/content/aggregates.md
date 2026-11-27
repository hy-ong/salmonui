---
title: Aggregates
description: Footer, group footer and group caption summaries with built-in and custom aggregate types.
category: Aggregates
order: 80
demos: [aggregates, paged-groups]
---

Aggregates are a core module declared as data: one or more
aggregate rows, each listing fields with one or several types,
as the `aggregates` prop or as `<DataGridAggregateRow>` and
`<DataGridAggregate>` children. The built-in types are sum, average, min, max, count, true count
and false count; a custom type receives the rows of the grid or
group. Values use number and date formats.

```tsx
<DataGrid
  data={orders}
  columns={columns}
  grouping={{ groupBy: ['country'] }}
  aggregates={[
    {
      columns: [
        { field: 'amount', type: ['sum', 'average'], format: 'C2',
          renderFooter: ({ formatted }) => <>Total {formatted.sum}</>,
          renderGroupCaption: ({ formatted }) => <>Avg {formatted.average}</> },
        { field: 'shipped', type: 'trueCount', renderGroupFooter: ({ values }) => <>{String(values.trueCount)} shipped</> },
        { field: 'customer', type: 'custom', custom: (rows) => new Set(rows.map((row) => row.customer)).size },
      ],
    },
  ]}
/>
```

Each `DataGridAggregate` names the `field`, the `type` (one or an array:
`'sum'`, `'average'`, `'min'`, `'max'`, `'count'`, `'trueCount'`,
`'falseCount'`, `'custom'`), an optional `displayField` for the column the
value shows under, a `format` and the templates. The JSX form is
`<DataGridAggregateRow><DataGridAggregate field="amount" type="sum" /></DataGridAggregateRow>`
inside the grid. `api.getAggregates()` returns the footer values and
`api.getAggregates(groupId)` those of one group.

## Placement and templates

Each aggregate shows in the grid footer, in group footers, in group
captions, or several of these: the templates it defines decide where, and
without any template it shows in the footer with the default rendering. Footer, group footer and group caption
templates are functions that receive the raw and formatted values, the
group, its count and its rows.

String templates such as `${Sum}` are not supported (as for column
templates): templates are functions, so no string
evaluation runs on the footer render path and they are type-checked.
For a footer that reads "Sum: ...", use
`renderFooter: ({ formatted }) => <>Sum: {formatted.sum}</>`; the context
carries the values (`values`) and formatted text (`formatted`) by type.

The footer stays pinned to the bottom of the scroll container.

## Correctness

Aggregates are computed over the whole filtered data set, not over the rows
that happen to be rendered, so they are correct under virtualization.
They recompute when the
query or the data changes.

With a remote data source that aggregates on the server, the result lists
`'aggregate'` in `performed` and carries the totals in `aggregates`: the
footer and `api.getAggregates()` then show those server totals instead of
summarizing the received page. Group footers and captions
still summarize the received rows, except in lazy grouping, where captions
come with server aggregates.

<!-- demo: aggregates -->

## Aggregates with paging

With `paging`, the grid prop `aggregateScope` picks what the footer and the
group footers and captions summarize: `'page'` (the default)
aggregates the rows of the current page, `'all'` every row that matches the
filters. With grouping, pages count data rows and a group that spans two
pages shows its caption on both; with `'page'` its aggregates cover only the
rows on the current page.

<!-- demo: paged-groups -->

## API reference

See [`DataGridAggregate`](/docs/reference/data-grid/DataGridAggregate),
[`DataGridAggregateRow`](/docs/reference/data-grid/DataGridAggregateRow)
and [`DataGridAggregateContext`](/docs/reference/data-grid/DataGridAggregateContext)
in the API reference.
