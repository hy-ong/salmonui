---
title: Theming and appearance
description: Theming with five color seeds, light and dark schemes, compact density, the font family, a tinted neutral ramp and region surfaces, plus grid lines, alternate rows, hover, row and header height, text wrap, custom icons and stable CSS hooks.
category: Theming and Appearance
order: 40
demos: [theme-colors, theme-density, theme-surfaces, appearance, icons]
---

The theme is a small set of inputs on `ThemeProvider`: five semantic color
seeds and a color scheme, plus four optional settings: `density`,
`fontFamily`, a `neutral` tint and region `surfaces`. Every other value is
derived from them and written as `--salmon-*` custom properties, and every
derived color keeps the contrast guarantees. There is no radius, spacing,
type scale or token-table input: each setting is one value, not a table.

```ts
interface SalmonThemeInput {
  colors?: { primary?; success?; warning?; danger?; info? }; // hex seeds
  colorScheme?: 'light' | 'dark' | 'auto';
  density?: 'default' | 'compact';
  fontFamily?: string;
  neutral?: { hue?: number; chroma?: number };
  surfaces?: { sidebar?; appBar?; tableHeader? }; // hex or 'primary'
}
```

## Color seeds

`ThemeProvider` takes `primary`, `success`, `warning`, `danger` and `info`
as opaque hex colors. Each seed becomes a tonal scale; neutrals,
surfaces, borders, hover, selection and the focus ring are derived from
it, so a seed cannot break the contrast guarantees: at least 7:1 for body
text, 4.5:1 for secondary text and 3:1 for borders, focus ring and selection
in both schemes. Invalid seeds (named colors, alpha, `oklch()`, CSS
variables) fall back to the default with a development warning.

```tsx
import { ThemeProvider } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';

const theme = { colors: { primary: '#0f766e', danger: '#be123c' }, colorScheme: 'auto' } as const;

<ThemeStyle theme={theme} />
<ThemeProvider theme={theme}>
  <DataGrid aria-label="Orders" data={orders} columns={columns} />
</ThemeProvider>
```

The scheme is `light`, `dark` or `auto` (follows `prefers-color-scheme`).
`ThemeStyle` emits the scope's variables server-side as a hoisted,
deduplicated `<style>`, so server-rendered pages paint in the right colors
before hydration; the default theme ships precompiled in
`@salmonui/core/styles.css`. Application CSS may read the
`--salmon-*` variables but not set them.

<!-- demo: theme-colors -->

## Density

`density: 'compact'` tightens every control and Data Grid row; `'default'`
is the regular size. Density does not replace the component `size` prop:
each `size` has a default and a compact metric set, so `size` picks the
step and density picks the set.

| `size` | `default`: height, inline padding | `compact`: height, inline padding |
| --- | --- | --- |
| `sm` | 24px, 8px | 20px, 6px |
| `md` | 32px, 12px | 28px, 10px |
| `lg` | 40px, 16px | 36px, 14px |

- Buttons, text fields, selects, comboboxes, date and time pickers, tags
  and every other single-line control follow the matrix. Menu, listbox,
  tree view and navigation items, pager buttons, toolbars and icon buttons
  use the `md` height; tabs are 4px taller than it.
- The Data Grid default `rowHeight` / `headerHeight` are 36 / 40 px at
  `default` and 32 / 36 px at `compact`, and cell and header text is 13px
  instead of 14px (Tree Grid and Pivot Table render through the same
  cells). An explicit `rowHeight` or `headerHeight` prop always wins.
- Spacing, radius, type scale and icon sizes stay the same: compact is
  tighter controls and rows, not a different layout.
- A nested `ThemeProvider` that does not set `density` inherits it, so one
  setting at the root covers the whole application, and a compact panel
  inside a default page is one nested provider.

