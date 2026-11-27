---
title: TreeSelect
description: TreeSelect from @salmonui/dropdowns/tree-select - a select-only combobox with a tree popup, nested or flat data, lazy children, search that keeps ancestors, templates and forms.
category: Components
order: 70
demos: [tree-select-basics, tree-select-lazy]
---

`TreeSelect` is a dropdown tree, the
[Select](/docs/dropdowns/select) trigger with a tree popup: a native
`<button type="button" role="combobox" aria-haspopup="tree">` owns focus
and the keyboard, and the popup is a WAI-ARIA `role="tree"` driven through
`aria-activedescendant`, so focus never leaves the trigger (or the popup
search field). The tree model (expansion, lazy loading, selection and
tri-state checks) is the one [TreeView](/docs/navigation/tree-view) uses.

```tsx
import { TreeSelect } from '@salmonui/dropdowns/tree-select';
import '@salmonui/dropdowns/tree-select/styles.css';

<label id="office-label">Office</label>
<TreeSelect aria-labelledby="office-label" data={offices} defaultValue="osa" placeholder="Pick an office" />
```

The server renders the trigger, the value and (with `name`) the hidden
form `<select>` only; the popup is a lazy chunk loaded after hydration and rendered only
while open, so nothing in it can cause a hydration mismatch. Every prop is listed in the
[API reference](/docs/reference/dropdowns/tree-select).

<!-- demo: tree-select-basics -->

## Data

Data is nested by default: `getChildren(item)` returns the children, and it
defaults to `item.children`. For self-referential flat rows pass
`getParentId(item)` instead; a row whose parent is `null` or `undefined` is
a root. The accessors read common field names by default:

- `getItemValue` (default `item.value`, else `item.id`): the node value, a
  string or a number. Values are unique across the whole tree.
- `getItemLabel` (default `item.label`, else `item.text`).
- `isItemDisabled` (default `item.disabled === true`): a disabled parent
  disables its whole subtree.
- `isItemSelectable`: nodes it rejects still expand but cannot be chosen.
The demo makes only leaves
  selectable.

```tsx
<TreeSelect data={departments} getParentId={(d) => d.parentId} getItemLabel={(d) => d.name} />
```

Selection and expansion are not read from the data: the value and the
expanded ids are props (below), so the data stays immutable.

## Value and events

`value` / `defaultValue` / `onValueChange(value, event)` is the
[components triad](/docs/buttons/toggle-button): one node value or `null`,
or an array with `multiple` (see
[TreeSelect checkboxes](/docs/dropdowns/tree-select-checkboxes)). The event
is the shared dropdown event `{ source, reason, previousValue, items }`.
`open` / `defaultOpen` / `onOpenChange(open, event)` control the popup, as
on Select. `ref` receives the trigger button, and `onKeyDown` with every
other DOM prop reaches it.

Items of the value that are not in the loaded `data` (children that were
never loaded) take their labels from `selectedItems`.

## Expansion

`expanded` / `defaultExpanded` / `onExpandedChange(ids, { id, item, source })`
hold the expanded node values. `expandOn` decides what a click on
a parent does:

| `expandOn` | Click on a parent row |
| --- | --- |
| `'auto'` (default) | Toggles a parent that is not selectable; selects a selectable one |
| `'click'` | Toggles any parent; Enter or Space selects it |
| `'doubleClick'` | A double-click toggles; a click selects |
| `'none'` | Only the twisty and the arrow keys expand |

When the popup opens with a value, the selected node's ancestors expand and
the node scrolls into view and becomes active. To reveal any other node, add its
ancestors to a controlled `expanded`.

## Load on demand

`hasChildren(item)` shows a twisty before the children are known;
expanding the node calls `loadChildren(item, { signal })`. A
response that arrives after the node was collapsed and reloaded, or after
`data` changed, is dropped, and `signal` aborts the stale request. A
rejected load marks the node with an error and a Retry button and calls
`onLoadError(error, item)`; `renderLoading({ item })` and
`renderError({ error, item, retry })` replace the default status texts.

<!-- demo: tree-select-lazy -->

To load children from a server, read a `@salmonui/data` source per
parent: `read({ parentRowId })` answers
tree envelopes (`TreeRowEnvelope`: `row`, `hasChildren`, ...), and
`loadChildren` unwraps them.

```tsx
import { createJsonDataSource } from '@salmonui/data';
import { EMPTY_GRID_QUERY } from '@salmonui/data-grid/engine';

const folders = createJsonDataSource<Folder>({ url: '/api/folders', key: 'id' });

<TreeSelect
  data={roots}
  hasChildren={(f) => f.hasChildren}
  loadChildren={async (folder, { signal }) => {
    const result = await folders.read({ version: 0, query: EMPTY_GRID_QUERY, parentRowId: folder.id, signal });
    return result.rows.map((envelope) => envelope.row);
  }}
/>
```

## Search

