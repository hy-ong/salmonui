---
title: AutoComplete with remote suggestions
description: A free-text Combobox over a remote source, with the optional popup button, the suggestion keys, aria-busy while loading, a custom option template and announced result counts.
category: dropdowns
---

Type `s`: after 250 ms the source is read (it answers after 700 ms) and the
list carries `aria-busy="true"` and shows the loading state until the
answer arrives; a screen reader then hears the number of results. Arrow
Down / Up open the suggestions when they are hidden, Backspace filters
again, and Escape closes the list and clears the active suggestion. Each
option uses `renderItem`, rendered inside the `role="option"` element so it
keeps its role and selected state. The checkbox toggles `showTrigger`, which shows or hides
the button that opens the full list.
