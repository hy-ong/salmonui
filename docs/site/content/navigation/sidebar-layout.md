---
title: Sidebar Layout
description: SidebarLayout places a SidebarPanel beside SidebarMain - push mode with a CSS grid track, an icon rail, start or end side, a cancellable open state, and a container or media breakpoint that switches to the overlay presentation without hydration differences.
category: Sidebar
order: 60
demos: [sidebar-layout-basics, sidebar-layout-modes]
---

```tsx
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';
import '@salmonui/navigation/sidebar-layout/styles.css';

<SidebarLayout collapseBelow={768} side="start" style={{ blockSize: '100dvh' }}>
  <SidebarPanel navigation aria-label="Main navigation">…</SidebarPanel>
  <SidebarMain render={(props) => <main {...props} />}>
    <SidebarTrigger />
    …
  </SidebarMain>
</SidebarLayout>
```

A sidebar can be a layout column (push, or a docked icon rail) or a modal
overlay. Salmon UI keeps the two apart: `SidebarLayout` is the layout, and
its overlay mode is the place where the Layout category's `Drawer` plugs in.
The panel is bounded to the layout's own element
(`position: relative`, no portal), so there is no target prop: place the
layout inside the container the sidebar belongs to.
`/sidebar-layout/styles.css` is all push mode needs besides
`@salmonui/core/styles.css`; the overlay presentation also needs the Drawer
stylesheet ([Overlay mode](#overlay-mode)).

## Parts

| Component | Element | Notes |
| --- | --- | --- |
| `SidebarLayout` | `<div class="salmon-sidebar-layout">` | The grid and the state owner; `ref` is this element. `data-side`, `data-mode`, `data-presentation`, `data-state`, `data-collapsed` |
| `SidebarPanel` | `<aside>`, or `<nav>` with `navigation` | Landmark named by `aria-label` / `aria-labelledby`, `localeText.panel` (`'Sidebar'`) by default. A closed panel is `inert` and `visibility: hidden`, so it leaves the tab order and the accessibility tree. Carries `data-salmon-surface="sidebar"` ([Theme surface](#theme-surface)) |
| `SidebarMain` | `<div class="salmon-sidebar-main">` | The content; `render` returns another element (`<main>`, `<section>`) with the computed props |
| `SidebarTrigger` | `<button type="button">` | `aria-expanded` and `aria-controls` (the panel id). `action="open"` (default) toggles the panel, `action="collapse"` the icon rail. Without text content it is named by `localeText.toggle` / `localeText.collapse`; `icon` replaces the built-in icon; `render` keeps ARIA and handlers |

`className`, `style` and DOM props reach each part's element.

## Push mode, size, rail and side

`mode="push"` (default) is a CSS grid: the panel track is `size`
(`16rem` by default; a number is px) while open, `railSize` (`56px`) while
`collapsed`, and 0 while closed; the main content takes the rest, so its
inline size shrinks. The track change is one CSS
transition, off under `prefers-reduced-motion`. There is no slide mode that
translates the main content instead of resizing it: it looks
close to push and would cost a second layout path.
Use `mode="push"`; if the main content must keep its width, give it a
`min-inline-size`.

`side="start" | "end"` is logical and follows the inherited `dir`.
Rail content (icons with labels) can hide its labels through
`.salmon-sidebar-panel[data-collapsed]`.

## State and events

- `open` / `defaultOpen` / `onOpenChange(open, event)`: `defaultOpen` is
  `true` in push mode and `false` in overlay mode. The event has `reason`
  (`'trigger' | 'outside' | 'escape' | 'breakpoint'`) and `source`
  (`'pointer' | 'keyboard' | 'touch' | 'api'`).
- `onBeforeOpenChange(event)` runs first, synchronously, with the proposed
  `open`; `event.preventDefault()` cancels the change. Event objects are only
  created when a handler is bound and are frozen in development builds.
- `collapsed` / `defaultCollapsed` / `onCollapsedChange(collapsed, event)`
  drive the rail.
- There are no show, hide or toggle methods: the open state is a
  prop, so methods would let the panel and the application state disagree.
  Set the state you pass to `open`, or render a `SidebarTrigger`.

```tsx
const [open, setOpen] = useState(true);

<SidebarLayout open={open} onOpenChange={setOpen}>
  …
</SidebarLayout>
```

- `closeOnOutsidePress` (push presentation) closes the panel on a press
  outside it and its triggers (push half). When the panel closes
  while focus is inside it, focus moves to its trigger (push half).

## collapseBelow: adaptive presentation

`collapseBelow` switches between push and overlay by width: a
number is the layout's own
inline size in px (a container query; the layout is a size container named
`salmon-sidebar-layout`), a string is a media query that matches when narrow
(`'(max-width: 767px)'`).

The server cannot know the width, so the server markup carries a
per-instance `<style>` rule that hides the panel below the breakpoint before
JavaScript runs. After mount the layout measures itself (one
`ResizeObserver` or one media query list, loaded as a small lazy chunk),
sets `data-presentation`, and takes over: becoming narrow closes the panel
(`reason: 'breakpoint'`), becoming wide restores the last wide state. The
server render and the hydration render are identical.

## Overlay mode

`mode="overlay"` (and the narrow side of `collapseBelow`) presents the panel
over the main content. It renders only after hydration, so server markup is
always closed. The overlay presentation is a lazily loaded module that
renders the panel in the same drawer core as the Layout category's
[Drawer](/docs/layout/dialog#drawer) (native `<dialog>` `showModal()`,
backdrop, focus containment, inert background), without importing
`@salmonui/overlays`. Focus moves into the panel when it opens; Escape and a press on
the backdrop close it, and focus returns to the trigger.
The sidebar stylesheet does not carry the drawer rules (they would put it
over its size budget): import `@salmonui/overlays/drawer/styles.css` too when
a layout can show the overlay presentation. Overlay mode uses the top
layer instead of a `z-index` prop: the top layer is above every
`z-index` stacking context, and push mode is in normal flow, so there is
nothing to manage. Use `style` in push mode if you need a `z-index`.

Edge-swipe gestures are not offered: they conflict with the
browser's back and forward gestures on mobile and would need pointer
tracking on the default path. Provide a visible `SidebarTrigger`; Escape
closes the overlay.

## Theme surface

The panel carries `data-salmon-surface="sidebar"`, so a theme with
`surfaces.sidebar` colors it: a dark sidebar beside a light page is one
theme setting, not a nested color scheme.

```tsx
const theme = { surfaces: { sidebar: '#192225' } };

<ThemeStyle theme={theme} />
<ThemeProvider theme={theme}>
  <SidebarLayout>
    <SidebarPanel navigation aria-label="Main navigation">…</SidebarPanel>
    <SidebarMain>…</SidebarMain>
  </SidebarLayout>
</ThemeProvider>
```

The theme derives the panel's foreground, muted text, hover, selected and
border colors from the seed with the theme's contrast guarantees, and
remaps the color variables inside the panel, so Salmon UI components in
it (tree view, buttons, fields) follow without any override. Custom
navigation markup reads `--salmon-surface-sidebar-fg`, `-muted`, `-hover`,
`-selected-bg`, `-selected-fg` and `-border` (see
[Surfaces](/docs/data-grid/appearance#surfaces)). Without
`surfaces.sidebar` the attribute matches nothing.

## Localization

`localeText` overrides `SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT`
(`{ panel: 'Sidebar', toggle: 'Toggle sidebar', collapse: 'Collapse sidebar' }`).

## API reference

[`@salmonui/navigation/sidebar-layout`](/docs/reference/navigation/sidebar-layout):
`SidebarLayout`, `SidebarPanel`, `SidebarMain`, `SidebarTrigger`,
`SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT` and their prop and event types.
