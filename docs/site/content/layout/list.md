---
title: List
description: The display list for read-only content, a server-component ul or ol with item rows that compose Avatar and badges; selection lists are Listbox.
category: Display
order: 30
demos: [list, listview, listview-options, listview-remote]
---

`List` is a styled `<ul>` (or `<ol>` with `ordered`) for content that is
only displayed. It has no JavaScript behavior and renders in React Server
Components. It lives in `@salmonui/layout/list` with its own stylesheet.

```tsx
import { List, ListItem } from '@salmonui/layout/list';
import { Avatar } from '@salmonui/layout/avatar';
import '@salmonui/layout/list/styles.css';
import '@salmonui/layout/avatar/styles.css';

<List aria-label="People">
  <ListItem>
    <Avatar name="Ada Lovelace" size="sm" shape="circle" />
    Ada Lovelace
    <span className="salmon-list-item-description">Mathematician</span>
  </ListItem>
</List>;
```

<!-- demo: list -->

- `.salmon-list-item` is a wrapping flex row, so an `Avatar`, the text and
  a trailing badge or time line up; a child with
  `.salmon-list-item-description` wraps onto its own secondary line.
- Items are separated by a thin line.
- `List.Item` is the same component as `ListItem`.

`List` is for display only. A list the user selects from, checks or navigates with the arrow keys is
`Listbox` ([Listbox](/docs/dropdowns/listbox)), which carries the APG
Listbox keyboard model, selection, virtualization and remote data.

## Interactive items

Items may hold controls: buttons inside a `ListItem` stay in the page's
Tab order, with no roving focus to learn.

```tsx
import { Button } from '@salmonui/buttons/button';

<List aria-label="Invitations">
  <ListItem>
    <Avatar name="Ada Lovelace" size="sm" shape="circle" />
    Ada Lovelace
    <Button size="sm" variant="outline">Accept</Button>
  </ListItem>
</List>
```

## Selectable lists

A selectable list is a `Listbox` from `@salmonui/dropdowns/listbox`. Its props
cover the list features:

- `data` takes objects, strings or numbers; a primitive is its own value
  and label. It can also be an `@salmonui/data` source with
  `query`: range reads, abortable.
- `getItemValue`, `getItemLabel` and `getItemGroup` read the item fields;
`getItemIcon` adds an icon; `isItemDisabled`
  disables items reactively.
- `getItemProps` sets per-item attributes (`title`, `className`, `style`,
  `data-*`).
- `getItemGroup` with `renderGroupHeader` groups items; group headers are
  sticky when virtualized.
- `renderItem({ item, label, selected, active, disabled })` renders each
  item.
- `value` / `defaultValue` / `onValueChange` (`event.items`) hold the
  selection; `multiple` with an array `value` selects several
  items.
- `indicator="checkbox"` shows checkboxes, with
  `indicatorPosition: 'start' | 'end'` (logical, mirrors in RTL); check items through a
  controlled `value`, `showSelectAll` or Ctrl+A.
- `virtualization` renders only the visible items (fixed item height; on
  above 100 items); `maxVisibleItems`, `style` and `className`
  size the list.
- Loading and errors: `aria-busy` with `renderLoading`,
  `renderError({ error, retry })`, `onLoadError` and `renderEmpty`.
A remote source loads ranges while scrolling, and `onScroll`
  passes through.
- The keyboard follows APG Listbox: arrows, Home / End, Space, Ctrl+A,
  Shift+arrows and type-ahead.
- `disabled` disables the whole list; `className` /
  `classNames` / `styles`, the inherited `dir` and `localeText` cover
  styling, RTL and localization.

```tsx
import { Listbox } from '@salmonui/dropdowns/listbox';
import '@salmonui/dropdowns/listbox/styles.css';

<Listbox
  aria-label="Contacts"
  data={contacts}
  getItemValue={(c) => c.id}
  getItemLabel={(c) => c.name}
  getItemGroup={(c) => c.team}
  getItemProps={(c) => ({ title: c.email })}
  multiple
  indicator="checkbox"
  value={checked}
  onValueChange={setChecked}
/>
```

<!-- demo: listview -->

Checkboxes at the inline end are `indicatorPosition="end"`; the position
is logical, so RTL mirrors it.

Icons, per-item attributes, single selection, a fixed height and the
disabled state:

<!-- demo: listview-options -->

A remote source read in ranges, with virtualization, loading and error
states:

<!-- demo: listview-remote -->

The Listbox keyboard model, selection events and every other prop are on
the [Listbox](/docs/dropdowns/listbox) page.

### Not included

These behaviors are left to the application on purpose, because the data
belongs to the application and React owns the lifecycle.

**Hiding items.** Pass a filtered array:
`data={items.filter((item) => item.visible)}`.

**Adding, removing and finding items.** There are no item
mutation methods. Keep items in state, update them with `setItems(...)`,
and look items up in that array.

**Header.** There is no built-in header. Render a heading and
connect it:

```tsx
<h2 id="contacts">Contacts</h2>
<Listbox aria-labelledby="contacts" data={contacts} />
```

**Sorting.** There is no sort option; sort once where the data
lives: `data.toSorted(byName)`, or `query={{ sorting: [{ columnId: 'name',
direction: 'asc' }] }}` on a remote source.

**Nested lists.** Drill-down navigation through child lists is a
mobile navigation pattern rather than a list behavior. Use
[TreeView](/docs/navigation/tree-view) for hierarchical selection, or keep a
`path` state, render the current level in a `Listbox`, and add your own back
button.

**Nested-list animation.** With no nested navigation, there is no
slide animation to configure.

**Item height refresh.** The virtual list uses one fixed item
height, so there is no per-item height to refresh. Set
`virtualization={false}` for lists whose items differ in height.

**HTML encoding.** Content is `ReactNode` and HTML strings are
never parsed, so there is nothing to encode or sanitize. Write JSX in
`renderItem`.

**Persistence.** There is no built-in persistence: `localStorage`
is not readable on the server, so a persisted selection would cause a
hydration mismatch. Save `value` in `onValueChange` and pass it back as a
controlled prop.

**Lifecycle.** A React component unmounts with the tree, so there
is no destroy method: use conditional rendering, and put setup code in an
effect or a ref callback.

API reference: [`@salmonui/layout/list`](/docs/reference/layout/list) and
[`@salmonui/dropdowns/listbox`](/docs/reference/dropdowns/listbox).

The JavaScript is 0.30 KB gzip and the stylesheet 0.32 KB.
