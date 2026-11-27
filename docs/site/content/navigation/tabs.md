---
title: Tabs
description: Tabs, TabList, Tab and TabPanel implement the APG Tabs pattern with controlled selection, a cancellable before-event, four placements, lazy panels, scroll or menu overflow, closable tabs and lazy drag reordering.
category: Tabs
order: 40
demos: [tabs-basics, tabs-editor, tabs-options]
---

```tsx
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import '@salmonui/navigation/tabs/styles.css';

<Tabs defaultValue="general">
  <TabList aria-label="Settings">
    <Tab value="general">General</Tab>
    <Tab value="billing" icon={<CardIcon />}>Billing</Tab>
    <Tab value="audit" disabled>Audit log</Tab>
  </TabList>
  <TabPanel value="general">…</TabPanel>
  <TabPanel value="billing">…</TabPanel>
  <TabPanel value="audit">…</TabPanel>
</Tabs>
```

`@salmonui/navigation/tabs` imports no other family on its initial path. With
`overflow="menu"` it loads the Buttons `Menu` (`@salmonui/buttons/menu`) in a
lazy chunk the first time the **More tabs** menu opens; import
`@salmonui/buttons/menu/styles.css` too when you use it. The Tabs
stylesheet needs nothing besides `@salmonui/core/styles.css`, which every
app imports once.

## Parts

| Component | Element | Notes |
| --- | --- | --- |
| `Tabs` | `<div class="salmon-tabs">` | Owns the selection and the options; `ref` is this element. Arranges the list and the panels in a CSS grid. |
| `TabList` | `<div class="salmon-tab-list">` around `<div role="tablist">` | `className` / `style` reach the wrapper (which also holds the scroll buttons and the More tabs button); `aria-label`, `aria-labelledby`, other DOM props and `ref` reach the `role="tablist"` element. |
| `Tab` | `<button role="tab" type="button">` | `value` (stable key, matches its panel), children as label, `icon` (decorative `ReactNode`), `iconPlacement`, `disabled`, `hidden`, `onClose`, `render`. |
| `TabPanel` | `<div role="tabpanel">` | `value` of its tab; labelled by the tab, `tabIndex={0}`. |

Each `Tab` is one tab: its children are the label, and any JSX
works there; `icon` adds a decorative icon;
`disabled` makes the tab `aria-disabled` and skips it in arrow-key
navigation; `hidden` removes it; `className` styles it. `iconPlacement`
(`'start'` default, `'end'`, `'top'`, `'bottom'`) positions the icon;
`start` / `end` are logical, so they follow the writing
direction.

Tabs come from children, so adding, removing, hiding and enabling a tab is a
change to the array the children render from, and `value` selects a tab.
There are no imperative methods or add events for the tab collection:
the tab collection belongs to the application, methods
that mutate an internal copy would let the UI and the application state
disagree, and adding a tab is your own action, so it needs no event to
observe it. Insert a `Tab` and its `TabPanel` into the array (then select it
with `value`) and use `Tab disabled` / `hidden`; no refresh call is needed,
because overflow and the selection indicator update by themselves. Render a
router link as a tab with `render`: it receives every computed prop (role,
ids, ARIA, `tabIndex`, handlers) and must spread them.

```tsx
<Tab value="docs" render={(props) => <Link {...props} to="/docs" />}>Docs</Tab>
```

## Selection

`value` / `defaultValue` / `onValueChange(value, event)` hold the selected
tab. The value is the tab's `value`, not its index, so
it survives reordering and insertion. Without `value` and `defaultValue`
the first enabled tab becomes selected after mount; pass `defaultValue` so
the server already renders the selected panel.

`onBeforeValueChange(event)` runs before every change with `{ value,
previousValue, source }` (`source`: `'pointer' | 'keyboard' | 'touch' |
'api'`); `event.preventDefault()` keeps the current tab.
`onValueChange` follows with the same fields. A controlled `Tabs` can also refuse a change by not
updating `value`. Event objects are created only when a handler is bound
and are frozen in development.

`disabled` on `Tabs` disables every tab.

## Keyboard and accessibility

The component follows the WAI-ARIA APG Tabs pattern:

| Key | Action |
| --- | --- |
| Tab | Moves focus into the list (onto the selected tab), then to the panel. The list is one tab stop. |
| ArrowRight / ArrowLeft | Next / previous tab in a horizontal list, wrapping; mirrored under `dir="rtl"`. |
| ArrowDown / ArrowUp | Next / previous tab in a vertical list (`placement="start"` or `"end"`). |
| Home / End | First / last enabled tab. |
| Enter / Space | Selects the focused tab (with `activation="manual"`). |
| Delete | Calls `onClose` of a closable focused tab. |
| Alt+Arrow | Moves the focused tab one place (`reorderable`). |

`activation="automatic"` (default) selects a tab when it receives focus, the
APG recommendation, cheap here because panels mount lazily; `"manual"`
moves focus only and selects on Enter or Space, for panels that are
expensive to show. Disabled and hidden tabs are skipped.

