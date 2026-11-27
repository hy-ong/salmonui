---
title: Sidebar Menu
description: SidebarMenu is the vertical navigation menu of a sidebar - grouped links, nested submenus, the selected route with aria-current, router links through renderLink, and an icon rail with tooltips and flyout submenus - in a nav landmark that works in any vertical navigation container.
category: Sidebar
order: 70
demos: [sidebar-menu-admin, sidebar-menu-rail, sidebar-menu-dark, sidebar-menu-nested]
---

```tsx
import { SidebarMenu, type SidebarMenuEntry } from '@salmonui/navigation/sidebar-menu';
import '@salmonui/navigation/sidebar-menu/styles.css';

const items: SidebarMenuEntry[] = [
  {
    type: 'group',
    id: 'workspace',
    label: 'Workspace',
    children: [
      { id: '/overview', label: 'Overview', href: '/overview', icon: <LayoutDashboard /> },
      { id: '/orders', label: 'Orders', href: '/orders', icon: <ShoppingCart />, badge: 12 },
    ],
  },
  {
    type: 'group',
    id: 'operations',
    label: 'Operations',
    children: [
      {
        id: 'commerce',
        label: 'Commerce',
        icon: <Store />,
        children: [{ id: '/products', label: 'Products', href: '/products' }],
      },
    ],
  },
];

<SidebarMenu items={items} selected={pathname} renderLink={(props) => <Link to={props.href} {...props} />} />
```

`SidebarMenu` is the navigation menu of a sidebar: it pairs with
[SidebarLayout](/docs/navigation/sidebar-layout) (put it in a
`SidebarPanel`, pass the layout's `collapsed` state for the icon rail, and
the overlay presentation makes it the mobile drawer menu), and it works the
same in any other vertical navigation container, such as a settings page
column or a plain `<aside>`. It is its own subpath: a page that uses
`SidebarLayout` without it does not load it. Its stylesheet needs nothing
besides `@salmonui/core/styles.css`.

<!-- demo: sidebar-menu-admin -->

## Items

`items` is an array of entries:

| Entry | Renders | Notes |
| --- | --- | --- |
| `{ id, label, href }` | a link | `aria-current="page"` when `selected`; through `renderLink` when given |
| `{ id, label }` (no `href`, no `children`) | a button | An action (sign out, open a dialog); selectable like a link, `aria-current="true"` when selected |
| `{ id, label, children }` | a disclosure button and a nested list | `aria-expanded` and `aria-controls`; `href` is ignored |
| `{ type: 'group', id, label, children }` | a heading and a list it names | Top level only, never collapses; the heading is the list's accessible name |

Every item also takes `icon` (a decorative `ReactNode`, `aria-hidden`; Salmon
UI ships no icon set, use any icon component), `badge` (trailing content
that is part of the accessible name, such as a count), `disabled` (a
disabled link has no `href` and `aria-disabled="true"`; a disabled submenu
button is `disabled`) and `textValue` (the plain text of a non-string
`label`, used for the rail initial). Ids must be unique: they are the keys
of `selected` and `expanded`. A duplicate logs a development warning.

## Selection and router links

- `selected` / `defaultSelected` / `onSelectedChange(id, { item, source })`:
  `selected` is one id or `null`. With a router, derive it from the current
  location (`selected={pathname}` when ids are paths) and the highlight
  follows navigation from anywhere. A click on a leaf proposes it; a click
  with a modifier key (Ctrl, Cmd, Shift, Alt) or another button opens a new
  tab or window instead and selects nothing.
- `onItemClick(item, event)` runs for every press on an enabled leaf,
  modified clicks included: close a mobile drawer here.
- `renderLink(props, item)` renders a link item with another element.
  Spread every prop: `href`, `className`, `aria-current` and the
  `data-sidebar-menu-*` attributes the menu uses to find the item on click.
  Keep your link's own `onClick` (a router link prevents the full page
  load); the menu reads the click as it bubbles, so it never needs the
  link's handler.

```tsx
<SidebarMenu
  items={items}
  selected={pathname}
  renderLink={(props, item) => <Link to={props.href} {...props} />}
  onItemClick={() => setDrawerOpen(false)}
/>
```

The submenus around the selected item get `data-active` (their button shows
the selected color), so a closed submenu still tells where the page is.

## Submenus

`expanded` / `defaultExpanded` / `onExpandedChange(ids, { id, expanded,
source })` hold the open submenu ids. `defaultExpanded="all"` opens every
submenu; by default the submenus around the selected item start open. An
uncontrolled menu also opens the submenus around a newly selected item, so
navigating elsewhere reveals the current page. Closed submenus stay in the
server markup with `hidden="until-found"`: the browser's find-in-page
reveals them (`source: 'find'`). The open and close transition animates the
height in CSS, off under `prefers-reduced-motion`.

<!-- demo: sidebar-menu-nested -->

## Dividers and row metrics

`dividers` draws a rule between the groups (the collapsed rail draws it
anyway). The row metrics are custom properties on
`.salmon-sidebar-menu`, so a sidebar can match an existing layout without
new props:

