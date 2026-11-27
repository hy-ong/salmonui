---
title: Rich Text Content
description: RichTextContent - renders stored rich text HTML or BlockEditor blocks read-only, sanitized, with identical markup on the server and the client and no editor engine.
category: Components
order: 30
demos: [rich-text-content]
---

`RichTextContent` from `@salmonui/rich-text` shows stored rich text
read-only: a comment, an article body, the preview of an inline editor.
It sanitizes the value with the same allow-list the editors use
and renders the result with `dangerouslySetInnerHTML` inside one `<div
class="salmon-rich-text-content">`. The sanitizer is a pure function with
no DOM, so the server and the client produce the same string and hydration
never differs. No ProseMirror code is loaded.

```tsx
import { RichTextContent } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';

<RichTextContent value={post.html} className="post-body" />
```

<!-- demo: rich-text-content -->

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `string` | Stored HTML, for example a `RichTextEditor` value |
| `blocks` | `Block[]` | `BlockEditor` blocks, rendered through `blocksToHtml` when `value` is not given |
| `embedHosts` | `string[]` | Hosts whose `<iframe>` embeds are kept (`www.youtube-nocookie.com`, or `*.example.com`); none by default |
| `sanitize` | `SanitizeHook` | Further restriction (see [the sanitizer](/docs/editors/html-sanitizer-and-paste)); keep it stable |
| `className`, `style`, `id`, `aria-*`, ... | | Passed to the root `<div>`; `ref` receives it |

Everything that is not part of the editors' vocabulary is gone from the
output: scripts and event handlers, `javascript:` links, styles other than
alignment, line height, list styles, fonts, sizes and colors, and any element
the editors cannot produce (unknown elements keep their text).

## Same markup on the server

The editors render their value the same way before their engine loads, so a
page can show `RichTextContent` for readers and the editor for writers
without a layout jump. To show an editor's content on the server only (a
feed, an email preview), `sanitizeHtml(value)` returns the same string
without React.

Styling comes from `@salmonui/rich-text/styles.css`: headings, lists,
checklists, quotes, callouts, code, tables, figures, mentions and labels use
the theme's colors, so light and dark follow the page.

## API reference

[`@salmonui/rich-text`](/docs/reference/rich-text) lists the props of
`RichTextContent` and the `sanitizeHtml` options.
