---
title: Tree View lazy loading
description: Load children on first expand with loadChildren and an abort signal, show loading and error states with retry, and connect any remote source with one async function.
category: Tree View
order: 40
demos: [tree-view-lazy]
---

`hasChildren(item)` shows the expand twisty before the children are known.
The first expand of such an item
calls `loadChildren(item, { signal })`; the resolved array becomes the
item's children (they may be nested themselves or lazy again). Loaded
children are cached by id: collapsing and expanding again does not reload.

```tsx
<TreeView
  data={roots}
  getItemId={(f) => f.id}
  getItemLabel={(f) => f.name}
  hasChildren={(f) => f.hasChildren}
  loadChildren={(f, { signal }) => fetch(`/api/folders/${f.id}`, { signal }).then((r) => r.json())}
  onLoadError={(error, item) => report(error, item.id)}
/>
```

<!-- demo: tree-view-lazy -->

While a load runs, the item shows the localized `loading` text and carries
`aria-busy="true"`, as does the tree. Each request has a version and an
`AbortController`: a request superseded by a retry, a new `data` array or
the tree's unmount is aborted through `signal` and its late response is
ignored. Items in an initially expanded list start loading after mount,
never during server rendering.

## Errors

A rejected promise puts the item in an
error state: the row shows `loadError` and a Retry button, `renderItem`
receives `error` and `retry()`, and `onLoadError(error, item, id)` is
called. Expanding the item again also retries.

## Remote data

Any remote source plugs in through `loadChildren`: loading one
tree level is one async function with cancellation, which any
transport can implement. `loadChildren` is any function returning a
Promise, so REST, GraphQL or a client cache all plug in the same way, and
the per-level mapping lives in the application's fetch code. To bind a
remote tree, write a `loadChildren` that fetches the children of one item
(for example `?parent=<id>` on the same endpoint) and maps the response to
items.

## API reference

`hasChildren`, `loadChildren`, `onLoadError` and the `loading`, `loadError`
and `retry` texts of `TreeViewLocaleText` are in the
[`@salmonui/navigation/tree-view` reference](/docs/reference/navigation/tree-view);
imports and styles are on the [Tree View](/docs/navigation/tree-view) page.
