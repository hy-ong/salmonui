---
title: Speed Dial
description: The speed dial as a recipe, a floating icon-only MenuButton that opens a short list of actions above itself.
category: Recipes
order: 70
demos: [speed-dial]
---

A speed dial is a floating icon-only `MenuButton` that opens a
short list of actions above itself, so it gets the menu's keyboard model,
ARIA and dismissal for free:

```tsx
import { MenuButton, MenuItem } from '@salmonui/buttons/menu';

<MenuButton
  floating
  iconOnly
  aria-label="Actions"
  placement="top-end"
  onAction={(event) => run(event.id)}
  menu={
    <>
      <MenuItem id="copy" icon={<CopyIcon />}>Copy</MenuItem>
      <MenuItem id="share" icon={<ShareIcon />} title="Share the link">Share</MenuItem>
      <MenuItem id="delete" icon={<TrashIcon />} disabled>Delete</MenuItem>
    </>
  }
>
  <PlusIcon aria-hidden />
</MenuButton>
```

| To get | Use |
| --- | --- |
| Actions with text, icon, id, tooltip and disabled state | `MenuItem` children with `icon`, `id`, `title`, `disabled` |
| The opening direction | `placement`; `'top-end'` opens above a bottom-end button. Horizontal item rows are not offered |
| Position, container, visibility, content, emphasis and disabled state | `floating`, `floatingScope`, `hidden`, children, `tone`, `disabled` of the button |
| Different open and close icons | A controlled `open`, swapping the children |
| Reacting to or cancelling open and close | `open` / `onOpenChange` |
| Handling a chosen action | `onAction` |
| Opening and closing from code | A controlled `open` |
| Custom item or popup content | `MenuItem` children; arbitrary popup content is a [Popover](/docs/layout/popover) |
| Customizing each item | JSX children |
| Following layout changes | Nothing to call: CSS positioning follows layout |
| Keyboard and ARIA | The Menu Button keys and roles. Arrows are vertical |

Not available: a radial layout, opening on hover (which keyboard and touch users cannot use), a modal overlay, and the 16 animation effects (one fixed CSS transition,
off under `prefers-reduced-motion`). The result is a vertical list of
actions.

<!-- demo: speed-dial -->
