---
title: Common behavior
description: Rules every Navigation component shares - right-to-left layouts, localeText, className and style passthrough, icons, children and render props, accessibility, server rendering, and the options left out by design.
category: Guides
order: 200
demos: [navigation-common]
---

Accordion, Breadcrumbs, Carousel, ContextMenu, Menubar, SidebarLayout,
Tabs, Toolbar (and the App Bar), TreeView, Stepper and Pager follow
the same rules, so what you learn on one page holds on the others.

## Right-to-left

Set `dir="rtl"` on the page or any container:
every stylesheet uses CSS logical properties, and arrow keys, submenus,
overflow menus, separators, the Carousel's slide direction and the Pager's
icons mirror with it.

```tsx
<div dir="rtl">
  <Tabs defaultValue="a">…</Tabs>
</div>
```

## Texts

Every built-in string comes from a `localeText` prop: a partial object over
the exported, frozen English defaults (`TABS_DEFAULT_LOCALE_TEXT`,
`TOOLBAR_DEFAULT_LOCALE_TEXT`, `CAROUSEL_DEFAULT_LOCALE_TEXT`,
`PAGER_DEFAULT_LOCALE_TEXT`, ...). Pass only the keys you translate; the
strings serialize, so the server and the client render the same text.
Accordion has no built-in text, so it has no `localeText`.

```tsx
<Pager totalCount={120} localeText={{ nextPage: 'Nächste Seite', previousPage: 'Vorherige Seite' }} />
```

## Classes, styles and attributes

`className` and `style` land on the root after the system class, and every
other DOM prop (`id`, `aria-*`, `data-*`, handlers) spreads onto the
element that owns the behavior. Parts are components of their own
(`AccordionItem`, `BreadcrumbItem`, `Tab`, `TabPanel`, `ToolbarItem`,
`Step`) and take the same props; internal parts carry
`.salmon-<component>-<part>` classes and state in `data-*` attributes.
`width` and `height` are plain `style` values.

## Icons

Icons are `ReactNode`s, never class names or image URLs: `icon` on
`AccordionItem`, `BreadcrumbItem`, `Tab`, `ToolbarItem`, `Step` and menu
items, `getItemIcon` on TreeView, and `icons` on the Pager for its built-in
buttons. They
render decoratively (`aria-hidden`); the label names the item.

## Templates

Content is children. Where a component renders an element for you, a
`render*` prop receives a stable context and returns a node: `render` on
`BreadcrumbItem`, `MenubarItem`, `SidebarMain` and `SidebarTrigger` (router
links), `renderStep`, `renderIndicator` and the Carousel button props,
`renderPager` / `renderInfo` / `renderPageSize`, and TreeView `renderItem`.
Per-item hooks (`renderItem`, `getItemProps`) are pure and run at
render time for rendered items only, including TreeView's virtual window;
they never touch the DOM. Toolbar and Accordion items are your
own children, so customizing an item means rendering it.

## Accessibility

Each component implements its WAI-ARIA APG pattern (accordion, breadcrumb,
carousel, menu and menubar, tabs, toolbar, tree view; ordered list with
`aria-current="step"` for the Stepper; a navigation landmark for the
Pager), with one tab stop and arrow keys where the pattern asks for it.
axe-core and ARIA snapshots run for every component in light, dark and
right-to-left.

## Server rendering

Every component renders on the server (Next.js App Router, Vite SSR) and
hydrates without warnings. Layout that needs measuring (overflow menus,
`collapseBelow`, the Carousel's position) starts from CSS in the server
markup and only changes classes after mount; popups mount on the client.

## Options left out by design

Not offered, each with the reason and what to use:

- Built-in state persistence: a component that writes
  `localStorage` on its own breaks server rendering (the server cannot read the stored value,
  so the first client render would differ) and hides state from the
  application. Every persisted state is a controlled prop with a change
  event (`Accordion value`, `Tabs value`, `TreeView expanded` / `selected`
  / `checked`, `SidebarLayout open` / `collapsed`, `Pager page` /
  `pageSize`, `Stepper value`, `Carousel index`): store the value from the
  change event (in `localStorage` or the URL) and pass it back after mount.
- HTML string content and templates, with their sanitizing and encoding
  options: content is `ReactNode`, so nothing is parsed from strings and
  there is nothing to sanitize; string templates would also need a runtime
  template compiler that breaks a strict CSP. Move HTML content into JSX;
  for trusted HTML, call `dangerouslySetInnerHTML` inside your own element.
- Lifecycle events and a teardown method: React already exposes
  mount and unmount. Run setup logic in `useEffect` or a ref callback, and
  remove a component with conditional rendering.
- `animation` settings: the theme has no motion input and motion must
  stop under `prefers-reduced-motion`, so each component has one fixed CSS
  transition with no duration or easing API. If a different speed is
  required, override the transition in CSS on the component's class.
- Imperative collection methods that add, hide, enable, select or refresh
  items: the item collection belongs to the application, and
  methods that mutate an internal copy make the UI and the application
  state disagree and cannot run on the server. Add an item by inserting it
  into the array the children render from, disable it with `disabled`, hide
  it with conditional rendering and select it with the `value` prop.
  The `ref` keeps only what props cannot express (TreeView `scrollToItem`,
  `expandAll`, `startRename`; Carousel `next`, `play`), and overflow
  re-measures by itself.
