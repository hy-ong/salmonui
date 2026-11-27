---
title: Message
description: Inline status messages with tones, variants, a built-in icon, actions and an optional close button, rendered on the server and announced only when you ask for a live region.
category: Components
order: 10
demos: [message-basic]
---

```tsx
import { Message } from '@salmonui/notifications/message';
import '@salmonui/notifications/message/styles.css';

<Message tone="warning" title="Storage almost full">
  You have used 95% of your quota.
</Message>;
```

`Message` is page content. Its entry is not a `"use client"` module and the
body calls no hooks, so a React Server Component renders it; the only client
code is the close button, a small `"use client"` island loaded when
`onDismiss` is set.

## Content, tones and variants

- `children` is the content (any React node) and `title` an optional heading
  line above it.
- `tone`: `'neutral'` (default), `'primary'`, `'info'`, `'success'`,
  `'warning'`, `'danger'`.
- `variant`: `'soft'` (default), `'outline'`, `'solid'`.
- `icon`: each tone has a built-in inline SVG icon; pass a node to replace it
  or `false` to hide it. The icon is always decorative
  (`aria-hidden`).
- `action`: nodes after the content, usually a `Button`.
- `align`: `'start'` (default), `'center'`, `'end'` aligns the content,
logically, so `'end'` is the left edge under `dir="rtl"`.

Every choice is a `data-*` styling hook on `.salmon-message` (`data-tone`,
`data-variant`, `data-align`), written only when its prop is set; the
stylesheet applies the defaults when it is absent. Parts:
`.salmon-message-icon`, `.salmon-message-body` (title and content),
`.salmon-message-title`, `.salmon-message-action`, `.salmon-message-dismiss`.
`className`, `style`, `ref` and every other DOM prop go to the message
element.

<!-- demo: message-basic -->

## Dismissing and hiding

`onDismiss` shows a close button at the inline end. It is a native
`<button>`, so Enter and Space activate it, and its accessible name is
`localeText.dismiss` (default `"Dismiss"`). The message does not hide itself:
the application owns the visibility and sets `hidden` or unmounts it.

```tsx
const [open, setOpen] = useState(true);
<Message tone="info" hidden={!open} onDismiss={() => setOpen(false)}>
  Version 2 is ready.
</Message>;
```

`hidden` is the native attribute; conditional rendering works as
well. Persisting the hidden state across reloads is the application's state:
store it where the rest of your UI state lives and pass `hidden`.
There are no lifecycle events or teardown method: use React's lifecycle, an
effect in the parent, or unmounting.

## Live announcements

A message has no live role by default: a message present at load is page
content. A live role on every message would
make a server-rendered page announce all of its messages on load and
interrupt the user.

For a message that appears later, as feedback, set `live`:

- `live="polite"` renders the message inside a `role="status"` region
  (`aria-live="polite"`).
- `live="assertive"` uses `role="alert"`; keep it for urgent errors.

The region (`.salmon-message-live`) is rendered even while the message is
`hidden`, and the message is inserted into it when it shows, so the insertion
is announced. Keep the component mounted and toggle `hidden` rather than
mounting it with the content.

```tsx
<Message live="polite" tone="success" hidden={!saved}>
  Changes saved.
</Message>
```

## Right-to-left and localization

The stylesheet uses logical properties only: in a `dir="rtl"` container the
icon sits on the right and the close button on the left. Strings come from
`localeText` (`dismiss`, the close button label); the component
reads no locale context so that it stays a server component. `className`,
`style`, `ref` and other DOM props reach the message element.

API reference: [`@salmonui/notifications/message`](/docs/reference/notifications/message).
