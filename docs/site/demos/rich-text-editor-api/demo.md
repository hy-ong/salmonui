---
title: Rich text API, forms and events
description: RichTextEditor driven from code and forms - typed commands, selection and history through actionsRef, Enter and Tab configuration, a custom key binding, readOnly and disabled, a disabled toolbar item, required form submit and reset, every before/after event, right to left and localized labels.
category: editors
---

- **Commands and selection**: the buttons call `actionsRef`:
  `commands.bold()`, `commands.insertTable()`, `getSelection()`,
  `setSelection()` + `focus()`, `openDialog('link')` and
  `getHtml({ xhtml: true })` (results in the log).
- **Undo**: type, then use Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, the toolbar or
  the `undo()` / `redo()` buttons; `clearHistory()` empties the stack. The
  history line comes from `onToolbarStateChange`; `undoLimit={50}` and
  `undoGroupDelay={800}` shape the steps.
- **Enter and Tab**: switch `enterKey` to `div` or `br` and press Enter
  (Shift+Enter always inserts a line break here); `tabKey="indent"` makes
  Tab indent instead of leaving the editor. Ctrl+Shift+X (Cmd+Shift+X)
  strikes text through a `keyBindings` entry.
- **States and toolbar items**: switch to `readOnly` or `disabled`, empty
  the editor to see the `placeholder`, and disable the Underline item with
  `{ id: 'underline', disabled: true }`.
- **Form**: the editor has `name="note"` and `required`: Submit posts the
  HTML through `FormData`, an empty editor blocks the submit, and Reset
  restores `defaultValue`.
- **Events**: the log shows `onBeforeCommand`, `onCommand`,
  `onToolbarItemClick`, `onBeforeDialogOpen` (tick "Cancel table dialogs" to
  veto the table dialog) and `onDialogClose`.
- **Keyboard, RTL and labels**: Alt+F10 moves to the toolbar, arrows move
  between items, Escape returns. `dir="rtl"` mirrors the toolbar and
  "French labels" passes `localeText`.
