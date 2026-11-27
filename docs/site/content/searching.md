---
title: Searching
description: The toolbar search box, the search prop with its text, columns, operator and case and accent options, highlighted matches, search methods and events, and server-side search.
category: Searching
order: 63
demos: [search]
---

`search` turns grid search on: `true` for the defaults, or a `DataGridSearch`
object. Search keeps the rows where any searched column matches the text,
on top of the filters, and runs as a core pipeline stage.

## The search box

The toolbar item `'search'` hosts the
search box: typing searches, Escape clears it, and a search made
elsewhere is written back into the box. The box is a `role="search"`
landmark labelled by the `searchLabel` text, "Search grid" by default;
give each grid its own `aria-label` when a page has several.
Enter applies the text at once; when a search changes the rows, a live
region announces the match count ("12 rows match", `localeText.searchMatches`).
`DataGridSearchBox` renders the same box elsewhere: inside the grid's subtree
it finds the grid itself, outside it takes the grid's `api` (the grid ref).
Its `debounce` (ms, default 0) delays typed text, `aria-label` names the
landmark and `onBeforeSearch` can skip a search with `preventDefault()`.

```tsx
const [api, setApi] = useState<DataGridApi<Order> | null>(null);

<DataGridSearchBox api={api} debounce={200} aria-label="Search orders" />
<DataGrid onReady={setApi} data={orders} columns={columns} search />
```

## Options

- `search.text` is the search text. It is reactive and part of the
  server render, so a grid can render already searched.
  `onBeforeSearchChange` can cancel a change with `preventDefault()`;
  `onSearchChange` reports the `text` and the `previousText`.
- `search.fields` lists the searched columns. By default every
  searchable column except date columns is searched; a column opts out with
  `searchable: false`.
- `search.operator` is `'contains'` (the default), `'startsWith'`,
  `'endsWith'`, `'equal'`, `'notEqual'`, `'wildcard'` or `'like'`, with the
  filter operator names. `'wildcard'` matches a pattern where `*` is any run
  of characters and `?` one character (`T*o` finds "Tokyo"); `'like'` is the
  SQL form where `%` (or `*`) is any run (`%abc`, `abc%`, `%abc%`). Both
  match the whole value, and number columns match their
  digits (`1%` finds 10 and 12).
  `search.matchCase` (default `false`) makes the match case-sensitive and
  `search.ignoreAccents` folds accents, so "jose" finds "José".

`api.search(text)` searches and `api.clearSearch()` clears the search;
`api.search('')` clears it as well.

## Highlighting matches

`search.highlight: true` wraps each match of the applied search in a
`<mark class="salmon-data-grid-search-mark">` inside the displayed text of the
searched columns, without a cell template. The matches
follow the search: the operator (`contains` marks every occurrence,
`startsWith` and `endsWith` the start or the end, `equal`, `wildcard` and
`like` the whole text, `notEqual` nothing), `matchCase` and `ignoreAccents`, so with accents
ignored "jose" marks "José". Only rendered cells compute their marks, so the
cost follows the visible cells, not the row count, and with the option off
nothing is computed. `<mark>` is announced as highlighted text by screen
readers that support it; forced-colors mode uses the system `Mark` colors.
A `renderCell` template renders as given.

<!-- demo: search -->

## Server-side search

With a remote data source the search (text, fields, operator, case and
accent options) is part of every read request, next to the filters and the
page, and the server applies it. The request log of the
[server-side filtering demo](/docs/data-grid/filtering) shows it.

## API reference

See [`DataGridSearch`](/docs/reference/data-grid/DataGridSearch),
[`DataGridSearchBoxProps`](/docs/reference/data-grid/DataGridSearchBoxProps)
and [`DataGridSearchChangeEvent`](/docs/reference/data-grid/DataGridSearchChangeEvent)
in the API reference.