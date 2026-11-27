---
title: Field states
description: The shared field behavior on TextField, NumberField, Slider and Rating - placeholder, disabled, read-only, sizes, RTL, locale and localeText, adornments, clearing, className and style, ref methods, native focus events and controlled versus uncontrolled values.
category: inputs
---

Toggle `disabled`, `readOnly`, `dir="rtl"`, the size and the locale above
the fields: disabled fields leave the tab order, read-only ones stay
focusable and ignore input, RTL mirrors the layout and the Slider's arrow
keys, and the locale switches the NumberField format and the TextField's
`localeText` (the clear button name and the required message).

The `ref.focus()`, `ref.blur()` and `ref.click()` buttons call the native
input through `ref`; the log shows the native `onFocus`, `onBlur`, `onClick`
and `onChange` events next to `onValueChange(value, details)`. Clear the
name with the clear button or Escape. The accent bar is the root's `style`
(with a `className` next to it); the first field is controlled, the second
uncontrolled (`defaultValue`).
