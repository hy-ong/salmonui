---
title: Tree View checkboxes
description: Tri-state checkboxes with cascade or independent propagation, disabled-item rules, check on click, reactive checked ids, cancellable events, check-all commands and form submission with reset.
category: Tree View
order: 30
demos: [tree-view-checkboxes]
---

`checkable` shows a checkbox on every row; rows carry `aria-checked`. Space toggles the focused item, a click
on the checkbox toggles it, and with `checkOnClick` a click anywhere on the
row does.

<!-- demo: tree-view-checkboxes -->

## Propagation

`checkPropagation`:

- `'cascade'` (default): checking a parent checks its subtree; a parent is
  checked when all its leaves are, `aria-checked="mixed"` when some are.
- `'none'`: every item is independent.

The cascade does not visit each descendant: the tree keeps checked-leaf
counts per parent and marks the subtree lazily, so checking a parent of
100,000 descendants costs O(depth) and stays within 16 ms.

`cascadeToDisabled` (default `true`): when `false`, a cascade leaves disabled descendants as they are and
they do not count toward their parent's state. Disabled items cannot be
toggled by the user either way.

Children loaded later under a checked parent come checked.

## State and events

`checked` is a reactive id list; `defaultChecked` sets the initial ids when
`checked` is not given. `onBeforeCheckedChange({ id, item, checked,
source })` runs before a user toggle and `event.preventDefault()` cancels it.
`onCheckedChange({ checked, id, item, source })` reports every checked id
afterwards: fully checked parents included, mixed ones not. `event.checked`
is computed on first read, so a handler that ignores it costs nothing.

```tsx
const [checked, setChecked] = useState<readonly TreeViewKey[]>([]);
<TreeView checkable checked={checked} onCheckedChange={(e) => setChecked(e.checked)} /* ... */ />
```

The API: `api.getCheckedIds()`, `api.checkAll(ids?)` and
`api.uncheckAll(ids?)` (every item when `ids` is omitted); both report
`onCheckedChange` with `id: null` and `source: 'api'`.

## Forms

With `name`, the tree renders one `<input type="hidden" name value>` per
checked id, so the cost follows the selection, not the tree. `form` links
the inputs to a form by id. The owning form's `reset` restores
`defaultChecked` (or the `checked` ids of the first render).

```tsx
<form onSubmit={(e) => console.log(new FormData(e.currentTarget).getAll('folders'))}>
  <TreeView checkable name="folders" defaultChecked={['docs']} /* ... */ />
  <button>Save</button> <button type="reset">Reset</button>
</form>
```

## Server rendering

Checked state is derived from `checked` / `defaultChecked` during render,
so checkboxes, `aria-checked` and the hidden form inputs are in the server
markup and hydrate without warnings.

## API reference

`checkable`, `checkPropagation`, `cascadeToDisabled`, `checkOnClick`,
`checked`, `defaultChecked`, `onBeforeCheckedChange`, `onCheckedChange`,
`name`, `form` and the `TreeViewApi` check methods are in the
[`@salmonui/navigation/tree-view` reference](/docs/reference/navigation/tree-view);
imports and styles are on the [Tree View](/docs/navigation/tree-view) page.
