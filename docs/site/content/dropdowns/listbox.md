---
title: Listbox
description: A persistent single- or multiple-selection list with APG keyboard support, checkboxes, select all, a selection limit, disabled items, form submission and styling parts.
category: Listbox
order: 10
demos: [listbox-basic, listbox-grid, listbox-options]
---

`Listbox` is a list that is always on the page, not in a popup.
It follows the WAI-ARIA Authoring
Practices listbox pattern and ships from its own subpath, so an application
that does not use it pays nothing for it:

```tsx
import { Listbox } from '@salmonui/dropdowns/listbox';
import '@salmonui/dropdowns/listbox/styles.css';
```

<!-- demo: listbox-basic -->

## Data and accessors

`data` is an array that `Listbox` never copies. Objects with `value` and
`label` fields need no configuration; a primitive array
(`string[]`, `number[]`, `boolean[]`) uses each primitive as both value and
label:

```tsx
<Listbox data={['Small', 'Medium', 'Large']} aria-label="Size" />
```

Other shapes are read through the `getItemValue` and `getItemLabel`
accessor functions. Nested fields need no string
paths: the accessor reads them directly:

```tsx
<Listbox
  data={countries}
  getItemValue={(c) => c.Country.Code}
  getItemLabel={(c) => c.Country.Name}
  isItemDisabled={(c) => !c.shipping}
  getItemIcon={(c) => <Flag code={c.Country.Code} />}
  aria-label="Country"
/>
```

Keep accessors stable (module scope or `useCallback`) so the list does not
re-index on every render.

- `isItemDisabled(item)` (default: the `disabled` field) is evaluated on
  render, so it is reactive. Disabled options carry `aria-disabled`, cannot
  be selected and are skipped by the arrow keys and type-ahead.
