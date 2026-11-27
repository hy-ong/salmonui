---
title: Combobox multiple tags
description: Typing MultiSelect with custom tags validated by onCreateItem, chip templates and per-chip styles, remove buttons, chip keyboard navigation, the optional dropdown button and changes vetoed by a controlled value.
category: dropdowns
---

Type a new word such as `triage` and press Enter: `onCreateItem` builds the
tag (`reason create`); `two words` is rejected. Each chip shows `#` and its
label through `renderChip`, the locked "security" chip is styled by
`getChipProps`, and every chip keeps its remove button. The controlled
`value` vetoes two changes by not applying them: removing "security" and
adding a sixth label.

Chip keys: Backspace on the empty input removes the last chip; Left Arrow
at the start of the input moves to the last chip's remove button, Left /
Right move between chips, Delete or Backspace removes the focused one, and
Right from the last chip or Escape returns to the input. The checkbox
toggles `showTrigger`, the button that opens the list.
