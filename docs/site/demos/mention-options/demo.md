---
title: Mention options
description: Trigger detection after whitespace only, multi-word search, a minimum search length, a custom inserted text that keeps native undo, the field ARIA while the list is open and IME-safe detection.
category: dropdowns
---

- The e-mail address in the note opens nothing: with `requireLeadingSpace`
  a trigger only counts at the start or after whitespace. Uncheck it and
  type `@` right after a letter to compare.
- With `multiWord`, `@mary ann` keeps searching across the space; uncheck it
  and the space ends the search.
- `minSearchLength` holds the list until that many characters follow `@`.
- Picking a person inserts the handle (`getInsertText`) instead of the name.
  The textarea stays controlled (its `onChange` sees the insertion), and
  Ctrl+Z (Cmd+Z) undoes it like typed text.
- While the list is open, inspect the textarea: it keeps its own role and
  gains `aria-autocomplete="list"`, `aria-controls` and
  `aria-activedescendant`, with no `aria-expanded`.
- With an input method (IME), nothing is detected until the composition
  ends, so a full-width `＠` that commits as `@` opens the list.