The metrics are CSS variables (`--salmon-control-height-sm|md|lg`,
`--salmon-control-padding-sm|md|lg`, `--salmon-font-size-cell`) that the
default theme does not emit: components read them with the default value
as a fallback, so an application that never sets `density` pays nothing.
Application CSS reads them the same way, for example
`min-block-size: var(--salmon-control-height-md, 32px)`.

<!-- demo: theme-density -->

## Font family

`fontFamily` sets `--salmon-font-sans`, the family every component uses.
The value is a CSS `font-family` list. The application loads the font
itself (with `@font-face`, a font service or `next/font`), because Salmon
UI ships no font files; end the list with a system fallback so text
renders before the font arrives.

```ts
const theme = { fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };
```

Only letters, digits, spaces, commas, quotes, dots, hyphens and
underscores are accepted. Anything else (a semicolon, braces, `url()`) is
rejected with a development warning and the system stack is used. Unset,
a nested scope inherits the enclosing scope's font and the root uses the
system stack. The type scale (sizes, weights, line heights)
does not change.

## Neutral tint

Neutrals (surfaces, borders, text, hover) are near-achromatic by default,
leaning slightly toward the primary hue. `neutral` tints the whole ramp:

- `hue` in degrees (any number, taken modulo 360). Unset, the primary hue.
- `chroma` in OKLCH, clamped to `[0, 0.04]` so neutrals stay neutral.

`neutral: { chroma: 0.032 }` with a teal primary such as `#0e4d5c` gives
blue-green grays for text, borders and the page background. The tinted
ramp goes through the same contrast pickers as the default one, so body
text, secondary text, borders, the focus ring and selection keep 7:1,
4.5:1 and 3:1 in both schemes whatever the tint.

## Surfaces

`surfaces` gives three application regions their own background with a
derived foreground:

| Surface | Region | The attribute comes from |
| --- | --- | --- |
| `sidebar` | The `SidebarLayout` panel and the navigation inside it | `SidebarPanel` |
| `appBar` | The application's top bar | Your `<header>` |
| `tableHeader` | The Data Grid header (also Tree Grid and Pivot Table) | The grid header |

Each value is a hex color, or `'primary'` for the resolved primary seed.
The seed is used as is in both color schemes; the theme derives the rest
of the region's colors from it:

| Role | Derived as |
| --- | --- |
| Foreground | Near-white on a dark seed, near-black on a light one: at least 7:1 against the background and 4.5:1 against hover and selected |
| Muted text | The step closest to the background that keeps 4.5:1 (group headings, secondary text, placeholders) |
| Hover, selected | The seed moved in lightness, with the foreground still readable on them |
| Border | A divider step toward the foreground |
| Focus ring, accents | The theme focus ring and primary accents when they keep 3:1 on the seed, else the foreground |

So a sort arrow in a primary-colored header, or a checked checkbox or a
selected item in a near-black sidebar, stays visible without any override.

The surface applies to the element carrying
`data-salmon-surface="sidebar"`, `"app-bar"` or `"table-header"`: the theme
emits one rule per set surface that paints the element and remaps the
color variables for its subtree, so every component inside follows it.
`SidebarPanel` and the Data Grid header carry the attribute already; put
`data-salmon-surface="app-bar"` on your own top bar:

```tsx
<header className="salmon-app-bar" data-salmon-surface="app-bar">…</header>
```

Without the surface in the theme the attribute matches nothing and costs
nothing. Overlays opened from inside a surface (menus, popovers, date
pickers) are portaled out of it and keep the regular overlay colors.

For custom navigation markup, each set surface also exposes its derived
colors on the theme scope:

| Variable | Meaning |
| --- | --- |
| `--salmon-surface-<name>-bg`, `-fg`, `-muted` | Background, text, secondary text |
| `--salmon-surface-<name>-hover` | Item hover background |
| `--salmon-surface-<name>-selected-bg`, `-selected-fg` | Selected item background and text |
| `--salmon-surface-<name>-border` | Dividers |

