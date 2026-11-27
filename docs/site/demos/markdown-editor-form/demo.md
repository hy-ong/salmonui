---
title: Markdown editor in a form
description: MarkdownEditor as a native form field - name, required, submit and reset - with placeholder, readOnly and disabled, a resizable textarea, a server-rendered split preview, right to left, the Turkish locale for case changes, localized labels and part styles.
category: editors
---

The editor is a native `<textarea name="summary" required>` inside a
`<form>`: Submit reads it with `FormData`, an empty value is stopped by the
browser's constraint validation, and Reset restores the default text. Empty
it to see the `placeholder`; switch to `readOnly` or `disabled` with the
radio buttons. Drag the corner to resize the textarea (`resizable`); `style`
caps the width and `styles` set the monospace textarea and italic preview.

Tick `dir="rtl"` to mirror the toolbar (the text keeps `dir="auto"`), and
"Turkish locale" to pass `locale="tr"` and Turkish `localeText`: select
"izmir" and press Upper case to get "İZMİR". The split preview (rendered by
a tiny application function) is part of the server HTML of this page.
