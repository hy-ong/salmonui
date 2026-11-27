---
title: App Bar
description: An application header bar built from a header element with the .salmon-app-bar class around a Toolbar, with bottom position, sticky, primary tone and theme surface variants.
category: Toolbar
order: 20
demos: [app-bar-recipe]
---

```tsx
import { Button } from '@salmonui/buttons/button';
import { Toolbar, ToolbarItem, ToolbarSpacer } from '@salmonui/navigation/toolbar';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/navigation/toolbar/styles.css';

<header className="salmon-app-bar" data-sticky data-salmon-surface="app-bar">
  <Toolbar aria-label="Application">
    <Button variant="ghost" iconOnly aria-label="Menu"><MenuIcon /></Button>
    <strong>Acme</strong>
    <ToolbarSpacer />
    <ToolbarItem overflow="never">
      <input aria-label="Search" placeholder="Search" />
    </ToolbarItem>
    <Button variant="ghost">Sign in</Button>
  </Toolbar>
</header>
```

An app bar has no behavior of its own, so it is a `<header>` with the
`.salmon-app-bar` class around a [Toolbar](/docs/navigation/toolbar). The
class ships in `@salmonui/navigation/toolbar/styles.css`. The toolbar gives the
bar its keyboard model, its alignment (`ToolbarGroup align`,
`ToolbarSpacer`) and its overflow.

## Variants

| Variant | Salmon UI |
| --- | --- |
| Top bar | The default: border on the block-end edge |
| Bottom bar | `data-position="bottom"`: border on the block-start edge (use a `<footer>` for a bottom bar) |
| Sticky | `data-sticky`: `position: sticky` at the top (or the bottom with `data-position="bottom"`) |
| Primary color | `data-tone="primary"`: the primary seed as background |
| Theme surface | `data-salmon-surface="app-bar"`: the theme's `surfaces.appBar` color with a derived foreground |
| Light or dark | A nested `ThemeProvider` with `colorScheme="light"` or `"dark"` around the header |
| Inherited colors | The default: the surrounding theme |
| Dense or prominent | No bar modes; the bar's height follows its content, and the theme's `density: 'compact'` makes the controls in it smaller |

There are no dense or prominent bar modes: the bar's height
follows its content. Under the theme's `density: 'compact'` the buttons
and fields inside are 28px instead of 32px tall (see
[Density](/docs/data-grid/appearance#density)). For a prominent bar put a
heading or larger content inside the `<header className="salmon-app-bar">`
and size it with `style`.

## Theme surface

`surfaces.appBar` in the theme gives the application's top bar its own
color. The bar opts in with `data-salmon-surface="app-bar"`: the theme
paints it with the surface color and remaps text, border, hover, focus and
primary accent colors inside it, so a white bar on a tinted page or a
dark bar on a light page keeps readable buttons, fields and breadcrumbs.

```tsx
const theme = { surfaces: { appBar: '#ffffff' } };

<header className="salmon-app-bar" data-salmon-surface="app-bar">
  <Toolbar aria-label="Application">…</Toolbar>
</header>
```

Without `surfaces.appBar` the attribute matches nothing. `data-tone` and
the surface are alternatives: set one of them. Custom markup in the bar
can read `--salmon-surface-app-bar-fg`, `-muted`, `-hover` and the other
surface variables (see [Surfaces](/docs/data-grid/appearance#surfaces)).

## Content and landmarks

Put buttons, menu buttons, inputs and text inside the `Toolbar`; a
`ToolbarSpacer` or `ToolbarGroup align="end"` pushes the rest to the end.
A `<header>` that is not inside `<main>`, `<article>`, `<aside>`, `<nav>`
or `<section>` is the page's `banner` landmark; a bottom bar in a `<footer>`
is the `contentinfo` landmark. Give the `Toolbar` an `aria-label`.

## Styling

`.salmon-app-bar` sets the surface color, the border, an inline padding and
a minimum block size of 48px; override any of them with `className` or
`style`. `data-position`, `data-sticky` and `data-tone` are plain
attributes, so they work in server components and static HTML.

## Server rendering

The recipe is plain markup plus a `Toolbar`, so it renders on the server
and hydrates without warnings; the toolbar shows every item on the server
and hides overflowed items only after mount (see
[Toolbar overflow](/docs/navigation/toolbar#overflow)).

## API reference

The app bar is built from the parts in
[`@salmonui/navigation/toolbar`](/docs/reference/navigation/toolbar) (`Toolbar`,
`ToolbarItem`, `ToolbarGroup`, `ToolbarSpacer`).