with `<name>` one of `sidebar`, `app-bar` and `table-header`:

```css
.app-nav a { color: var(--salmon-surface-sidebar-fg); }
.app-nav a:hover { background: var(--salmon-surface-sidebar-hover); }
.app-nav a[aria-current='page'] {
  background: var(--salmon-surface-sidebar-selected-bg);
  color: var(--salmon-surface-sidebar-selected-fg);
}
.app-nav h2 { color: var(--salmon-surface-sidebar-muted); }
```

Reading these variables is supported; setting them is not. A nested
`ThemeProvider` that does not set `surfaces` inherits the enclosing
scope's surfaces. For a region that should be fully in the dark scheme
(every role, not only its background), wrap it in a nested
`ThemeProvider` with `colorScheme: 'dark'` instead.

<!-- demo: theme-surfaces -->

## Theme like an admin template

A compact, teal-tinted admin layout with a dark sidebar, a white top bar
and a primary-colored table header is one theme object:

```tsx
import type { ReactNode } from 'react';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';
import { SidebarLayout, SidebarMain, SidebarPanel } from '@salmonui/navigation/sidebar-layout';

const theme: SalmonThemeInput = {
  colors: { primary: '#0e4d5c', success: '#0c8f54', warning: '#d4690b', danger: '#d62f23', info: '#0e4d5c' },
  density: 'compact',
  fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  neutral: { chroma: 0.032 },
  surfaces: { sidebar: '#192225', appBar: '#ffffff', tableHeader: 'primary' },
};

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <>
      <ThemeStyle theme={theme} />
      <ThemeProvider theme={theme}>
        <SidebarLayout style={{ blockSize: '100dvh' }}>
          <SidebarPanel navigation aria-label="Main navigation">…</SidebarPanel>
          <SidebarMain render={(props) => <main {...props} />}>
            <header className="salmon-app-bar" data-salmon-surface="app-bar">…</header>
            {children}
          </SidebarMain>
        </SidebarLayout>
      </ThemeProvider>
    </>
  );
}
```

The sidebar, the app bar and every Data Grid header pick up their surfaces
from the attributes; controls and grid rows are compact; text uses Inter
once the application loads it.

## Design notes

### One theme, branded through the seeds

Salmon UI ships one neutral flat theme with automatic light and dark
schemes, branded through the seeds; each extra theme would be a
surface whose contrast and layout must be guaranteed separately. Pick the
seeds closest to the palette in use. High Contrast users get the operating
system's forced-colors mode, which the grid supports with system colors
(see [Accessibility](/docs/data-grid/accessibility)).

### Customizing the theme

The five seeds and `colorScheme`, plus `density`, `fontFamily`, `neutral`
and `surfaces`, are the whole customization surface, and the demos above
are the preview. Set the seeds to your brand's primary and status colors.

### Size modes

