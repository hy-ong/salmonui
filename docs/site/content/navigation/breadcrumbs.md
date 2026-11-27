---
title: Breadcrumbs
description: Breadcrumbs and BreadcrumbItem render an APG breadcrumb trail with router links, a current page, CSS separators, and menu, expand, wrap, scroll or clipped overflow that renders identically on the server.
category: Breadcrumbs
order: 10
demos: [breadcrumbs-basics, breadcrumbs-overflow]
---

```tsx
import { Breadcrumbs, BreadcrumbItem } from '@salmonui/navigation/breadcrumbs';
import '@salmonui/navigation/breadcrumbs/styles.css';
// The lazy ellipsis menu of overflow="menu" is the Menu family's MenuButton:
import '@salmonui/buttons/menu/styles.css';

<Breadcrumbs maxItems={4}>
  <BreadcrumbItem href="/">Home</BreadcrumbItem>
  <BreadcrumbItem href="/docs">Docs</BreadcrumbItem>
  <BreadcrumbItem href="/docs/navigation">Navigation</BreadcrumbItem>
  <BreadcrumbItem>Breadcrumbs</BreadcrumbItem>
</Breadcrumbs>
```

`@salmonui/navigation/breadcrumbs` needs only the theme variables for the trail
itself. Its one composition edge is the ellipsis of `overflow="menu"`: a
Buttons `MenuButton` from `@salmonui/buttons/menu`, loaded as a lazy chunk the
first time the ellipsis is hovered, focused or pressed, so its code is not
part of the initial JavaScript. Import the menu stylesheet (it carries the
Button rules) when a trail can collapse into a menu.

## Items

Each `BreadcrumbItem` is one step: `href` makes it a link (an
item without `href` is text), `icon` is a decorative node before the label
(`aria-hidden`), `disabled` renders it as text with `aria-disabled="true"`,
and `target` / `rel` / `title` reach the link. `className`, `style` and `id`
go on the item's `<li>`; `className` and `style` on `Breadcrumbs` reach the
`<nav>`. Build the trail from your router's route data with
`data.map(...)`. Items are not generated from the browser URL,
because the server and the client can disagree on the
URL (base paths, rewrites, locales), which causes hydration mismatches, and
segment labels are not derivable from it. Render one `BreadcrumbItem` per
route segment, computed from your router (Next `usePathname` plus your
route metadata), each with a readable label.

The children of an item are its label and are rendered by the application,
so any markup goes there. Fragments and arrays of
items are flattened.

### Router links

`render` replaces the link element with your router's link, following the
shared [polymorphism convention](/docs/buttons/button). It
receives every computed prop (class, `href`, `aria-current`, the click
handler, the children) and must spread them:

```tsx
<BreadcrumbItem href="/settings" render={(props) => <Link {...props} href="/settings" />}>
  Settings
</BreadcrumbItem>
```

The same `render` is used for the item's entry in the ellipsis menu, where
the props are those of a `menuitem` link.

## Current item

The current page carries `aria-current="page"`. It is the last item
unless another item has `current`; `current={false}` on the last item leaves
the trail without a current page. The current item renders as text, so it
is not a tab stop; `currentNavigable` keeps it a link when it has an `href`.

## Separators

The default separator is a CSS chevron drawn on each item after the first,
so it is not in the accessibility tree and needs no markup; it mirrors in
right-to-left layouts. `separator` replaces it with any node (a
`/`, an icon), rendered `aria-hidden`.

## Overflow

`overflow` chooses what happens when the trail is too long:

| `overflow` | Behavior |
| --- | --- |
| `'menu'` (default) | Collapsed items move into an ellipsis menu after the first item. |
| `'expand'` | The ellipsis reveals the collapsed items inline and focuses the first of them. |
| `'wrap'` | Items wrap onto more lines. |
| `'scroll'` | One line that scrolls horizontally; the current item is scrolled into view after mount. |
| `'none'` | One line, clipped. |

With `maxItems`, `'menu'` and `'expand'` keep the first item and the last
`maxItems - 1` items and hide the rest; `maxItems={1}` keeps only the
last item. The collapse is structural: the server and the client render the
same `hidden` attributes. There is no mode that hides the middle items
with no way to reach them: it would remove
navigation targets for keyboard and screen reader users. `'menu'` (the
default) shows the same first and last items and lists the hidden ones in
the ellipsis menu; set `maxItems` to choose how many stay visible.

Without `maxItems`, `'menu'` measures the trail with the shared overflow
measurer: items after the first collapse, oldest first, until the rest fit;
the first and the current item always stay. The server renders every item;
after mount the measurer only toggles `hidden` on items and on the ellipsis,
in a layout effect and on resize, so hydration never sees a different tree.
The measurer is a lazy chunk too.

The ellipsis is a `MenuButton` (`aria-haspopup="menu"`): Enter, Space or
ArrowDown open it on the first hidden item, its entries are `menuitem`
links, and Escape returns focus to the ellipsis.

## Navigation and events

`onItemClick` fires when a link item is activated, in the trail or in the
ellipsis menu. Its event has the item's `index`, its props
(`item`), `href`, the `source` (`'pointer'`, `'keyboard'` or `'touch'`) and
`menu` (chosen in the ellipsis menu). `event.preventDefault()` cancels the
browser navigation, for client-side routing or to disable navigation
altogether; in the menu the menu still closes. Items without `href`
never navigate.

`disabled` on `Breadcrumbs` disables every item and the ellipsis.

## Accessibility

The APG Breadcrumb pattern: a `<nav>` landmark named by
`localeText.label` (default "Breadcrumb"; `aria-label` or
`aria-labelledby` replace it) around an `<ol>`, one `<li>` per item, the
current item `aria-current="page"`, separators outside the accessibility
tree. Tab moves through the links. Collapsed items are `hidden`, so they
leave the list until revealed.

## Localization

`localeText` overrides `label` (the landmark name) and `ellipsis` (the
ellipsis button's name, default "Show hidden breadcrumbs"); the defaults are
exported as `BREADCRUMBS_DEFAULT_LOCALE_TEXT`.

## Styling

Classes: `.salmon-breadcrumbs` (`data-overflow`, `data-disabled`,
`data-separator="custom"`), `.salmon-breadcrumbs-list`,
`.salmon-breadcrumbs-item` (`data-current`, `data-disabled`),
`.salmon-breadcrumbs-link`, `.salmon-breadcrumbs-text`,
`.salmon-breadcrumbs-icon`, `.salmon-breadcrumbs-separator`,
`.salmon-breadcrumbs-ellipsis`. Colors come from the theme variables only.

## API

`Breadcrumbs`: `children`, `overflow`, `maxItems`, `separator`,
`currentNavigable`, `disabled`, `onItemClick`, `localeText`, `ref` (the
`<nav>`), and any `<nav>` attribute.

`BreadcrumbItem`: `children`, `href`, `target`, `rel`, `icon`, `disabled`,
`current`, `render`, `onClick`, `className`, `style`, `id`, `title`.

The trail has no internal state to control: the current item and the
collapsed items follow from the props (`current`, `maxItems`) and the
measured width. Full signatures are in the
[`@salmonui/navigation/breadcrumbs` reference](/docs/reference/navigation/breadcrumbs).