Tabs carry `aria-selected`, `aria-controls` and `aria-disabled`; the list
carries `aria-orientation`; each panel has `aria-labelledby` pointing at its
tab. A closable tab has `aria-keyshortcuts="Delete"`; its close control is
pointer-only and hidden from assistive technology, so a tab never contains a
second interactive element.

## Placement

`placement` sets where the tab list sits: `'top'` (default),
`'bottom'`, `'start'` or `'end'`. It is a CSS grid arrangement on the root
(`data-placement`); `'start'` and `'end'` make the list vertical
(`aria-orientation="vertical"`, Up / Down keys) and are logical sides, so
the list moves to the right in RTL.

## Overflow

`overflow="scroll"` (default) scrolls the
strip natively, by touch, wheel and keyboard focus, and shows two scroll
buttons while it overflows. They are pointer conveniences (`aria-hidden`,
never focused); `scrollStep` sets the pixels per press, default 100.
The selected tab is scrolled into view when the value changes.

`overflow="menu"` measures the tabs and moves
the ones that do not fit into a **More tabs** menu button after the strip.
Choosing a tab there selects it. The selected tab is always kept in the
visible strip: the measurement pins it, so selecting from the menu swaps it
in. The server and the first client
render show every tab; the fit is applied after mount by attribute changes
only, so hydration is unaffected. The measurer and the menu are lazy chunks
loaded only when `overflow="menu"` is used, and one `ResizeObserver` per
document serves every overflow container.

## Closing tabs

`onClose` on a `Tab` shows a close button and makes Delete on the focused
tab call it with `{ value, source }`. The application removes the
tab from its array; to refuse a close, simply do not remove it. When the removed tab had focus, focus moves to the
next tab (or the previous one at the end); when it was selected, that
neighbor is selected with `source: 'api'`.

```tsx
<Tab value={file} onClose={() => setFiles((list) => list.filter((f) => f !== file))}>
  {file}
</Tab>
```

## Reordering

`reorderable` lets the user drag a tab along the strip or press Alt+Arrow on
it. `onBeforeReorder(event)` can cancel; `onReorder(event)`
reports `{ value, fromIndex, toIndex, source }` (indices among the `Tab`
elements) and the application moves the tab in its array. The drag code is a
lazy chunk loaded on the first press on a tab or the first Alt+Arrow; the
drag preview moves the tabs with CSS `transform`, with no React render per
pointer move. Escape cancels a drag. Dragging a tab onto another component
is not offered: it needs a cross-component drag protocol, and the
shared drag primitive covers reordering within one list. For drops onto
other components, handle native drag events on your own elements.

## Panels

`panelMount` decides when panel content mounts:

| Value | Behavior |
| --- | --- |
| `'lazy'` (default) | A panel's content mounts on its first selection and stays mounted (state kept). |
| `'active'` | Only the selected panel's content is mounted. |
| `'eager'` | Every panel's content is mounted, also in server HTML, hidden while not selected. |

Every `TabPanel` element is always rendered (so `aria-controls` resolves);
only its children follow `panelMount`. The server renders the selected
panel's content (all panels with `'eager'`), so server HTML matches the
first client render.

Panel height is CSS: it is layout, expressed without JavaScript
measurement, so you set it with CSS on `TabPanel` (`className`). Panels size
to their content by default. To fill a fixed area, give `Tabs` a height (the
panel row is `1fr`). To size every panel to the tallest one, use
`panelMount="eager"` and keep the hidden panels in the grid cell:

```css
.equal-panels > .salmon-tab-panel[hidden] { display: block; visibility: hidden; }
```

Swiping between panels is not offered: swipe gestures are not on
the default path, as for the Carousel and the Sidebar. The tabs and the
arrow keys switch panels.

## Localization

`localeText` overrides any of `TABS_DEFAULT_LOCALE_TEXT`:
`scrollBackward`, `scrollForward` (scroll button titles), `moreTabs` (the
menu button's name and the menu label) and `close` (the close button title).

```tsx
<Tabs localeText={{ moreTabs: 'Weitere Tabs', close: 'Schließen' }}>…</Tabs>
```

## Styling and RTL

Classes are `.salmon-tabs`, `.salmon-tab-list`, `.salmon-tab-list-strip`,
`.salmon-tab`, `.salmon-tab-icon`, `.salmon-tab-label`, `.salmon-tab-close`,
`.salmon-tab-scroll`, `.salmon-tab-more` and `.salmon-tab-panel`; state is in
`data-*` attributes (`data-selected`, `data-disabled`, `data-placement`,
`data-orientation`, `data-icon-placement`, `data-overflow-hidden`,
`data-dragging`). `className` and `style` pass through on every part.
The CSS uses logical properties only, reads the inherited `dir`
 and only the theme's color variables; the selection indicator sits
on the edge facing the panels in every placement.

## API reference

[`@salmonui/navigation/tabs`](/docs/reference/navigation/tabs): `Tabs`, `TabList`,
`Tab`, `TabPanel`, `TABS_DEFAULT_LOCALE_TEXT` and the event, placement and
locale types.
