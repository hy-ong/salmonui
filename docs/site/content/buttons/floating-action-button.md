---
title: Floating Action Button
description: The floating action button as a floating Button - circular, elevated and positioned by CSS in the viewport or the nearest positioned parent, in nine logical positions.
category: Recipes
order: 60
demos: [floating-action-button]
---

`<Button floating>` is the floating action button: circular,
elevated, `position: fixed`, with no JavaScript positioning. Its shape is
fixed by the system.

```tsx
<Button floating iconOnly aria-label="Compose" iconStart={<PencilIcon />} />
```

- `floating` is `true` (`'bottomEnd'`) or one of `'topStart'`, `'topCenter'`,
  `'topEnd'`, `'middleStart'`, `'middleCenter'`, `'middleEnd'`,
  `'bottomStart'`, `'bottomCenter'`, `'bottomEnd'`. The positions are
  logical: `End` is the right edge in LTR and the left edge in RTL.
- `floatingScope="parent"` uses `position: absolute` inside the nearest
  positioned ancestor; the default is `'viewport'`.
- A floating button defaults to `tone="primary"`; `tone` and `variant` apply as on any button.
- Hide it with the native `hidden` attribute or conditional rendering;
move it with `className` or `style` logical insets such as
  `insetBlockEnd`.
- Icon-only FABs need a name like any icon-only button; an icon plus text
  uses `children` with `iconStart`. Enter / Space activate
  and Tab moves focus natively. `repeat`, toggling and the other
  Button members apply unchanged.

<!-- demo: floating-action-button -->

## Positioning

No method is needed to refresh the position: CSS positioning follows layout
changes on its own.