| Property | Default | Sets |
| --- | --- | --- |
| `--salmon-sidebar-menu-item-inset` | `8px` | the gap between a row and the menu edge |
| `--salmon-sidebar-menu-item-padding` | `12px` | the inline padding inside a row |
| `--salmon-sidebar-menu-group-inset` | `20px` | the inline start of a group heading |
| `--salmon-sidebar-menu-group-font-size` | the small font size | the group heading size |
| `--salmon-sidebar-menu-indent` | `26px` | the extra start padding per submenu level |

```tsx
<SidebarMenu
  items={items}
  dividers
  style={{ '--salmon-sidebar-menu-item-inset': '16px', '--salmon-sidebar-menu-item-padding': '16px', '--salmon-sidebar-menu-group-font-size': '14px' } as CSSProperties}
/>
```

## Collapsed rail

`collapsed` turns the top level into an icon rail: labels hide visually but
stay the accessible names, an item without an icon shows its initial, group
headings become separators, and

- a link shows its label as a tooltip on hover or keyboard focus (the
  tooltip is decorative, the link is already named);
- a submenu button opens a flyout next to it: hover opens it for a look and
  leaving closes it; a click, Enter, Space or Right pins it, a keyboard open
  moves focus to its first link. Escape or Left closes it and returns focus
  to the button; a press outside or focus leaving closes it too. Deeper
  submenus inside a flyout are inline disclosures.

The flyout is rendered inside the item's `<li>` and shown in the top layer,
so it is never clipped by the scrolling sidebar and the Tab order runs from
the button through the flyout to the next rail item. The rail popups are a
small chunk loaded after mount once the menu is collapsed; the server
markup is the same in both modes. Pass the `SidebarLayout` state:

```tsx
const [collapsed, setCollapsed] = useState(false);

<SidebarLayout collapsed={collapsed} onCollapsedChange={setCollapsed} railSize="64px">
  <SidebarPanel navigation aria-label="Main">
    <SidebarMenu landmark={false} items={items} collapsed={collapsed} selected={pathname} />
  </SidebarPanel>
  <SidebarMain>
    <SidebarTrigger action="collapse" />
    …
  </SidebarMain>
</SidebarLayout>
```

<!-- demo: sidebar-menu-rail -->

## Keyboard and screen readers

Site and app navigation is a list of links, so `SidebarMenu` follows the
WAI-ARIA disclosure navigation pattern, not the menu pattern:
`role="menu"` is for application commands, and it would replace the link
semantics (screen readers' link lists, "open in a new tab", browse-mode
reading) and the plain Tab order users expect from navigation.

- The root is a `<nav>` landmark named by `aria-label` /
  `aria-labelledby`, `localeText.label` (`'Main'`) by default. Inside a
  landmark that already names it (a `SidebarPanel navigation`), pass
  `landmark={false}` to render a `<div>`.
- Lists of links; group headings name their list; submenus are buttons
  with `aria-expanded` and `aria-controls`; the selected link has
  `aria-current="page"`.

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Every enabled link and submenu button, in order (disabled and closed items are skipped) |
| Enter, Space | Follow a link; toggle a submenu; open a rail flyout into its first link |
| Down / Up | Next / previous visible item (shortcut on top of Tab) |
| Home / End | First / last visible item |
| Right | Open a closed submenu, or move into an open one; open a rail flyout |
| Left | Close an open submenu, or move to the parent submenu button; close a rail flyout |
| Escape | Close a rail flyout and return to its button; hide a rail tooltip |

Right and Left are mirrored under `dir="rtl"`; the indentation, the rail
and the flyout side follow the inherited direction.

## Appearance

The menu uses the theme's sidebar surface variables when they are set and
the neutral theme colors otherwise:

| Variable | Used for | Fallback |
| --- | --- | --- |
| `--salmon-surface-sidebar-bg` | menu, flyout background | transparent (menu), `--salmon-surface-raised` (flyout) |
| `--salmon-surface-sidebar-fg` | item text | `--salmon-text-primary` |
| `--salmon-surface-sidebar-hover` | hovered item | `--salmon-surface-hover` |
| `--salmon-surface-sidebar-selected-bg` / `-selected-fg` | selected item, active submenu | `--salmon-color-primary-subtle` / `-text` |
| `--salmon-surface-sidebar-border` | rail separators, flyout border | `--salmon-border-subtle` |

Group headings mix the item color with the background. Set the variables in
the theme for a dark sider (every sidebar menu, flyout and tooltip
follows), or on one container. `--salmon-sidebar-menu-item-height` (36px)
and `--salmon-sidebar-menu-indent` (26px per level) adjust the rows.
`className`, `style` and DOM props reach the root; parts carry
`.salmon-sidebar-menu-*` classes (`-link`, `-icon`, `-label`, `-badge`,
`-group-label`, `-submenu`, `-flyout`, `-tooltip`).

<!-- demo: sidebar-menu-dark -->

## Localization

`localeText` overrides `SIDEBAR_MENU_DEFAULT_LOCALE_TEXT` (`{ label: 'Main' }`,
the landmark name). Item labels are application content.

## API reference

[`@salmonui/navigation/sidebar-menu`](/docs/reference/navigation/sidebar-menu):
`SidebarMenu`, `SIDEBAR_MENU_DEFAULT_LOCALE_TEXT` and the `SidebarMenuItem`,
`SidebarMenuGroup`, `SidebarMenuEntry`, `SidebarMenuLinkProps` and event
types.
