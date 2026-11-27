---
title: Password-protected PDF
description: An encrypted PDF opened three ways - the built-in password dialog with its wrong-password message, the password prop, and onPasswordRequired with the application's own form.
category: editors
---

The sample is encrypted with the password `salmon`. The demo starts with
the `password` prop, so the page opens unlocked; pick another option to
see the viewer ask for it.

- **Built-in dialog**: the viewer asks for the password; try a wrong one
  first to see "Incorrect password", then `salmon`.
- **password prop**: the document opens straight away.
- **onPasswordRequired**: the viewer shows no dialog and hands the request
  to the page, which renders its own form above the viewer and calls
  `submit(password)` or `cancel()`. A wrong password calls it again with
  `reason: 'incorrect'`; Cancel ends in `onLoadError` with a
  `PasswordException`.
