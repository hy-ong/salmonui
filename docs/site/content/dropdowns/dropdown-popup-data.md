---
title: Data, search and the popup
description: Data and accessors, item-key values, list order, search and type-ahead, controlled and remote filtering, remote sources and value labels, virtualization limits, popup size, placement, stacking and dismissal across Select, Combobox, Listbox, Mention and TreeSelect.
category: Guides
order: 65
demos: [dropdown-popup]
---

The dropdowns share one collection model, one search index, one virtual
list and one overlay, so the rules on this page hold for every component
that has the feature.

<!-- demo: dropdown-popup -->

## Data and accessors

`data` is an array the components never copy. Objects with `value` and
`label` fields need no configuration, in `Select`, `Combobox`, `Listbox`,
`Mention` triggers and `Combobox columns` alike; other shapes use
`getItemValue` and `getItemLabel`. `getItemIcon(item)` returns a
`ReactNode` shown before the label in `Select`, `Combobox`, `Listbox` and
`TreeSelect`; `Mention` draws icons in `renderItem`:

```tsx
import { Mention } from '@salmonui/dropdowns/mention';
import '@salmonui/dropdowns/mention/styles.css';

<Mention triggers={[{ char: '@', data: people }]} renderItem={({ item, label }) => <><span className="avatar" data-person={item.value} aria-hidden="true">{label[0]}</span>{label}</>}>
  <textarea aria-label="Comment" />
</Mention>
```

Values are always item keys. One value model keeps `value`,
events, the hidden form element and SSR consistent, while object values
would need a deep comparison on every render and could not be submitted in
a form. Return a string or number from `getItemValue` and read the object
from the change event; `selectedItems` supplies objects for values that
are not loaded.

```tsx
<Select
  data={customers}
  getItemValue={(c) => c.id}
  value={order.customerId}
  onValueChange={(id, event) => setCustomer(event.items[0])}
/>
```

List order is data order: `Select`, `Combobox`, `Listbox`,
`TreeSelect` and `Mention` have no sort option. Sorting 100,000 labels
with a collator on every `data` change would land on the open path, and a
remote source already sorts on the server. Sort once where the array is
built, or set `query.sorting` for a remote source:

```tsx
<Select data={[...items].sort(byName)} />
<Select data={remote} query={{ sorting: [{ columnId: 'name', direction: 'asc' }] }} />
```

## Search

- `Select searchable`, `Listbox searchable` and `TreeSelect searchable` put a
  search field inside the popup or above the list with
  `searchPlaceholder` as its placeholder. In `Combobox` and
  `Mention` the text being typed is the search text.
- Controlled filtering: `onSearchChange` reports the
  text, as `(text, event)` on `Select` and `TreeSelect`, `({ text })` on
  `Listbox` and `({ text, trigger })` on `Mention`; `Combobox` reports it
  through `onInputChange(text, event)`. The parent passes the matching
  `data`, with
  `searchOperator={() => true}` so the component keeps every item it is
  given. A function `searchOperator(item, text)` is the other way to own
  the match.

```tsx
const [text, setText] = useState('');
<Select searchable data={matching(text)} searchOperator={() => true} onSearchChange={(next) => setText(next)} />
```

- Type-ahead: on a closed `Select` printable keys select the next
  option whose label starts with the typed text (`Intl.Collator`, 500 ms
  buffer, spaces included, a repeated letter cycles); in the open popup and
  in `Listbox` they move the active option. On a virtual list the match
  can be anywhere in the data: it is scrolled into view and mounted.
Type-ahead runs over local `data`; on a remote source it is
  off (use `searchable`).

## Remote data

Any `@salmonui/data` source works as `data` of `Select`, `Combobox`,
`Listbox` and `Mention` (`TreeSelect` takes an array and loads children on
demand with `loadChildren`): the popup reads ranges as it scrolls and sends
the search text with the request. A failed read shows an error (with a
Retry button, except in `Mention`) and calls `onLoadError(error)` (`TreeSelect` calls
`onLoadError(error, item)` for a failed `loadChildren`); the source's own
`onRequest`, `onResponse` and `onError` hooks (for example on
`createJsonDataSource`) see every request.

Salmon UI speaks one JSON wire format. Point
`createJsonDataSource({ url })` at an endpoint that implements it (the
`@salmonui/data/server` reference handler does), or pass a custom
`transport` that maps each request to an existing OData or Web API
endpoint.

The `query` prop carries only `filters` and `sorting`. The
virtual list decides which range to read from the scroll position, so the
query never carries a page; use `maxResults` for "first N suggestions".

A value whose item is not loaded takes its label from
`selectedItems` on the server and the first render. Without
`selectedItems`, `Select` and `Combobox` run one read filtered by
`value in [...]` after mount, so the trigger shows the label without the
popup opening (sources keyed by another field pass `selectedItems`).

## Virtualization

Above 100 items the popup and `Listbox` render a window of the list: the
options in the DOM stay at most the visible ones plus two overscans of 6,
carry `aria-setsize` / `aria-posinset`, and the active option
stays mounted when it is scrolled out of view. `virtualization={false}`
renders every option.

- Item height: the virtual list uses one fixed item height,
  measured from a rendered option when the popup opens, so CSS controls
  it. Fixed-height virtualization maps scroll offset to index in constant
  time and needs no measuring while scrolling. Keep item content to one
  line height, or set `virtualization={false}` for lists of a few hundred
  items of varying height.
- Grouping remote data: the components never fetch every row
  to build groups, because a 100,000-row request on open would break the
  performance budget. With `getItemGroup`, a remote source must return
  items ordered by group, so make the group field the first sort of the
  endpoint or `query`. Headers come from the loaded window. For a small
  remote list, load it once with `createOfflineDataSource` and group
  locally.

## Popup size, placement and dismissal

- Height: `maxVisibleItems` (default 8) items; `styles.popup` and
  `classNames.popup` style the popup itself.
- Width: at least the trigger width (`min-inline-size`), `styles.popup`
  widens it.
- Placement: below the trigger and aligned to its inline start
  (mirrored under `dir="rtl"`), flipped above when there is no room below
  and shifted to stay on screen, so a short viewport (an on-screen keyboard)
  keeps the popup and its active option visible. Geometry is measured once
  per open and re-placed at most once per frame while open.
- Stacking: the popup renders in a portal and stacks above
  page content without coordination between components, so there is no
  z-index prop. If one of your own overlays covers the popup, change that
  overlay's stacking in its CSS; `classNames.popup` and `styles.popup`
  remain available as unsupported overrides.
- Dismissal: an outside press, Escape and Tab close the popup;
  Escape never changes the value, and focus stays on (or returns to) the
  trigger or input.

Every prop is in the API reference of
[`select`](/docs/reference/dropdowns/select),
[`combobox`](/docs/reference/dropdowns/combobox),
[`listbox`](/docs/reference/dropdowns/listbox),
[`mention`](/docs/reference/dropdowns/mention) and
[`tree-select`](/docs/reference/dropdowns/tree-select).