The theme's `density` is the size mode: `'compact'` makes rows 32px and
headers 36px with 13px text (see [Density](#density)). Row and header
heights also stay available as grid layout props for any other size: set
`rowHeight` and `headerHeight` on the `DataGrid` (the "Row size" control
below); an explicit prop wins over the density.

## Data Grid appearance

- `gridLines`: `'default'`, `'both'`, `'horizontal'`, `'vertical'` or
  `'none'`.
- `striped` (alternate row shading) and `highlightOnHover`, both default
  `true`.
- A fixed `rowHeight` (default 36 px, 32 px at compact density), or a
  per-row `getRowHeight` function, and `headerHeight` per header level
  (default 40 px, 36 px at compact density).
- `textWrap`: `'header'`, `'content'` or `'both'` (`true`) wraps text instead
  of truncating it. Content wrap needs measured rows: set
  `estimatedRowHeight` (see [Virtualization](/docs/data-grid/virtualization)).
- `className` and `style` on the grid, and attributes on cells and headers,
  merge after the system classes. `classNames` and `styles` take
  one entry per part: `root`, `toolbar`, `header`, `headerCell`, `body`,
  `row`, `cell`, `footer`, `pager`, `groupDropArea`, `groupCaption`,
  `detailRow`, `columnMenu`, `contextMenu`, `filterMenu`, `editor` (the
  wrapper of each inline or dialog cell editor), `empty` and `loading`.
- The root carries `.salmon-data-grid` and each part a `.salmon-data-grid-<part>`
  class (`.salmon-data-grid-cell`, `.salmon-data-grid-header-cell`,
  `.salmon-data-grid-row`); BEM `__` marks only a sub-element
  (`.salmon-data-grid-toolbar__more`). These classes and the `data-*` state
  attributes are stable within a major version. Style parts
  through `classNames` / `styles`; targeting the classes directly is
  permitted but, like any visual override, unsupported.
- Every Salmon UI rule is in the `salmon` cascade layer, so your own
  unlayered CSS overrides it whatever the specificity or the import order:
  `.orders .salmon-data-grid-cell { padding-inline: 4px }` wins without
  `!important`. If your app uses cascade layers, order `salmon` before
  importing any Salmon UI stylesheet, for example `@layer reset, salmon,
  app;`. The order in which you import the family stylesheets does not
  matter.

<!-- demo: appearance -->

## Icons

The grid's icons are built-in SVG images drawn by the grid stylesheet: they
paint with the current text color, so they follow the theme, hover and
active states, dark mode and forced-colors mode, mirror in right-to-left
layouts, and add no markup to the page. There is no icon font; replace an
icon with the `icons` prop. It is a component
prop, not part of the theme:

```tsx
import { ArrowUp, ArrowDown, Menu } from './my-icons';

<DataGrid
  aria-label="Orders"
  data={orders}
  columns={columns}
  sorting
  columnMenu
  icons={{
    sortAscending: <ArrowUp aria-hidden />,
    sortDescending: <ArrowDown aria-hidden />,
    columnMenu: <Menu aria-hidden />,
    filtered: null, // hide the filtered-column dot
  }}
/>
```

| Name | Where |
| --- | --- |
| `sortAscending`, `sortDescending` | Sorted header and group chip |
| `filter`, `filtered` | Header filter button; marker of a filtered column without one |
| `columnMenu` | Header column menu button |
| `groupByColumn`, `ungroup` | Header group toggle; group chip remove button |
| `expanded`, `collapsed` | Group caption and detail row toggles |
| `pagerFirst`, `pagerPrevious`, `pagerNext`, `pagerLast` | Pager buttons |
| `submenu`, `check` | Menu items with a submenu; checked menu items |
| `close`, `overflow`, `dragHandle` | Dialog and sheet close; toolbar overflow; row drag handle |

- A node replaces the built-in inside its button, which keeps its
  accessible name, so mark the icon `aria-hidden`. `null` hides an icon; a
  name left out keeps the built-in.
- `DataGridIconsProvider` gives every grid below it the same icons (for example
  an application icon set); a grid's own `icons` merge over it, and child
  grids inherit them.
- The icons are ordinary React nodes, so they render on the server and
  hydrate without a mismatch. Custom icons are not mirrored in right-to-left
  layouts; pass direction-aware icons if that matters.
- Menu and toolbar items keep their own `icon` field.

<!-- demo: icons -->

## API reference

[`DataGridProps`](/docs/reference/data-grid/DataGridProps) lists the
appearance props, [`DataGridPart`](/docs/reference/data-grid/DataGridPart)
the `classNames` / `styles` keys and
[`DataGridIcons`](/docs/reference/data-grid/DataGridIcons) the icon
names; [`ThemeProvider`](/docs/reference/core/theme/ThemeProvider) and
[`ThemeStyle`](/docs/reference/core/server/ThemeStyle) take the theme and
[`SalmonThemeInput`](/docs/reference/core/theme/SalmonThemeInput) lists
its settings.
