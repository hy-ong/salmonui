---
title: Tree View
description: TreeView renders hierarchical data as a virtualized WAI-ARIA tree with nested or flat data, single or multiple selection, reactive expanded and selected ids, the full APG keyboard model, RTL, a ref API and server rendering of the first window.
category: Tree View
order: 10
demos: [tree-view-basics, tree-view-large, tree-view-flat-data, tree-view-interaction]
---

```tsx
import { TreeView } from '@salmonui/navigation/tree-view';
import '@salmonui/navigation/tree-view/styles.css';

<TreeView
  aria-label="Folders"
  data={folders}
  getItemId={(f) => f.id}
  getItemLabel={(f) => f.name}
  getChildren={(f) => f.children}
  height={400}
/>
```

`@salmonui/navigation/tree-view` is self-contained: it loads neither the Data
Grid nor another component family. Its stylesheet needs nothing besides
`@salmonui/core/styles.css`, which every app imports once.

<!-- demo: tree-view-basics -->

## Data

`data` is application owned; the tree never copies or changes it. Two shapes
are supported:

- **Nested**: `getChildren(item)` returns the children of an
  item.
- **Flat, self-referential**: `getParentId(item)`
  returns the parent id; `null`, `undefined` or an unknown id makes a root.
  The parent index is built once per `data` identity, in O(n).

`getItemId(item)` returns a stable, unique id (`string | number`).
Every piece of state (expanded, selected, checked, focus) is kept by id, so
it survives a new `data` array. A duplicate id logs one development
warning. `getItemLabel(item)` is the accessible name, the typeahead text and
the sort key (default: `String(id)`).

Accessors are read again whenever `data` changes; passing new inline
functions with the same `data` does not rebuild the model.

Children are flattened into the visible order only while their parent is
expanded (load on demand, always on). `hasChildren(item)`
shows the expand twisty before any child is known; with `loadChildren` the
first expand loads them ([Lazy loading](/docs/navigation/tree-view-loading)).

Items carry no state fields: expanded, selected and checked state are id
lists the application derives from its data:

```tsx
const expandedIds = useMemo(() => flatten(folders).filter((f) => f.open).map((f) => f.id), [folders]);
<TreeView expanded={expandedIds} /* ... */ />
```

## Expansion

`expanded` is a reactive id list: the tree applies it whenever the array
identity changes, and keeps its own changes when the prop does not follow.
`onBeforeExpandedChange({ id, item, expanded, source })` runs first
and `event.preventDefault()` cancels; `onExpandedChange({ expanded, id, item,
source })` reports every expanded id afterwards:

```tsx
const [expanded, setExpanded] = useState<readonly TreeViewKey[]>(['docs']);
<TreeView expanded={expanded} onExpandedChange={(e) => setExpanded(e.expanded)} /* ... */ />
```

`expanded` and `selected` are reactive rather than strictly controlled:
without the prop the tree keeps its own state (starting empty), with the
prop the tree starts from it and re-applies it whenever you pass a new
array. There is no `defaultExpanded` or `defaultSelected`; pass the initial
array once and update it from the change event when you need to read it.

`expandOn` picks what toggles a parent besides its twisty:
`'auto'` (default: double-click with a mouse, a tap on touch), `'click'`,
`'doubleClick'` or `'none'` (twisty and keyboard only). Collapsing a parent
that contains the focused item moves focus to the parent.

`api.expandAll({ ids, level })` and `api.collapseAll({ ids, level })`
 change many items with one store update and one flatten; `level`
is 1-based (`expandAll({ level: 2 })` opens the first two levels,
`collapseAll({ level: 2 })` closes level 2 and deeper).

## Selection

`selection` is `'single'` (default), `'multiple'` or `'none'`.
`selected` is a reactive id list; `onBeforeSelectedChange({ selected, id,
item, source })` is cancellable and `onSelectedChange` reports the new list.

| Input | Single | Multiple |
| --- | --- | --- |
| Click, Enter | select the item | select only the item |
| Ctrl/Cmd+click, Space | select | toggle the item |
| Shift+click, Shift+Space | select | range from the anchor |
| Shift+ArrowUp/Down | move | move and extend the range |
| Ctrl/Cmd+Shift+Home/End | move | range to the first / last item |
| Ctrl/Cmd+A | — | select every enabled item |

Disabled items (`isItemDisabled`) stay focusable with
`aria-disabled="true"` but cannot be selected, checked, expanded, renamed
or dragged; `disabled` disables the whole tree.

