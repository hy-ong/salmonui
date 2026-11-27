---
title: Ribbon
description: An Office-style ribbon built from Tabs whose panels each hold a Toolbar of labelled groups, with multi-size commands that step down before they overflow, group launchers, a File menu, contextual tabs, the simplified layout and a collapsed ribbon.
category: Ribbon
order: 130
demos: [ribbon-recipe]
---

```tsx
import { Button } from '@salmonui/buttons/button';
import { MenuButton } from '@salmonui/buttons/menu';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { Toolbar, ToolbarGroup, ToolbarItem } from '@salmonui/navigation/toolbar';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/navigation/tabs/styles.css';
import '@salmonui/navigation/toolbar/styles.css';

<Tabs value={tab} onValueChange={setTab}>
  <div style={{ gridArea: 'list', display: 'flex', alignItems: 'center' }}>
    <MenuButton variant="ghost" items={fileItems}>File</MenuButton>
    <TabList aria-label="Ribbon tabs">
      <Tab value="home">Home</Tab>
      <Tab value="insert">Insert</Tab>
    </TabList>
  </div>
  <TabPanel value="home" tabIndex={-1}>
    <Toolbar aria-label="Home commands">
      <ToolbarGroup label="Clipboard" action={<Button variant="ghost" size="sm" iconOnly aria-label="Clipboard options"><LaunchIcon /></Button>}>
        <ToolbarItem label="Paste" sizes={['lg', 'md', 'sm']} overflowPriority={3}>
          {(size) =>
            size === 'sm' ? (
              <Button variant="ghost" size="sm" iconOnly aria-label="Paste" onClick={paste}><PasteIcon /></Button>
            ) : (
              <Button variant="ghost" size={size === 'lg' ? 'md' : 'sm'} iconStart={<PasteIcon />} onClick={paste}>Paste</Button>
            )
          }
        </ToolbarItem>
      </ToolbarGroup>
    </Toolbar>
  </TabPanel>
  <TabPanel value="insert" tabIndex={-1}>...</TabPanel>
</Tabs>
```

A ribbon is a set of tabs whose panels are toolbars, so it is built from
[Tabs](/docs/navigation/tabs) and [Toolbar](/docs/navigation/toolbar): the
tab row selects a panel, each panel holds one `Toolbar`, each group of
commands is a `ToolbarGroup` with a visible `label`, and each command is a
`ToolbarItem`. Tabs, groups and commands are all JSX, so the application
adds, removes, hides and disables commands by rendering.

## Structure