`searchable` puts a search field in the popup: DOM focus moves
into it and typing filters the tree with `searchOperator` (`'startsWith'`
by default, `'contains'`, `'endsWith'` or `(item, text) => boolean`),
`matchCase` and `ignoreAccents`. Matches keep their ancestors visible, so a
match always appears under its path. `searchPlaceholder` labels the field,
`onSearchChange(text, event)` reports the text and `highlightMatches` marks
the matched characters.

## Templates and per-node props

The [Templates](/docs/dropdowns/dropdown-templates) render props apply:

| Part | Template |
| --- | --- |
| Node | `renderItem({ item, label, level, selected, checked, expanded, active, disabled, matches })` |
| Selected value | `renderValue({ items, labels })` |
| Popup header and footer | `popupHeader`, `popupFooter` |
| Empty tree | `renderEmpty({ reason })` (`'noData'` or `'noMatch'`) |
| Load error | `renderError({ error, item, retry })`, per node that failed to load |

Per-node icons and attributes: `getItemIcon(item)` renders an
icon before the label, and `getItemProps(item)` merges `title` (a
tooltip), `data-*`, `className` and `style` onto the `treeitem`. Both are
pure functions of the item, so the server renders the same markup.

Text is always escaped by React and no HTML strings are rendered, so
there are no HTML encoding or sanitizer options: render markup with `renderItem`.

## Popup

The popup renders after a user action only, in a portal in the top layer,
below the trigger (above when there is no room) and at least as wide.
`maxVisibleItems` (default 8) sets its height in rows; the tree is windowed
above 100 shown rows (`virtualization={false}` turns that off). `popupMode`
is `'popover'`, `'sheet'` (a full-screen dialog) or `'auto'` (the sheet on
coarse-pointer phones, decided at open time), as on Select.

The popup always unmounts when it closes (there is no option to keep
its DOM). A
closed popup must cost nothing and is never server-rendered, and a kept DOM
would leave stale ARIA ids in the document. The expanded ids and the value
persist in state, so reopening restores the view. `showTrigger` (default
`true`) shows the chevron.

## Keyboard

| Key | Closed | Open |
| --- | --- | --- |
| Arrow Down / Up | Open | Move the active node |
| Enter, Space, Alt+Down | Open | See below |
| Arrow Right | | Expand a collapsed parent, then move to its first child |
| Arrow Left | | Collapse an expanded parent, else move to the parent |
| Home / End | | First / last shown node |
| Page Down / Page Up | | Move by `maxVisibleItems` |
| Enter | | Select the active node (single closes); a non-selectable parent toggles |
| Space | | Select the node, or toggle its checkbox |
| Alt+Up | | Choose the active node and close |
| Ctrl+A / Cmd+A | | Check or select every node (`multiple`) |
| Letters | | Move to the next matching node (type-ahead) |
| Escape | | Clear the search, then close |
| Tab | | Close and move focus on |
| Delete / Backspace | Clear the value with `clearable` | |

Arrow Right and Left mirror in RTL. Disabled nodes are skipped.

## Accessibility

The popup is an APG tree: `role="tree"` (with
`aria-multiselectable` when `multiple`), rows are `role="treeitem"` with
`aria-level`, `aria-setsize`, `aria-posinset` and `aria-expanded` on
parents, `aria-selected` (or `aria-checked`, including `'mixed'`, with
checkboxes), `aria-disabled`, and `aria-busy` while children load. The
active row stays rendered when it scrolls out of the virtual window, so
`aria-activedescendant` always resolves. The trigger carries
`aria-expanded`, `aria-controls`, `aria-readonly` and `aria-required`.
Label it with `aria-labelledby` or a `<label htmlFor>`; there is no
floating label. The placeholder is hidden from assistive technology.

## Forms and appearance

With `name`, a hidden native `<select>` holds one option per value, so the
value submits with the form, appears in `FormData` and `required` uses
native validation; a form `reset` restores `defaultValue`. `form`,
`disabled`, `readOnly`, `clearable` and `placeholder` behave as on
[Select](/docs/dropdowns/dropdown-forms).

`className` and `style` reach the root; `classNames` / `styles` reach the
parts `root`, `trigger`, `value`, `chip`, `popup`, `tree`, `item` and
`search`. Texts come from `localeText` over
`TREE_SELECT_DEFAULT_LOCALE_TEXT` (the dropdown texts plus
`loadingChildren`), and `locale` formats lists and counts.

`size` (`'sm' | 'md' | 'lg'`, default `'md'`) sets the trigger to 24, 32
or 40 px with 8, 12 or 16 px of inline padding and 14, 16 or 20 px icons,
as on [Select](/docs/dropdowns/select#size); chips follow the size and the
tree rows keep one size.

## Data ownership

There is no method that returns the tree's data: the application already owns `data`, the value and the
expanded ids, so it reads them directly; the event's `items` hold the items
of a new value. There is no sort option either: the tree shows data order, because sorting is a data concern
(a collator sort on every `data` change would land on the open path, and a
remote source already sorts on the server). Sort each level before passing
it, or sort on the server for `loadChildren`. See
[Data, search and the popup](/docs/dropdowns/dropdown-popup-data) for the
data model shared with the other dropdowns.
