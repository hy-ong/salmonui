---
title: Dialog placement, size and dismissal
description: A modal task Dialog with placement, width, full-screen and backdrop-dismissal controls, a close request vetoed while the notes are edited, initial focus, a Select and a Tooltip inside the modal, right-to-left and an event log.
category: layout
---

Open the dialog: the notes field has the focus (`initialFocus`). Type a
note, then press Escape or Cancel: with "Keep open while edited" the
`onOpenChange` request is vetoed with `preventDefault()`. Press the
backdrop: `onOverlayPress` is logged every time, and the dialog closes only
with "Close on a backdrop press". The Priority Select and the help Tooltip
open above the modal dialog and stay usable; Escape closes them first.
`style` adds the top border, `localeText.close` labels the close button,
and "Right to left" mirrors the dialog.