| Ribbon part | Salmon UI |
| --- | --- |
| The ribbon | `Tabs` around a tab row and one `TabPanel` per tab |
| A tab | `Tab` in the `TabList`; its `TabPanel` holds a `Toolbar` |
| A group | `ToolbarGroup label="..."`: the label shows under the group's items and names the group (`role="group"`) |
| A collection of items in a group | A run of items inside the group (items flow in one row) |
| A command | `ToolbarItem` around any control |
| The selected tab | `Tabs value` / `defaultValue` / `onValueChange`; `onBeforeValueChange` cancels (`event.preventDefault()`) |
| A group launcher | `ToolbarGroup action`: a `Button` next to the group label with its own `onClick` |
| A minimized ribbon | Application state: see [Minimize](#minimize) |
| Classic and simplified layouts | Application state that changes the items' `sizes`: see [Layouts](#layouts) |
| Contextual tabs | Conditionally rendered `Tab` and `TabPanel`: see [Contextual tabs](#contextual-tabs) |
| The File menu | A `MenuButton` placed before the `TabList` |

Give each `TabPanel` `tabIndex={-1}`: the toolbar inside it is the panel's
tab stop, so the panel itself does not need one.

## Commands and sizes

A command is a `ToolbarItem` with `sizes`, the sizes it may take, largest
first. Its child can be a function of the current size, so the command
renders differently at each one; the recipe uses three:

| Size | Ribbon look | In the demo |
| --- | --- | --- |
| `'lg'` | Large: icon over the label | A `Button` with `iconStart` and its label; the toolbar stacks a button's icon over its label in a `'lg'` item |
| `'md'` | Medium: icon and label in a row | The same `Button` at `size="sm"` |
| `'sm'` | Small: icon only | `Button iconOnly` with `aria-label` |

The current size is also `data-size` on `.salmon-toolbar-item`, for your own
CSS. The server and the first client render use `sizes[0]`; the toolbar
measures after mount.

Render the `ToolbarItem` itself inside the group (call a helper function
that returns it, as the demo does): a component of your own that returns a
`ToolbarItem` would be wrapped in a second, measured item, because the
toolbar wraps every direct child that is not a toolbar part.

### Item types

Any Salmon control works as an item:

| Command kind | Salmon UI control in a `ToolbarItem` |
| --- | --- |
| Button | `Button` (or `ToggleButton` for a toggled command) |
| Checkbox | `Checkbox` |
| Color picker | `ColorPicker` |
| Combo box | `Combobox` |
| Drop-down | `Select`, or `MenuButton` for a command menu |
| Split button | `SplitButton` |
| Button group | `ToggleButtonGroup` (single or multiple selection) |
| Custom content | Any content inside `ToolbarItem` |

Import the controls you use. Form fields (selects, comboboxes, inputs)
default to `overflow="never"`, because a field cannot be a menu entry;
buttons and checkboxes overflow into the menu, and choosing their entry
clicks the hidden control.

### Gallery

A style gallery is a `Listbox` with
`layout="grid"` inside a `Popover` launched from a `ToolbarItem`:
the tiles are grid cells, arrow keys move across rows and columns, Enter or a
click applies a style, and Escape closes the popover with focus back on its
trigger. Keep the item `overflow="never"` (the popover cannot be a menu
entry), or put a "Styles" `MenuButton` with the same choices in the overflow.
`Popover` comes from `@salmonui/overlays/popover` and `Listbox` from
`@salmonui/dropdowns/listbox`; import their `styles.css` as well.

```tsx
<ToolbarGroup label="Styles">
  <ToolbarItem overflow="never">
    <Popover placement="bottomStart">
      <Popover.Trigger render={(props) => <Button {...props} variant="ghost" />}>Styles</Popover.Trigger>
      <Popover.Content aria-label="Style gallery">
        <Listbox aria-label="Styles" layout="grid" columns={3} data={styles} onValueChange={applyStyle} />
      </Popover.Content>
    </Popover>
  </ToolbarItem>
</ToolbarGroup>
```

## Adaptive resizing

When the ribbon gets narrower, commands step down before anything leaves
the bar:

1. The command with the lowest `overflowPriority` (ties: the last one in
   the bar) steps down one size at a time, `'lg'` to `'md'` to `'sm'`, then
   the next command.
2. Only when every multi-size command is at its last size do items move
   into the overflow menu behind the "more" button, in the same order.
3. Widening reverses it.

Give the commands you want to keep large a higher `overflowPriority`. Item
widths are measured once per size and cached, so a resize is a read of the
container; React commits only when a size or the overflow set changes. The
stepping code is a separate chunk that loads only when an item declares more
than one size.

### Group overflow popups

Items that overflowed from a labelled group appear in the overflow menu
under the group's label, in bar order, so the menu keeps the ribbon's
grouping; the overflow menu's open state tells when it shows. A group whose items
have all overflowed is hidden together with its label and launcher.

## Layouts

The classic layout is the default above. The simplified layout is a single
row of small commands: switch every command's `sizes` to `['sm']` from
application state, and render the layout switch where you like, for example after the `TabList`:

```tsx
const sizes = layout === 'classic' ? ['lg', 'md', 'sm'] : ['sm'];

<Button aria-pressed={layout === 'simplified'} onClick={() => setLayout(layout === 'classic' ? 'simplified' : 'classic')}>
  Simplified
</Button>
```

A one-entry `sizes` list fixes the size, so the toolbar only moves items
into the menu. No refresh call is needed: the toolbar re-measures on resize
and after every render.

## Minimize

Keep a `collapsed` flag in application state. While it is set, hide the
`TabPanel`s and show the selected tab's toolbar in a [Popover](/docs/layout/popover)
anchored to the ribbon when a tab is clicked:

```tsx
<TabPanel value={value} tabIndex={-1} style={collapsed ? { display: 'none' } : {}}>
  {collapsed ? null : panel(value)}
</TabPanel>

<Popover open={collapsed && popup} onOpenChange={setPopup} anchor={ribbonRef} placement="bottomStart">
  <Popover.Content aria-label="Ribbon commands">{panel(tab)}</Popover.Content>
</Popover>
```

Open the popover from `Tabs onValueChange` and from each `Tab onClick` (a
click on the selected tab does not change the value). Escape and an outside
press close it. Collapsing and expanding are your own state changes, so
any code that reacts to them belongs where you set the flag.

## Contextual tabs

Render a contextual tab only while its context applies, for example while a
table is selected, and move the selection back when it disappears:

```tsx
const current = tab === 'table' && !tableSelected ? 'home' : tab;

<TabList aria-label="Ribbon tabs">
  <Tab value="home">Home</Tab>
  {tableSelected ? <Tab value="table">Table Design</Tab> : null}
</TabList>
```

## File menu and Backstage

The File menu is a `MenuButton` placed before the `TabList` in the tab row.
Backstage (a full-screen File view) is not built: open a full-screen
[Dialog](/docs/layout/dialog) with a vertical `Tabs` list from the File menu
instead. The help pane is any element after the
`TabList` in the same row.

## Tooltips

Wrap a command in the Layout category's [Tooltip](/docs/layout/tooltip) for a
title and a description. Use its `render` form so the `Button` stays the
item's direct child (the toolbar styles a large item's button directly):

```tsx
<Tooltip
  content={<span><strong>Paste</strong><br />Add content from the clipboard.</span>}
  render={(trigger) => <Button {...trigger} variant="ghost" iconStart={<PasteIcon />}>Paste</Button>}
/>
```

The tooltip opens on hover and keyboard focus and describes the button
(`aria-describedby`).

## Keyboard and accessibility

The ribbon is three kinds of tab stops, each with its own APG keys:

| Part | Keys |
| --- | --- |
| File `MenuButton` | Enter, Space or ArrowDown open the menu; arrows move; Escape closes and returns focus |
| `TabList` (APG Tabs) | One tab stop; ArrowLeft / ArrowRight move and select (mirrored under `dir="rtl"`), Home / End |
| Panel `Toolbar` (APG Toolbar) | One tab stop that returns to the last focused command; ArrowLeft / ArrowRight move through the commands, the group launchers and the "more" button, Home / End |
| Overflow menu | ArrowDown on "more" opens it on the first entry; ArrowUp / ArrowDown move through all groups; Enter runs the command; Escape closes and returns focus |

Each group is a `role="group"` named by its label; the launcher is a button
with its own `aria-label`. KeyTips are not built:
put `aria-keyshortcuts` on commands that have application shortcuts.

## Not provided

Not offered, each with the reason and what to use:

- Backstage: an Office-style full-screen File view that existing
  parts already cover. Put the Backstage items into a full-screen `Dialog`
  with a vertical `Tabs` list, opened from the File `MenuButton`.
- KeyTips: they need a global key-sequence layer over every item,
  which a composition of separate parts has no single owner for. Register
  your shortcuts in your application and announce them with
  `aria-keyshortcuts`; the tabs and toolbar keyboard models stay available.
- A help pane slot: in a composition it is simply an element.
  Render the help pane content after the `TabList` in the tab row.
- Imperative methods that add, remove, update, show, hide, enable or
  disable tabs, groups, collections and items: the composition is
  declarative, so tabs, groups and items exist because you render them.
  Make each change a state change: render, hide (conditional rendering) or
  disable (`disabled`) the controls.
- A built-in layout switcher button and a collapse button: render your own
  (the demo puts both after the `TabList`).

## Server rendering

The ribbon is a `Tabs` and a set of `Toolbar`s, so it renders on the server
and hydrates without warnings: every command renders at `sizes[0]` on the
server, and the toolbar steps sizes and fills the overflow menu only after
mount. Popovers, menus and tooltips mount on the client.

## API reference

The ribbon is built from the parts in
[`@salmonui/navigation/tabs`](/docs/reference/navigation/tabs),
[`@salmonui/navigation/toolbar`](/docs/reference/navigation/toolbar),
[`@salmonui/buttons/menu`](/docs/reference/buttons/menu),
[`@salmonui/overlays/popover`](/docs/reference/overlays/popover) and
[`@salmonui/dropdowns/listbox`](/docs/reference/dropdowns/listbox).
