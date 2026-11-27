---
title: Modern Rich Text Editor
description: Recipe - a modern rich text editing experience with RichTextEditor - a floating selection toolbar, the slash menu, mentions, Markdown shortcuts, block editing and collaboration.
category: Recipes
order: 60
demos: [rich-text-editor-inline]
---

A "modern" rich text editing experience means a floating
toolbar over the selection, a slash menu, mentions, Markdown shortcuts and
block editing. Salmon UI has one rich text editor, `RichTextEditor`, built
on a modern engine (ProseMirror) with server rendering; this recipe
configures it for that experience.

```tsx
import { RichTextEditor } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';

<RichTextEditor
  aria-label="Post"
  toolbar="floating"                   // no fixed toolbar: a toolbar over the selection
  slashMenu                            // '/' opens the block menu
  mentions={{ items: people }}         // '@' mentions through the contenteditable Mention
  placeholder="Write, or type / for blocks"
  value={html}
  onChange={setHtml}
/>
```

<!-- demo: rich-text-editor-inline -->

What the Modern editor brings and where it lives:

| Modern RTE | Salmon UI |
| --- | --- |
| Minimal chrome, inline toolbar on selection | `toolbar="floating"`; or keep a fixed `toolbar` and add the `text` quick toolbar |
| Slash commands | `slashMenu` (built-in ids or custom `{ id, label, onSelect }` entries) |
| Mentions | `mentions` (`@salmonui/dropdowns/mention` on the editor's target) |
| Markdown shortcuts | Built in: `# `, `- `, `1. `, `[] `, `> `, three backticks |
| Block-based editing, drag handles | `BlockEditor` (block JSON value, handles, block menus) |
| Real-time collaboration | `@salmonui/rich-text/collab` with `extensions` |
| Extensible core | The `extensions` API (see [Headless editor](/docs/editors/headless-editor)) |

When the content is a list of blocks rather than one HTML string (notes,
documents, pages), use [`BlockEditor`](/docs/editors/block-editor) instead:
it shares the engine, the paste cleanup, the sanitizer and the extensions.
