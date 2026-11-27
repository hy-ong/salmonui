---
title: Split Button
description: SplitButton joins a primary Button and a menu trigger in one group, with the Menu Button keyboard model on the trigger and Alt+ArrowDown on the primary part.
category: Menus
order: 30
demos: [split-button, button-group-menus]
---

```tsx
import { SplitButton, MenuItem } from '@salmonui/buttons/menu';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';

<SplitButton
  onClick={save}
  onAction={(event) => (event.id === 'draft' ? saveDraft() : saveAs())}
  menu={
    <>
      <MenuItem id="draft">Save as draft</MenuItem>
      <MenuItem id="as">Save as…</MenuItem>
    </>
  }
>
  Save
</SplitButton>
```

`SplitButton` renders an attached `ButtonGroup` (`role="group"`,
`.salmon-button-group.salmon-split-button`) of two `Button`s: the primary part with the `children`, `iconStart` and `iconEnd`,
and an icon-only trigger part with a chevron. The
primary part takes `onClick` and the other DOM props; `ref` is the
primary `<button>`. `className` and `style` reach the group; `classNames` and
`styles` take the parts `primary`, `trigger` and `menu`.

Everything about the menu is the same as on `MenuButton`: `menu`
or `items`, `renderItem`, `open` / `defaultOpen` / `onOpenChange`, `onAction`,
`placement`, `container`, `submenuOpen`, `hoverDelay`, and the item
components, including groups. The menu is uncontrolled by default;
pass `open` with `onOpenChange` to control it. Like `MenuButton`, a closed
split button renders no menu markup, on the server or the client, and
hydrates without warnings.

`tone`, `variant` and `size` apply to both parts, and `disabled`
disables both. The trigger part carries `data-open` while the menu
is open.

## Keyboard and accessibility

- Two tab stops: the primary part, then the trigger.
- On the trigger: Enter, Space and ArrowDown open the menu on the first item,
  ArrowUp on the last. Alt+ArrowDown on the primary part opens the menu too.
- In the menu: the Menu keys (ArrowUp / ArrowDown, Home / End, typeahead,
  Enter, Escape, Alt+ArrowUp, Tab); focus returns to the trigger.
- The group is named by the primary part's content. The primary button keeps
  its own name, and only the trigger has `aria-haspopup="menu"`,
  `aria-expanded` and `aria-controls`. The trigger's name is
  `menuLabel`, `"More options"` by default.

## In a button group

`MenuButton` and `SplitButton` can be children of a `ButtonGroup`.
They take the group's `variant`, `tone`, `size` and `disabled`
unless they set their own, and an attached group joins their borders with
their neighbours. In a vertical group a `SplitButton` stays one horizontal
row that spans the group's width:

```tsx
<ButtonGroup aria-label="Clipboard" orientation="vertical">
  <Button>Copy</Button>
  <SplitButton items={pasteOptions}>Paste</SplitButton>
</ButtonGroup>
```

<!-- demo: button-group-menus -->

An icon-above-text layout is not offered: compose the content
instead.

<!-- demo: split-button -->

## API reference

[`SplitButton`](/docs/reference/buttons/menu/SplitButton) and its
`SplitButtonProps` / `SplitButtonPart` types are exported from
[`@salmonui/buttons/menu`](/docs/reference/buttons/menu); the menu props are
documented on [Menu Button and Menu](/docs/buttons/menu-button).
