---
title: Popover
description: A non-modal, interactive overlay anchored to a trigger, with focus moving in and back, Escape, outside-press and focus-leaving dismissal, logical placements, an arrow and a collision boundary.
category: Overlays
order: 30
demos: [popover]
---

`Popover` is the interactive counterpart of [Tooltip](/docs/layout/tooltip):
a panel with controls (a filter form, a color picker, a "more" panel) that
opens from a trigger and stays open until the user closes it. It lives in
`@salmonui/overlays/popover` with its own stylesheet.

```tsx
import { Popover } from '@salmonui/overlays/popover';
import { Button } from '@salmonui/buttons/button';
import '@salmonui/overlays/popover/styles.css';
import '@salmonui/buttons/button/styles.css';

export function Filters() {
  return (
    <Popover placement="bottomStart" arrow>
      <Popover.Trigger render={(props) => <Button {...props} />}>Filters</Popover.Trigger>
      <Popover.Content>
        <Popover.Title>Filters</Popover.Title>
        <Popover.Description>Narrow the order list.</Popover.Description>
        <label>
          Customer <input name="customer" />
        </label>
        <Popover.Close render={(props) => <Button {...props} />}>Done</Popover.Close>
      </Popover.Content>
    </Popover>
  );
}
```

<!-- demo: popover -->

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Popover` | none | Holds the open state and the ids. |
| `Popover.Trigger` | `<button type="button">` | `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` while open. `render` swaps the element (a `Button`, a link). |
| `Popover.Content` | `<div role="dialog">` | Mounted only while open, in the top layer. Its `id` is reserved for `aria-controls`. |
| `Popover.Title` | `<h2>` | Labels the content when no `aria-label` is given. |
| `Popover.Description` | `<p>` | Describes the content. |
| `Popover.Close` | `<button type="button">` | Closes with `reason: 'close'`; `render` swaps the element. |

Every part is also exported flat (`PopoverTrigger`, `PopoverContent`, ...).

## Open state

`open` / `defaultOpen` / `onOpenChange(open, event)` is the usual triad.
`event` is frozen: `{ reason, source }` with `reason` one of `'trigger'`,
`'close'`, `'escape'`, `'outside'`, `'focus-outside'` and `source`
`'pointer' | 'keyboard' | 'touch'`. A controlled popover vetoes a change
by not updating `open`.

The server renders only the trigger, closed. `defaultOpen` opens the
popover right after hydration (it is the initial state, so it fires no
callback).

A tooltip never holds interactive content, so an overlay that opens on
click or must stay open and accept clicks is a `Popover`
with a `Popover.Close`.

## Focus and dismissal

The popover follows the APG guidance for non-modal dialogs: no
`aria-modal`, no focus containment.

- On open, focus moves to the first tabbable control (`initialFocus`:
  `'first'`, `'container'` for the content itself, or `false`).
- On close, focus returns to the trigger (`returnFocus={false}` keeps it
  where it is).
- Escape closes the innermost open layer only, so nested popovers and menus
  close one at a time.
- A press outside the content and the trigger closes it
  (`closeOnOutsidePress`); so does focus moving outside, for example with
  Shift+Tab (`closeOnFocusOutside`). A press inside a nested popover counts
  as inside.

## Placement

`placement` takes the twelve logical placements shared with Tooltip:
`top`, `topStart`, `topEnd`, `bottom` (default), `bottomStart`,
`bottomEnd`, `start`, `startTop`, `startBottom`, `end`, `endTop`,
`endBottom`. `start` and `end` follow the inherited `dir`, so `end` is on
the right in LTR and on the left in RTL.

- `offset`: the gap to the anchor (default 8 px), or
  `{ mainAxis, crossAxis }` to also shift along the edge.
- The box flips to the opposite side when the preferred side is too small,
  and shifts to stay inside the viewport, or inside `collisionBoundary` (a
  scrolling container).
- `arrow` draws an arrow that keeps pointing at the anchor's center after a
  shift.
- `anchor` positions the content next to another element (the field a
  picker belongs to) while the trigger keeps toggling it.

Placement is measured once per open (one read, then one write of a CSS
`transform`) and again on scroll and resize, coalesced to one update per
frame; it never re-renders React.

## Styling

`className` and `style` on each part are appended to the system classes
`.salmon-popover`, `.salmon-popover-title`, `.salmon-popover-description`,
`.salmon-popover-close`, `.salmon-popover-arrow` and
`.salmon-popover-trigger`. The content carries `data-side` (the resolved
physical side) and `data-placement`. Without the Popover API the content is
portaled into `container` (default `document.body`).

## Bundle

`@salmonui/overlays/popover` is 4.5 KB gzip including the positioning,
top-layer, dismiss and focus primitives; its stylesheet is 0.72 KB.

API reference: [`@salmonui/overlays/popover`](/docs/reference/overlays/popover).
