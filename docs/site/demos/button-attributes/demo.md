---
title: Button attributes, classes and server rendering
description: className and style on a Button, DOM attributes passed through to the native button, a handler that vetoes the built-in toggle with preventDefault, and a status that shows the demo was rendered on the server and then hydrated.
category: buttons
---

**Archive** carries an application class, an inline `style`, a `data-*`
attribute and `aria-describedby`; inspect it to see them on the `<button>`
after `salmon-button`. With **Lock pin** checked, the pin button's own
`onClick` calls `event.preventDefault()`, so the built-in toggle is skipped.
The status line reads "server HTML" in the static markup and switches to
"hydrated" once React attaches, without a hydration warning.
