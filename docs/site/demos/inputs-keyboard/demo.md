---
title: Keyboard and screen readers
description: Every Inputs control in one tab order with the role, name, value and description the focused element exposes to assistive technology - textbox, masked textbox, spin button, radio group, checkboxes, switch, two-thumb slider, rating and one-time code.
category: inputs
---

Use only the keyboard. The line below the fields shows what the focused
element exposes to a screen reader (role, accessible name, value text,
checked state and description) and updates as you press keys.

| Control | Keys |
| --- | --- |
| Full name (textbox) | Type; the label and description are announced |
| Postcode (masked textbox) | Type digits; the caret skips the dash; the expected format is the description |
| Tip (spin button) | ArrowUp / ArrowDown step by 1, PageUp / PageDown by 10, Home / End jump to the limits; the value text is the formatted currency |
| Payment (radio group) | One Tab stop; arrow keys move and select |
| Extras (checkboxes in a fieldset) | Tab between boxes; Space toggles |
| Leave at the door (switch) | Space toggles; announced as a switch, on or off |
| Spice level (two thumbs) | Tab to each thumb; arrows by `step`, PageUp / PageDown, Home / End; arrows mirror in RTL |
| Rate the last order (rating) | One Tab stop; arrows change the value |
| Courier code (one-time code) | One textbox with `maxLength` 4; ArrowLeft / ArrowRight move the visual caret |

Every Inputs component is also checked with axe-core in light, dark and RTL
with errors shown (`npm run test:a11y`).
