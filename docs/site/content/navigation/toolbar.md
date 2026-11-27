---
title: Toolbar
description: Toolbar groups buttons, menu buttons and inputs into one APG toolbar with a single tab stop, arrow-key navigation, start / center / end alignment, and overflow into a menu, a scrolling strip or extra rows.
category: Toolbar
order: 10
demos: [toolbar-basics, toolbar-overflow, toolbar-states]
---

```tsx
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { MenuButton } from '@salmonui/buttons/menu';
import { Toolbar, ToolbarGroup, ToolbarItem, ToolbarSeparator, ToolbarSpacer } from '@salmonui/navigation/toolbar';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css'; // the overflow menu
import '@salmonui/navigation/toolbar/styles.css';

<Toolbar aria-label="Formatting">
  <ToggleButton aria-label="Bold" iconOnly><BoldIcon /></ToggleButton>
  <ToggleButton aria-label="Italic" iconOnly><ItalicIcon /></ToggleButton>
  <ToolbarSeparator />
  <ToolbarItem label="Font size">
    <input aria-label="Font size" type="number" defaultValue={14} />
  </ToolbarItem>
  <ToolbarSpacer />
  <ToolbarGroup align="end">
    <Button onClick={save}>Save</Button>
    <MenuButton items={moreItems}>More</MenuButton>
  </ToolbarGroup>
</Toolbar>
```

`Toolbar` takes children instead of an `items` array. Any child works:
Buttons family controls (`Button`, `ToggleButton`, `ToggleButtonGroup`,
`MenuButton`, `SplitButton`), inputs, links or your own content. Each direct
child that is not a toolbar part is wrapped in a measured `ToolbarItem`
automatically; wrap a child yourself to give it a menu `label` / `icon` or
overflow settings.

## Items

| Item need | Salmon UI |
| --- | --- |
| A button with text and icons | A `Button` with its children and `iconStart` / `iconEnd` |
| A separator | `ToolbarSeparator` (`role="separator"`, perpendicular to the bar) |
| An input or custom content | Any content inside `ToolbarItem` |
| Start, center or end alignment | `ToolbarGroup align="start" \| "center" \| "end"`, or `ToolbarSpacer` |
| Disabled or hidden items | The child's own `disabled`; render the child conditionally |
| A tooltip | The child's `title`, or a [Tooltip](/docs/layout/tooltip) around the child |
| Tab order | Not needed: the toolbar is one tab stop (see below) |
| A click handler | The child's own `onClick` |

