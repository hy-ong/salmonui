---
title: Accessibility
description: One ARIA grid tree, the keyboard map, live-region announcements, focus across virtualization and overlays, accessible names, contrast, reduced motion and forced colors.
category: Accessibility
order: 122
demos: [accessibility]
---

The grid targets WCAG 2.2 AA in every state. This page shows what an
application gets and what it must provide.

## One grid tree

`DataGrid` renders a single `role="grid"` element. The header, body and footer
are `rowgroup`s inside it, rows are `row`s, header cells `columnheader`s and
body cells `gridcell`s; toolbar, search, pager and menus use `toolbar`,
`search`, `navigation` and `menu` roles. The grid sets
`aria-rowcount` and `aria-colcount` to the full size, each row and cell its
`aria-rowindex` and `aria-colindex` (so virtualized rows keep their real
positions), and `aria-sort`, `aria-selected`, `aria-expanded` (on
the group and detail toggles, never on a row), `aria-busy`, `aria-rowspan` / `aria-colspan` where they apply.

### One ARIA tree, no split header table

The grid does not split into a header table and a content table stitched
together with `aria-owns`, because that produces two ARIA trees and
axe-core warnings. Salmon UI keeps one tree in one scroll container, so
`aria-owns` is unnecessary and axe-core reports zero violations. One tree
also keeps the sticky header and the body in one scroll path. To style or
test the header or the body, target the `header` and `body` parts
(`classNames` / `styles`); to reach their elements, call
`api.getPartElement('header')` or `api.getPartElement('body')`.

## Accessible name

Give every grid a name with `aria-label` or `aria-labelledby`; a
development warning names the grid when both are missing.
`aria-describedby` points at help text. The demo labels the grid with its
visible heading.

```tsx
<h2 id="orders-title">Customer orders</h2>
<DataGrid aria-labelledby="orders-title" aria-describedby="orders-help" data={orders} columns={columns} />
```

## Keyboard

The grid is one Tab stop: exactly one element inside it has
`tabindex="0"`, and Tab / Shift+Tab leave it. The bindings, with macOS
variants:

| Keys | Behavior |
| --- | --- |
| Arrow keys | Move cell focus (left and right flip in RTL) |
| Home / End | First / last cell of the row |
| Ctrl+Home / Ctrl+End (⌘+Home / ⌘+End) | First / last cell of the grid |
| PageUp / PageDown | One viewport up / down |
| Alt+J / Alt+W | Focus the grid root / the grid content |
| F6 / Shift+F6 | Cycle through the toolbar, group panel, header, body, footer and pager |
| Enter on a header | Sort; Ctrl/⌘+Enter adds to a multi-column sort, Shift+Enter removes it |
| Alt+ArrowDown / Shift+Alt+ArrowDown on a header | Filter menu / column menu |
| Space | Toggle the selection of the focused row |
| Shift+Arrow | Extend the selection |
| Ctrl/⌘+A | Select all rows |
| Shift+F10 | Context menu |
| Escape | Close the open menu, then cancel editing, then clear the range |

Remap any command with `keyBindings` and intercept keys with `onKeyDown`
(see [Data Grid API and keyboard hooks](/docs/data-grid/api)); the default
table is exported as `DEFAULT_KEY_BINDINGS` from `@salmonui/data-grid/engine`.

```tsx
<DataGrid keyBindings={{ 'selection.selectAll': ['Mod+Shift+L'] }} aria-label="Orders" data={orders} columns={columns} />
```

## Screen reader announcements

Each grid renders a polite live region and announces sort, filter, search,
selection, paging, loading, column moves and pins, edits and export
progress, localized through `localeText` and debounced so only the latest
message is read. Cell content is read from the DOM; icons are
`aria-hidden` and icon-only buttons carry `aria-label`. The demo copies the
live region into a visible log.

Every grid state is checked with axe-core, and the accessibility tree a
screen reader reads (roles, names, states and live regions) is pinned by
ARIA snapshot tests. Column headers are named by their label only, so the
resize handle and header buttons are not repeated on every column move.
There is no screen reader automation: JAWS, NVDA and VoiceOver are not
tested.

## Focus across virtualization and overlays

Focus is logical: the grid remembers `{ rowId, field }`, not a DOM node.
When the focused cell scrolls out of the rendered window, the
grid root keeps the tab stop and the next arrow key or the remounted cell
brings DOM focus back to the same cell. Menus, dialogs and the column
chooser push their invoker on a focus stack, and closing returns focus to
it. `api.focusCell(rowId, field)` scrolls a cell into view and focuses it.

## Contrast, reduced motion and forced colors

- The derived palette guarantees at least 7:1 for body text, 4.5:1 for
  secondary text and 3:1 for borders, focus ring and selection, in light and
  dark, for any valid color seed. Try your own seeds in the
  [theme colors demo](/docs/data-grid/appearance).
- `prefers-reduced-motion: reduce` leaves no transition or animation in the
  grid; `prefers-contrast: more` moves borders and text to higher-contrast
  steps (secondary, placeholder and semantic text at least 7:1, default
  borders 4.5:1, strong borders 7:1) and widens the focus ring to 3px;
  `forced-colors: active` switches to system colors, with selection
  in `Highlight` / `HighlightText` and a visible focus outline.

## Tests

- `tests/browser/a11y.spec.ts`: axe-core in every built state (default,
  focused, selected, sorted, dark, RTL, forced colors, `prefers-contrast:
  more` with measured text and border ratios) with zero violations.
- `tests/browser/keyboard.spec.ts`: the keyboard map in LTR and RTL with
  Windows and macOS variants.
- `packages/core/tests/theme.test.ts`: contrast guarantees for the default
  seeds and 20 random seed sets, standard and `prefers-contrast: more`.
- `docs/site/tests/accessibility.spec.ts`: this page's demo (axe-core,
  roles, keyboard, live region, focus restoration, forced colors).

<!-- demo: accessibility -->

## API

The ARIA props (`aria-label`, `aria-labelledby`, `aria-describedby`),
`keyBindings`, `onKeyDown` and `localeText` are on
[`DataGridProps`](/docs/reference/data-grid/DataGridProps);
`focus`, `focusCell`, `focusHeader` and `getPartElement` are on
[`DataGridApi`](/docs/reference/data-grid/DataGridApi), and the
default key table is
[`DEFAULT_KEY_BINDINGS`](/docs/reference/data-grid/engine/DEFAULT_KEY_BINDINGS).
