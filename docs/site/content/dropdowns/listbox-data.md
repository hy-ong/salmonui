---
title: Listbox search, grouping and remote data
description: Search with operators and accent folding, grouped lists with a sticky header, the virtual list, remote @salmonui/data sources and item, empty, loading and error templates.
category: Listbox
order: 20
demos: [listbox-search, listbox-remote]
---

This page covers the `Listbox` features that change which items are shown
and where they come from. The basics (data, selection, keyboard, forms) are
on [Listbox](/docs/dropdowns/listbox).

<!-- demo: listbox-search -->

## Search

`searchable` adds a search field above the list that filters it.
Focus moves
between the field and the list with Tab; the arrow keys, Page Up / Down and
Enter in the field act on the list, and Escape clears the text.

```tsx
<Listbox
  data={places}
  searchable
  searchOperator="contains"
  ignoreAccents
  highlightMatches
  searchPlaceholder="Search places"
  onSearchChange={({ text }) => setText(text)}
  aria-label="Places"
/>
```

| Prop | Default | Meaning |
| --- | --- | --- |
| `searchOperator` | `'startsWith'` | How the text matches: `'startsWith'`, `'contains'`, `'endsWith'`, or a predicate `(item, text) => boolean` |
| `matchCase` | `false` | Case-sensitive matching |
| `ignoreAccents` | `false` | Accent-insensitive matching: `cafe` matches `Café`; labels are folded once into the search index |
| `searchPlaceholder` | none | Placeholder of the search field |
| `onSearchChange({ text })` | | Reports the search text |
| `highlightMatches` | `false` | Wraps the matched text of each label in `<mark>` |
| `maxResults` | none | Caps the number of listed items |

Local data filters synchronously on every keystroke. For custom filtering,
either pass a predicate as `searchOperator`, or listen to `onSearchChange`
and pass the filtered array as `data` yourself. Clearing the text restores the
full list. After each search a polite live region announces the
number of results (`localeText.resultCount`).

## Grouping

`getItemGroup(item)` (default: the `group` field) puts items under group
headers. Items of one group
must be contiguous in `data`: the list is never re-sorted, so sort the data
by group first (a split group logs a development warning). Each group is a
`role="group"` element labelled with its name. On the virtual list a sticky
header at the top shows the group of the first visible item while
scrolling; a short list shows only the inline headers.
`renderGroupHeader({ group })` replaces the header content. Group headers
apply to local data only.

```tsx
<Listbox data={cities} getItemGroup={(city) => city.region} renderGroupHeader={({ group }) => <strong>{group}</strong>} aria-label="City" />
```

**Grouping in Mention.** `Listbox`, `Select`
and `Combobox` group; `Mention` does not. Its
entry sits just under its size budget, and the group model and sticky
header do not fit, so performance comes first. To show groups in Mention,
put the group in each suggestion through `renderItem` (for example a label
prefix such as "Sales · Ana"), or use one of the grouping components.

## Virtualization

Above 100 items `Listbox` renders a virtual list: only the visible options
plus an overscan are in the DOM, however long `data` is. Virtualization is the
default for `Listbox`. Options keep
`aria-setsize` and `aria-posinset` for the whole list, and the active option
stays mounted for `aria-activedescendant`.

- The virtual path needs one fixed item height. It is measured from the
  first rendered option, so item templates must all have the same height.
  `virtualization={false}` renders every option for lists of varying
  heights; `virtualization` forces the virtual path for short lists.
- Searching resets the window to the top and stays on the virtual path.
- Type-ahead and keyboard navigation work on the virtual list: the target
  option is scrolled into view.

## Remote data

`data` also accepts any `@salmonui/data` source, such as
`createJsonDataSource` or `createOfflineDataSource`, instead of an array.
The list reads the
visible range through the source and keeps a bounded block cache; the
response's `totalRowCount` sizes the scroll range and `aria-setsize`.

```tsx
import { createJsonDataSource } from '@salmonui/data';
import { Listbox } from '@salmonui/dropdowns/listbox';
import '@salmonui/dropdowns/listbox/styles.css';

const customers = createJsonDataSource<Customer>({
  url: '/api/customers',
  key: 'value',
  onRequest: (e) => console.debug('read', e.request),
  onError: (e) => console.error(e.error),
});

<Listbox
  data={customers}
  searchable
  searchOperator="contains"
  searchFields={['label', 'email']}
  minSearchLength={2}
  query={{ filters: [{ columnId: 'active', operator: 'equal', value: true, predicate: 'and' }], sorting: [{ columnId: 'label', direction: 'asc' }] }}
  onLoadError={(error) => report(error)}
  aria-label="Customer"
/>;
```

- `query` holds base filters and sort in the `@salmonui/data` query model,
  merged into every read.
- The search text becomes the read's `search` (operator, `matchCase`,
  `ignoreAccents`) over `searchFields` (default `['label']`).
- Remote searches are debounced by `debounce` milliseconds (default 300;
  `0` sends on every keystroke). Local data is never debounced.
- `minSearchLength` holds back searches shorter than the given length.
- A newer search or range aborts the superseded read through its
  `AbortSignal`, and late responses are dropped. Clearing the text aborts
  the pending search.
- While a read is pending the list sets `aria-busy` and shows the loading
  state; `loading` forces it.
- A failed read calls `onLoadError(error)` and shows `renderError({ error,
  retry })` (default: `localeText.loadError` with a Retry button). To
  observe each read before it starts, after it succeeds and when it fails,
  use the source hooks `onRequest` / `onResponse` / `onError` plus
  `onLoadError` on the component.

Keyboard reorder and drag and drop are off for remote sources: the
application does not own the array.

<!-- demo: listbox-remote -->

## Templates

| Prop | Renders |
| --- | --- |
| `renderItem(state)` | The content of each option. `state` holds `item`, `value`, `label`, `selected`, `active`, `disabled` and `matches`, the `[start, end)` ranges of the search text in `label` with `highlightMatches` |
| `renderGroupHeader({ group })` | Group headers |
| `renderEmpty({ reason })` | The empty list: `reason` is `'noData'` or `'noMatch'` (defaults: `localeText.noData`, `localeText.noResults`) |
| `renderLoading()` | The loading state of a remote list |
| `renderError({ error, retry })` | A failed remote read |
| `getItemIcon(item)` | An icon before the default label |
| `getItemProps(item, state)` | Per-option `className`, `style`, `title` and `data-*` |

```tsx
<Listbox
  data={people}
  searchable
  highlightMatches
  renderItem={({ item, label, matches }) => (
    <span className="person">
      <img src={item.avatar} alt="" width={20} height={20} />
      <Highlight text={label} ranges={matches} />
    </span>
  )}
  renderEmpty={({ reason }) => (reason === 'noMatch' ? 'Nobody by that name' : 'No people yet')}
  aria-label="Person"
/>
```

On the virtual list every option must render at the same height.

Every prop and type is listed in the
[API reference](/docs/reference/dropdowns/listbox).