`rowHighlight` is `'full'` (default, full-row selection): the
whole row shows hover and selection; `'label'` highlights the label
only.

`onItemClick({ id, item, source })` fires on a click or Enter.

## Keyboard

The WAI-ARIA APG Tree View keys. Focus is tracked by id, not by DOM
position, so it survives scrolling, expansion and new data.

| Key | Action |
| --- | --- |
| ArrowDown / ArrowUp | next / previous visible item |
| ArrowRight | expand a collapsed parent; on an expanded parent, move to its first child |
| ArrowLeft | collapse an expanded parent; otherwise move to the parent |
| Home / End | first / last visible item |
| `*` | expand every sibling of the focused item |
| a printable character | typeahead on `getItemLabel` (case and accents ignored) |
| Enter | select, `onItemClick`, follow the item's link |
| Space | check (with `checkable`) or select / toggle |
| F2 | rename (with `renamable`) |
| Alt+arrows | move the item (with `draggable`, see [Drag and drop](/docs/navigation/tree-view-drag-drop)) |

Under `dir="rtl"` (inherited from any ancestor) ArrowRight and ArrowLeft are
mirrored and the twisty points the other way.

A native `onKeyDown` on the tree runs before the built-in keys;
calling `event.preventDefault()` skips the built-in
behavior for that key.

## Accessibility

The DOM is a flat list of `role="treeitem"` rows inside `role="tree"`:
under virtualization the `group` containers cannot be rendered,
so every row carries `aria-level`, `aria-setsize` and `aria-posinset`.
Parents carry `aria-expanded`, selectable rows `aria-selected`, checkable
rows `aria-checked` (`"mixed"` for partially checked parents), the tree
`aria-multiselectable` with multiple selection and `aria-busy` while a lazy
load runs. Give the tree a name with `aria-label` or `aria-labelledby`.

The tree has exactly one tab stop (roving `tabindex`). The focused row stays
rendered when it scrolls out of the window, so focus never falls to
`<body>`; `aria-activedescendant` is not used.

## API

`ref` receives a `TreeViewApi` with the commands props cannot express:

```tsx
const tree = useRef<TreeViewApi<Folder>>(null);
tree.current?.scrollToItem('2026-receipts'); // expands the ancestors, scrolls the virtual list
tree.current?.focusItem('cv');
tree.current?.getItem('cv'); // { item, id, level, parentId, expanded, selected, checked, disabled, visible }
tree.current?.expandAll({ level: 1 });
tree.current?.getCheckedIds();
tree.current?.startRename('cv');
```

There is no method that returns the tree data: the full data stays with
the application, which already holds it.
Every method and type is listed in the
[`@salmonui/navigation/tree-view` reference](/docs/reference/navigation/tree-view)
(`TreeView`, `TreeViewApi`, `TreeViewProps`, the event types,
`TREE_VIEW_DEFAULT_LOCALE_TEXT` and the `moveTreeItems` helper).

## Virtualization and layout

The list is virtualized by default: only the rows in view plus an
overscan are rendered, over fixed 32 px rows. Give the tree a `height`
(number of px or a CSS length) or size it with CSS. `virtualize={false}`
renders every visible item, for short trees that must be searchable with
the browser's find.

`textWrap` lets labels wrap; row heights are then measured after
each render and kept per id.

`sort` orders siblings by `getItemLabel` with the locale's
`Intl.Collator` (`'asc'`, `'desc'`, or `null` for data order); `locale`
picks the collator.

<!-- demo: tree-view-large -->

## Server rendering

The server renders the first window of visible items (by a numeric
`height`, else 20 rows) with the correct `aria-setsize` / `aria-posinset`,
and the client hydrates the same window without warnings. Lazy loads of
initially expanded items start after mount, never on the server.

## Localization

`localeText` overrides `TREE_VIEW_DEFAULT_LOCALE_TEXT` (`loading`,
`loadError`, `retry`, `rename`, `moved`).

## Performance

Budgets: the subpath's
initial JavaScript is ≤ 12 KB gzip (rename ≤ 2 KB and drag and drop ≤ 5 KB
load on first use), CSS ≤ 2.5 KB; mounting 100,000 nodes ≤ 50 ms to the
first painted window, expanding 10,000 children ≤ 16 ms of work,
`expandAll` over 100,000 nodes ≤ 100 ms to painted, a cascade check of
100,000 descendants ≤ 16 ms of work and a typeahead keystroke ≤ 8 ms.
Expanding splices the new rows into the visible order; a cascade check
updates counts along the ancestor path and resolves the subtree lazily.
