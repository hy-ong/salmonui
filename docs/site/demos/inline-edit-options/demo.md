---
title: Inline edit options
description: InlineEdit options side by side - a placeholder for an empty value, a disabled state, a select editor with a label lookup in the preview, saveOnEnter off with custom actions, popover placement, right to left with localized action labels, and part styling.
category: editors
---

- **Subtitle** is empty, so the preview shows its `placeholder`; its popover
  opens to the right (`popoverProps={{ placement: 'right-start', offset: 12 }}`).
- **Status** edits with a `Select` passed as `children` (any
  custom editor works), stores the value `doing` and shows the label
  "In progress" through `renderPreview`. `showActions={false}` hides the Save
  and Cancel buttons: pick an option, then Tab or click away to save.
- **Summary** sets `saveOnEnter={false}`, so Enter does nothing and only the
  custom `renderActions` buttons (Apply, Discard) or Escape end the edit.
- **Heading** shows `localeText.empty`; tick "Right to left" to flip the
  inherited `dir`, which moves the actions to the inline end and switches
  the labels to the Arabic `localeText`. `style` and `styles.preview` give it
  the bold, dashed look.
- "Disable the fields" sets `disabled`: the previews stay focusable but
  `aria-disabled` and do not start editing.

Every preview is in the server HTML of this page; no editor mounts until
you start editing.
