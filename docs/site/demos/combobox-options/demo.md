---
title: Combobox input, keys and custom values
description: A controlled input text with onInputChange, custom values validated by onCreateItem, the optional dropdown button, the editable-combobox keys and IME-safe filtering.
category: dropdowns
---

The airport field controls its text (`inputValue` / `onInputChange`) and
its value separately; the button sets the text from outside. Type a
three-letter code that is not listed, such as `mad`, and press Enter:
`onCreateItem` builds the item. Type `Madrid` and press Enter: it returns
`null`, so the text is rejected and reverts when focus leaves.

Keys: Arrow Down / Up open the list and move the active option, Alt+Down
opens and Alt+Up closes it, Enter commits, Escape closes and a second Escape
clears the text, Home / End move the caret, Tab commits and moves on. The
dropdown button (uncheck "Show the dropdown button" to hide it) is not a tab
stop.

In the city field, type with an IME (for example romaji `toukyou` in a
Japanese input method): nothing is filtered or committed while the
composition is open, and the search runs when it ends.
