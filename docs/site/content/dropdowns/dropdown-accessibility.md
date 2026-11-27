---
title: Accessibility and performance
description: WAI-ARIA patterns, screen reader announcements, forced colors, contrast, touch and focus rules, and the performance budgets the dropdowns are gated on.
category: Guides
order: 80
demos: [dropdown-accessibility, dropdown-large-lists]
---

## Accessibility

Each component follows one WAI-ARIA Authoring Practices pattern: `Select`
the select-only combobox, `Combobox` the editable combobox with list
autocomplete (a `grid` popup with `columns`), `Listbox` the listbox (the
grid with `layout="grid"`), `Mention` combobox semantics on its field and
`TreeSelect` a combobox with a tree popup.

- Conformance: `npm run test:a11y` runs axe-core over every
  dropdown, closed and open, in light, dark and right-to-left layouts, with
  zero violations, and keeps ARIA snapshots of the open lists.
- Screen readers: virtual options carry `aria-setsize` and
  `aria-posinset` ("12 of 10,000"); a polite live region announces the
  result count after a search and the selection limit of `maxSelected`
  (`localeText.resultCount` and `localeText.limitReached` on `Select` and
  `Combobox`; `resultCount` and `selectionLimit` on `Listbox`).
- Virtual focus: DOM focus stays on the trigger, input or list
  (or the popup search field of `searchable`), and the active option is `aria-activedescendant`. The active option is
  always mounted, even when the list is scrolled away from it.
- High contrast: under `forced-colors: active` selected options
  use `Highlight`, the active option an outline, disabled options
  `GrayText`, and chips and fields keep their borders.
- Color contrast: every color comes from the theme variables
  derived from the five seeds ([Theme](/docs/data-grid/appearance)), whose
  text and boundary contrast is guaranteed; no stylesheet has a literal
  color.
- Touch: options, triggers and chip remove buttons
  are at least 24 × 24 px, nothing appears on hover only, and the popup
  flips and shifts to stay on screen when an on-screen keyboard shortens the
  viewport. `popupMode="sheet"` on `Select` and `TreeSelect` (or `"auto"`
  on phones) opens a full-screen sheet.
- Focus: opening and closing keep focus on the trigger or
  input; after a pointer pick focus returns there; the focused control
  shows the theme focus ring.

The keyboard tables are on each component page:
[Select](/docs/dropdowns/select), [Combobox](/docs/dropdowns/combobox),
[Listbox](/docs/dropdowns/listbox), [Mention](/docs/dropdowns/mention) and
[TreeSelect](/docs/dropdowns/tree-select).

<!-- demo: dropdown-accessibility -->

## Performance

The dropdowns are measured on the production build in Chromium; the
budgets gate the release (`npm run release:verify`).

| Scenario | Budget |
| --- | --- |
| Open a `Select` or `Combobox` over 100,000 local items, click to painted | ≤ 50 ms, options in DOM ≤ visible + 2 × overscan |
| One filter step over 100,000 items with the index built; index build | ≤ 8 ms p95; ≤ 40 ms, after the first paint |
| Scroll the popup or a `Listbox` at 2,000 px/s | handler ≤ 1 ms p95, frame ≤ 16.7 ms p95, 0 blank frames |
| Move the active option | ≤ 2 options re-rendered per key |
| Select all over 100,000 items | ≤ 20 ms; the event's `items` built on first read |

- Remote search: every new search or window aborts the requests
  it supersedes (`AbortSignal`), and a response for an older search never
  replaces a newer one.
- Server rendering: the server renders the trigger, the value
  and the hidden form element (and a `Listbox` list), never a popup, and
  its work does not grow with `data` beyond the value label lookup. The
  Vite SSR and Next App Router examples hydrate every dropdown without a
  warning.
- Bundle size: each component is its own subpath with its own
  gzip budget (`@salmonui/dropdowns/select`, `/combobox`, `/listbox`,
  `/mention`, `/tree-select`); popups, search, remote reads, drag and drop
  and the grid keyboard are lazy chunks.
- Closed dropdowns: a closed dropdown adds no document or
  window listeners, observers or intervals; they are attached when a popup
  opens and removed when it closes.

<!-- demo: dropdown-large-lists -->
