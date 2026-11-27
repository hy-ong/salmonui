---
title: Tree View items and templates
description: Icons, links with router support, tooltips and attributes per item, and renderItem templates that receive the item state, all pure and called only for rendered rows.
category: Tree View
order: 20
demos: [tree-view-templates]
---

Every per-item customization is a pure function called during render, only
for the rows that are rendered (the virtual window). None of them mutates
the DOM, so no per-row render event is needed and they stay cheap
on a 100,000-item tree.

<!-- demo: tree-view-templates -->

## Icons

`getItemIcon(item)` returns a `ReactNode` shown before the label, such as an
icon or an image. It is `aria-hidden`; the
label stays the accessible name.

```tsx
<TreeView getItemIcon={(f) => (f.children ? <FolderIcon /> : <FileIcon />)} /* ... */ />
```

## Links

`getItemHref(item)` renders the label as a link. A
click anywhere on the row follows it, and so does Enter. The link has
`tabindex="-1"`: the row keeps the single tab stop.

For a router link, `renderLink(props, item)` receives the props to spread
(`href`, `className`, `tabIndex`, `children`):

```tsx
<TreeView
  getItemHref={(page) => `/docs/${page.slug}`}
  renderLink={(props) => <Link {...props} to={props.href} />}
  /* ... */
/>
```

## Tooltips and attributes

`getItemProps(item, context)` returns extra props for a rendered row:
`title` for a tooltip, `className`, `style`, `data-*` and other
attributes.
ARIA attributes and handlers of the row are owned by the tree.

```tsx
<TreeView getItemProps={(f, { level }) => ({ title: f.path, 'data-kind': f.kind, className: level === 1 ? 'top' : undefined })} /* ... */ />
```

## Templates

`renderItem(context)` replaces the label content. The context is `{ item, id, level, label, expanded, selected,
checked, disabled, loading, error, retry }`; `checked` is `true`, `false` or
`'mixed'`, and `error` / `retry` describe a failed lazy load.

```tsx
<TreeView
  renderItem={({ item, label, error, retry }) =>
    error ? (
      <span>
        {label} <button onClick={retry}>Try again</button>
      </span>
    ) : (
      <span>
        {label} <Badge>{item.count}</Badge>
      </span>
    )
  }
  /* ... */
/>
```

The twisty, the checkbox, the icon and the loading status stay outside the
template, so keyboard and ARIA behavior do not depend on it.

All of these run on the server too: icons, links, attributes and templates
are part of the server-rendered first window, so they must be pure (no
`window`, no random ids) to hydrate without warnings.

## API reference

`getItemIcon`, `getItemHref`, `renderLink`, `getItemProps`, `renderItem`,
`TreeViewItemContext` and `TreeViewLinkProps` are in the
[`@salmonui/navigation/tree-view` reference](/docs/reference/navigation/tree-view);
imports and styles are on the [Tree View](/docs/navigation/tree-view) page.