`ToolbarItem` props: `label` and `icon` (the overflow menu entry),
`overflow: 'auto' | 'never' | 'always'` and `overflowPriority`, `sizes`
(see [Multi-size items](#multi-size-items)), plus `className`, `style` and
any `div` attribute. Its child can be a function of the item's current size.

## Groups

`ToolbarGroup` keeps a run of items together and aligns it (`align`). With
`label` it shows a visible label under its items and becomes a
`role="group"` named by that label (pass `aria-labelledby` to name it
otherwise); `action` puts a control next to the label, typically a small
icon-only `Button` that opens the group's settings (a launcher). The action
is a toolbar stop after the group's items and never overflows; a labelled
group whose items have all overflowed is hidden. This is how the
[Ribbon](/docs/navigation/ribbon) builds its groups.

## Multi-size items

`sizes` lists the sizes an item may take, largest first, from
`'lg' | 'md' | 'sm'`. The item renders `sizes[0]` on the server and until the
toolbar has measured; the current size is `data-size` on the item and the
argument of a function child:

```tsx
<ToolbarItem label="Paste" sizes={['lg', 'md', 'sm']} overflowPriority={2}>
  {(size) =>
    size === 'sm' ? (
      <Button iconOnly aria-label="Paste"><PasteIcon /></Button>
    ) : (
      <Button size={size === 'lg' ? 'md' : 'sm'} iconStart={<PasteIcon />}>Paste</Button>
    )
  }
</ToolbarItem>
```

With `overflow="menu"`, when the items do not fit, the item with the lowest
`overflowPriority` (ties: the last one) steps down one size at a time until
it reaches its last size, then the next item; items move into the overflow
menu only when every multi-size item is at its last size. A one-entry list
fixes the size. `overflow="scroll"` and `"wrap"` keep `sizes[0]`. In a
`'lg'` item the toolbar stacks a `Button`'s icon over its label.

Widths are measured once per size and cached; the stepping code is loaded
only when an item declares more than one size, so other toolbars do not pay
for it.

Render `ToolbarItem` directly inside the toolbar or group (or call a helper
function that returns it): a component of your own that returns a
`ToolbarItem` is wrapped in a second, measured item, because every direct
child that is not a toolbar part is wrapped.

## Overflow

`overflow` decides what happens when the items do not fit:

- `'menu'` (default): items that do not fit are hidden and listed in a menu
  behind a "more" button at the end of the bar (items of a labelled group
  under the group's label). Items leave from the end;
  a higher `overflowPriority` keeps an item longer. `overflow="never"` keeps
  an item in the bar (form fields default to it, because an input cannot be
  a menu entry), `overflow="always"` puts it in the menu at every width.
  An overflowed control stays in the DOM with `hidden`, keeping its state:
  choosing its menu entry calls `click()` on it, so one `onClick` handles
  both places. The entry shows `ToolbarItem label` / `icon`, else the
  control's `aria-label`, `title` or text. An icon-only button with
  `aria-label` therefore shows as icon in the bar and as text in the menu.
- `'scroll'`: the items scroll in one line; scroll buttons appear at the
  ends while there is more to see and move by `scrollStep` px (default
  120). Touch and trackpads scroll natively; keyboard focus scrolls the
  focused item into view.
- `'wrap'`: items wrap onto more rows.

The overflow is measured with one shared `ResizeObserver` per document:
item sizes are cached, each resize is a read phase only, and React commits
only when the set of hidden items changes. The server and the first client
render show every item; hiding happens after mount by setting `hidden`, so
the hydrated markup never differs. The measuring code and the overflow menu
are loaded on demand, so `@salmonui/navigation/toolbar` stays small.

The overflow menu is the Menu family's `Menu` in a collision-aware popup that
flips and shifts to stay in the viewport. Import
`@salmonui/buttons/menu/styles.css` when you use `overflow="menu"`.

A `MenuButton` child that overflows would open its menu from a hidden
button; give it `overflow="never"` (or a higher `overflowPriority`).

## Keyboard and ARIA

The toolbar follows the WAI-ARIA Authoring Practices Toolbar pattern:
`role="toolbar"`, `aria-orientation`, and an accessible name through
`aria-label` or `aria-labelledby`.

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Enter the toolbar on the control focused last (the first one the first time); the next Tab leaves the toolbar |
| ArrowRight / ArrowLeft | Next / previous control, wrapping (mirrored under `dir="rtl"`); ArrowDown / ArrowUp with `orientation="vertical"` |
| Home / End | First / last control |
| ArrowDown (horizontal), ArrowRight (vertical), Enter, Space on "more" | Open the overflow menu on its first entry; Escape closes it and returns focus |

Inside a text input, Home / End and the arrows move the caret; ArrowLeft /
ArrowRight leave the input only at the start or end of its text. Selects,
textareas, sliders and number inputs keep every arrow key. Disabled buttons
are skipped. A nested `ToggleButtonGroup` keeps its own arrow keys.

`onKeyDown` runs before the toolbar's keys; call `event.preventDefault()`
to handle a key yourself.

`disabled` disables every control at once (the content is a disabled
`<fieldset>`) and sets `aria-disabled="true"` on the toolbar.

## Orientation

`orientation="vertical"` stacks the items, measures overflow along the block
axis and moves focus with ArrowUp / ArrowDown. Give a vertical toolbar a
height for `overflow="menu"` to have an effect.

## Locale

`localeText` overrides the strings in `TOOLBAR_DEFAULT_LOCALE_TEXT`:
`more` (the overflow button name), `scrollBack` and `scrollForward` (scroll
button titles). `moreIcon` replaces the three-dot icon.

## Styling

`.salmon-toolbar` with `data-orientation`, `data-overflow`,
`data-disabled`, and while scrolling `data-scrollable`, `data-at-start`,
`data-at-end`. Parts: `.salmon-toolbar-content`, `.salmon-toolbar-item` (`data-size`),
`.salmon-toolbar-group` (`data-align`, `data-labelled`),
`.salmon-toolbar-group-items`, `.salmon-toolbar-group-label`,
`.salmon-toolbar-spacer`,
`.salmon-toolbar-separator`, `.salmon-toolbar-more` (`data-open`),
`.salmon-toolbar-scroll-button` (`data-scroll="back" | "forward"`) and
`.salmon-toolbar-menu`. `className` and `style` pass through on every part.
Colors come from the theme variables; layout uses logical properties only.

For an application bar, see the [App Bar](/docs/navigation/app-bar).

## State

The toolbar has no selection or open state of its own, so there is no
controlled / uncontrolled pair: each child keeps its own (a controlled
`ToggleButton pressed`, an input `value`). The overflow is derived from the
measured width and needs no prop.

## Server rendering

The server and the first client render show every item; overflowed items
are hidden only after mount, by setting `hidden`, so hydration never sees a
different tree. Multi-size items render `sizes[0]` until the
toolbar has measured.

## Not included

- An overflow mode that expands a second row on demand is not offered:
it would double the layout modes for one rarely used case. Use
  `overflow="menu"`, giving inputs `ToolbarItem overflow="never"`, or
  `overflow="wrap"` to keep every item visible.
- Per-item tab order is not offered: the APG toolbar has one tab
  stop with roving focus, which a per-item `tabIndex` would break.
- Turning off keyboard navigation is not offered: the APG keys are
  the accessible contract and are always on. To suppress one key, call
  `event.preventDefault()` in the toolbar's `onKeyDown`.
- Imperative methods that add, remove, enable or hide items, or refresh the
  overflow, are not offered: the children belong to the
  application. Change the children and their props
  (`disabled`, conditional rendering); the overflow re-measures on resize
  and on child changes by itself.

## API reference

[`@salmonui/navigation/toolbar`](/docs/reference/navigation/toolbar): `Toolbar`,
`ToolbarItem`, `ToolbarGroup`, `ToolbarSeparator`, `ToolbarSpacer`,
`TOOLBAR_DEFAULT_LOCALE_TEXT` and their types.