- `getItemIcon(item)` returns a `ReactNode` shown before the label;
use `renderItem`
  ([Listbox data and templates](/docs/dropdowns/listbox-data#templates)) for
  anything richer.
- Item values must be unique. In development a
  duplicate value logs one warning naming the duplicates.

<!-- demo: listbox-options -->

## Single and multiple selection

Single selection is the default; `multiple` turns on multiple selection.

The value holds item values, never the item objects: one `ListboxKey` (or
`null`) in a single list, an array of them with `multiple`. It is
controlled with `value` plus `onValueChange`, or uncontrolled with
`defaultValue` (switching between the two logs a development warning):

```tsx
const [value, setValue] = useState<ListboxKey | null>(null);
<Listbox data={fruits} value={value} onValueChange={(next) => setValue(next)} aria-label="Fruit" />;

const [basket, setBasket] = useState<readonly ListboxKey[]>([]);
<Listbox data={fruits} multiple value={basket} onValueChange={(next) => setBasket(next)} aria-label="Basket" />;
```

`onValueChange(value, event)` receives a frozen event with `reason`
(`'select'`, `'deselect'`, `'selectAll'`, `'clear'` or `'reset'`), `source`
(`'pointer'`, `'keyboard'`, `'touch'` or `'api'`), the loaded `items` of the
new value and the `previousValue`.

### Checkboxes, select all and the selection limit

- `indicator` picks the selected-option marker: `'check'` (default) or
  `'checkbox'`.
  `indicatorPosition` (`'start'` default, or `'end'`) places it at the
  inline start or end; both mirror in right-to-left layouts.
- `showSelectAll` adds a tri-state "Select all" checkbox above a multiple
  list. It selects every enabled item, or clears the selection
  when all are selected. To select all from code, set `value`.
- `maxSelected` caps the number of values. Once the limit is reached the unselected
  options become unavailable, and an attempt to select past it (click,
  Space, a range or select all) announces `localeText.selectionLimit` in a
  polite live region.

The other events live on the feature pages: `onSearchChange` and
`onLoadError` on [Listbox search, grouping and remote
data](/docs/dropdowns/listbox-data), and `onReorder`, `onItemDragStart`,
`onItemDrag` and `onItemDrop` on [Dual list and
reordering](/docs/dropdowns/dual-list).

## Height

The list shows `maxVisibleItems` items (default 8) and scrolls beyond that;
`style.height` (or a `className`) sets an explicit height instead.
Page Up and Page Down move by
`maxVisibleItems`.

## Keyboard

`Listbox` uses the APG recommended multi-select model. On macOS,
Cmd replaces Ctrl.

| Key | Single | Multiple |
| --- | --- | --- |
| Down / Up | Move focus and select (selection follows focus) | Move focus |
| Ctrl+Down / Ctrl+Up | Move focus without selecting | Move focus |
| Home / End | First / last enabled option, selected | First / last enabled option |
| Page Down / Page Up | Move by `maxVisibleItems`, selected | Move by `maxVisibleItems` |
| Space / Enter | Select | Toggle the focused option |
| Shift+Down / Shift+Up | | Move focus and toggle the option it lands on |
| Shift+Space | | Select the range from the anchor (the last option toggled by click, Space or Shift+arrow; plain focus moves keep it) to the focused option |
| Ctrl+Shift+Home / End | | Select from the focused option to the first / last option |
| Ctrl+A | | Select all enabled options; when all are selected, clear the selection |
| Printable characters | Type-ahead: focus and select the next matching option | Type-ahead: focus the next matching option |
| Alt+Down / Alt+Up | Reorder ([Dual list](/docs/dropdowns/dual-list)) | Reorder the selected options |

Type-ahead is a locale-aware prefix match (`Intl.Collator`) with
a 500 ms buffer; repeating one letter cycles through the options that start
with it. It skips disabled options and works on virtual lists, where the
matching option is scrolled into view.

Pointer: a click selects in a single list and toggles in a multiple list;
Shift+click in a multiple list selects the range from the anchor.

## Grid layout: controls inside items and tile galleries

An APG listbox option may not contain buttons or links. When the items of a
selectable list hold their own controls (item templates with buttons),
or when the items are tiles laid out several per
row (a gallery in a popover), set `layout="grid"`. The list then
follows the APG Grid pattern: the focusable element is `role="grid"`, each
row of `columns` items (default 1) is a `role="row"`, and each item is a
`role="gridcell"` with `aria-selected`.

<!-- demo: listbox-grid -->

```tsx
<Listbox
  layout="grid"
  data={messages}
  value={selected}
  onValueChange={setSelected}
  aria-label="Messages"
  renderItem={({ item, label }) => (
    <span className="message-row">
      <span>{label}</span>
      <button type="button" aria-label={`Star ${label}`} onClick={() => star(item.value)}>☆</button>
    </span>
  )}
/>

<Listbox layout="grid" columns={4} data={swatches} maxVisibleItems={3} aria-label="Accent swatch" />
```

| Key | On the grid | On a control inside a cell |
| --- | --- | --- |
| Down / Up | The same column of the next / previous row (a shorter last row clamps) | Back to the grid, next / previous row |
| Right / Left | Right: the cell's first control, else the next cell of the row; Left: the previous cell. Mirrored in right-to-left layouts | Next / previous control; Left on the first control returns to the cell, Right on the last moves to the next cell |
| Home / End | First / last cell of the row | |
| Ctrl+Home / Ctrl+End | First / last cell | |
| Page Down / Page Up | Move by `maxVisibleItems` rows | |
| Space / Enter | Select (single) or toggle (multiple) the active cell | Belong to the control |
| Shift+Space, Ctrl+A | Range from the anchor, select all (multiple) | |
| Tab | The active cell's controls, then out of the list | The next control of the active cell, then out of the list |
| Escape | | Back to the grid on the same cell |
| Printable characters | Type-ahead moves the active cell | Belong to the control |

- Selection does not follow focus in the grid layout: the arrow keys only
  move the active cell, so browsing a gallery does not apply every tile.
- Only the active cell's controls are in the Tab order; the controls of the
  other cells get `tabindex="-1"` until their cell becomes active. A click
  on a control makes its cell active without changing the selection; a
  click elsewhere in the cell selects it.
- Text fields inside a cell keep every key except Escape.
- Rows are one fixed-height unit for the virtual list (above 100 items by
  default), so `maxVisibleItems` counts rows. Size tiles with
  `styles.option` or `classNames.option`; the row is a CSS grid of
  `columns` equal tracks (`.salmon-listbox-row`).
- The grid layout has no group headers and no reordering: `getItemGroup`,
  `reorderable` and `dragGroup` are list-layout features and are ignored,
  with a development warning.

## Accessibility

The focusable element has `role="listbox"`, with `aria-multiselectable` on
a multiple list, and each option has `role="option"` with `aria-selected`
and `aria-disabled`. Name the list with `aria-label` or
`aria-labelledby`.

Focus stays on the listbox element; the active option is announced through
`aria-activedescendant`. Under virtualization the active option is always
mounted, even when it is scrolled out of view, so the reference never
dangles. Options carry `aria-setsize` and `aria-posinset`, so a
screen reader announces "12 of 10,000" while only a window of options is in
the DOM. A remote list sets `aria-busy` while it loads.

`disabled` disables the whole list and `readOnly` keeps it focusable while
blocking changes (`aria-readonly`); `required` sets `aria-required`. With
`layout="grid"` the roles are those of the grid layout above.

## Styling and parts

`className` and `style` go to the root element. `classNames` and `styles`
target the parts: `root`, `search`, `selectAll`, `list`, `option`, `group`,
`groupHeader` and `empty`:

```tsx
<Listbox
  data={fruits}
  className="fruit-list"
  classNames={{ option: 'fruit-option' }}
  styles={{ list: { maxBlockSize: 320 } }}
  getItemProps={(item, { selected }) => ({ title: item.label, 'data-selected': selected })}
  aria-label="Fruit"
/>
```

`getItemProps(item, { selected, disabled })` returns per-option
`className`, `style`, `title` and `data-*` attributes. It is pure and runs
for rendered options only.

The `ref` receives the `role="listbox"` element (`role="grid"` with
`layout="grid"`), so `ref.current.focus()` focuses the list. Colors come
from the theme
([Appearance](/docs/data-grid/appearance)).

## Forms

With `name`, `Listbox` renders a hidden native `<select>` that submits the
value with its form (one entry per value in a multiple list); `required`
and `form` work as on native fields. Resetting the owning form restores
`defaultValue` and fires `onValueChange` with reason `'reset'`:

```tsx
<form action="/order">
  <Listbox data={fruits} name="fruit" required defaultValue="banana" aria-label="Fruit" />
  <Listbox data={fruits} name="basket" multiple defaultValue={['apple', 'kiwi']} aria-label="Basket" />
  <button type="reset">Reset</button>
  <button type="submit">Order</button>
</form>
```

## Localization

Static texts come from `localeText`, a partial `ListboxLocaleText` merged
over `LISTBOX_DEFAULT_LOCALE_TEXT`: `noData`, `noResults`, `loading`,
`loadError`, `retry`, `searchLabel`, `selectAll`, `resultCount` (`{count}`,
plural forms by `Intl.PluralRules`), `selectionLimit` (`{max}`) and `moved`
(`{label}`, `{position}`, `{count}`). It is plain JSON, safe to pass from a
server component:

```tsx
<Listbox
  data={fruits}
  multiple
  showSelectAll
  localeText={{ selectAll: 'Alle auswählen', noData: 'Keine Einträge', resultCount: { one: '1 Treffer', other: '{count} Treffer' } }}
  aria-label="Obst"
/>
```

## Server rendering

`Listbox` is a client component that renders on the server (Next App
Router, Vite SSR): the options, the selected state, the ids (`useId`) and
the hidden `<select>` are deterministic, so hydration matches. The search
index, the grid-layout keyboard code and the drag code are separate chunks
loaded after hydration. A remote source renders its loading state on the
server and starts reading on the client.

## Changing data and selection from code

`Listbox` has no imperative data or selection methods. The
application owns `data` and `value`; a copy mutated inside the component
would disagree with them, and lookups by value are plain array work. Every
task goes through the controlled props:

| Task | How |
| --- | --- |
| Add items | `setData([...data, ...items])` |
| Remove items | Filter `data` |
| Disable items | `isItemDisabled` |
| Select values | `setValue(values)` |
| Read the items | The `data` array |
| Read the items sorted | Sort `data` yourself |
| Find items by value | Look up in `data`, or read `event.items` |
| Filter the list | Filter `data`, or use `searchable` |

Moving items is two pure functions from `@salmonui/dropdowns/listbox`,
since list order lives in your array; pure functions are
testable without a component and work for any number of lists:
`reorderItems(list, values, delta)` returns the reordered array and
`moveItems(source, target, values, index?)` returns `[nextSource,
nextTarget]` (both take an optional last `getItemValue`). Moving the
selected items up one place:

```tsx
setItems(reorderItems(items, selected, -1));
```

A large `delta` moves them to the top or bottom. The
[dual list](/docs/dropdowns/dual-list) recipe uses `moveItems`. Every prop
and type is listed in the [API reference](/docs/reference/dropdowns/listbox).
