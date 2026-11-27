---
title: Select multiple options and keys
description: An array value shown as delimited text, select all from the list and from code, hidden selected options, closing on select, click to open, the multiple-selection keys and ARIA.
category: dropdowns
---

The value is an array; the trigger joins the labels with `valueSeparator`
(" · ") instead of the default `Intl.ListFormat` text. A click opens the
popup. "Select all" in the list reports `reason selectAll`; the buttons set
`value` from code to select or clear every option.
`hideSelected` removes picked options from the list, and `closeOnSelect`
closes the popup after each pick (by default it stays open).

Keys: Arrow Down / Up and Page Up / Down move the active option, Space and
Enter toggle it, Home / End jump, Ctrl+A (Cmd+A) selects all (or clears all when everything is
selected), Alt+Up,
Escape and Tab close. The open listbox has `aria-multiselectable="true"`,
and each option `aria-selected`.
