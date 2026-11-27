---
title: Markdown editor
description: A Markdown source editor on a native textarea - a formatting toolbar of pure text commands that keep native undo, shortcuts, link / image / table dialogs, an app-supplied preview, uploads, a count and fullscreen.
category: Components
order: 20
demos: [markdown-editor, markdown-editor-commands, markdown-editor-form]
---

`MarkdownEditor` from `@salmonui/editors/markdown-editor` edits Markdown source
in a native `<textarea>` with a formatting toolbar. It is its own component,
not an `editorMode` of a rich text editor: `value` is always
Markdown, and the component does not wait on a rich text engine.

```tsx
import { MarkdownEditor } from '@salmonui/editors/markdown-editor';
import '@salmonui/editors/markdown-editor/styles.css';

<label htmlFor="body">Body</label>
<MarkdownEditor
  id="body"
  name="body"
  value={markdown}
  onValueChange={setMarkdown}
  defaultPreview="split"
  renderPreview={(source) => <MyMarkdown source={source} />}
  onUpload={async (file, { signal }) => ({ src: await uploadImage(file, signal) })}
  maxLength={20000}
  showCount
/>
```

The stylesheet carries the `Button` and `Menu` rules the toolbar and its
menus render, so it is the only stylesheet besides
`@salmonui/core/styles.css` (the theme, once per app).

<!-- demo: markdown-editor -->

## Value and the textarea

`value` / `defaultValue` / `onValueChange(value, { source, reason })` follow
the shared triad; `reason` is `'input'` (typing), `'command'` (a
toolbar command) or `'reset'` (the owning form was reset). For a
change on blur, use `onBlur` on the component.

The editing surface is a native `<textarea>`, so IME, spell check,
mobile keyboards, clipboard, `Ctrl+A` and constraint validation are
the browser's. Every textarea attribute passes through: `name`, `required`,
`form`, `placeholder`, `readOnly`, `disabled`, `rows`, `id`,
`aria-*`, `onFocus`, `onBlur`. Without `aria-label`, `aria-labelledby` or
`id` (for a `<label htmlFor>`), the textarea is labelled
`localeText.editor`. `maxLength` limits the text; `showCount` shows
`n / max` and announces "Approaching the character limit" at 90 % and
"Character limit reached" at the limit in a polite status, never per
keystroke. `resizable` (default true) gives the textarea a
vertical resize handle; size the component with `className` / `style`.

## Toolbar

`toolbar` lists built-in item ids, `'|'` separators and custom items
`{ id, label, icon?, disabled?, onSelect(api) }`. The default is
`MARKDOWN_DEFAULT_TOOLBAR`:

```ts
['bold', 'italic', 'strikethrough', '|', 'heading', 'blockquote', 'code',
 'orderedList', 'unorderedList', '|', 'link', 'image', 'table', '|',
 'undo', 'redo', 'preview', 'fullscreen']
```

| Item | Inserts | Shortcut |
| --- | --- | --- |
| `bold`, `italic`, `strikethrough` | `**`, `*`, `~~` around the selection; again removes them | Mod+B, Mod+I, Mod+Shift+S |
| `superscript`, `subscript` | `<sup>` / `<sub>` | Mod+Shift+=, Mod+= |
| `uppercase`, `lowercase` | the selection in the `locale` case | Mod+Shift+U, Mod+Shift+L |
| `heading` | a menu: Paragraph, Heading 1 to 6 (`#` markers) | |
| `blockquote` | `> ` on each line | |
| `code`, `codeBlock` | backticks, a fenced block | |
| `orderedList`, `unorderedList` | `1. ` / `- ` on each line; switches between them | Mod+Shift+O, Mod+Alt+O |
| `link`, `image`, `table` | a dialog | Mod+K, Mod+Shift+I, Mod+Shift+E |
| `undo`, `redo` | undo / redo | Mod+Z, Mod+Y |
| `preview` | toggles the preview | |
| `fullscreen` | toggles fullscreen | Mod+Shift+F |

Mod is Ctrl, or Cmd on Apple platforms. Shortcuts work whether or not their
item is in the toolbar. Enter on a list item continues the marker (the next
number, an unchecked task box); Enter on an empty item ends the list.

`toolbarOverflow` decides what happens to items that do not fit:
`'menu'` (default) moves them into a More menu, `'wrap'` wraps the toolbar,
`'scroll'` scrolls it. `stickyToolbar` keeps the toolbar visible while the
page scrolls.

## Commands

Every command is a pure function over the text and the selection
(`applyMarkdownCommand(id, { text, start, end }, syntax?, locale?)` is
exported for server-side or test use). The editor applies the result as one
replacement with `document.execCommand('insertText')`, so a command is on
the browser's native undo stack together with typing; where an engine does
not support it, the component keeps its own bounded history (`undoLimit`,
default 100) for its commands and still leaves typing to the browser.
The textarea keeps its selection while the toolbar is pressed.

`undoLimit` bounds only that fallback history. Browsers expose no control
over how typing is grouped into undo steps or how deep the native stack is,
so both follow the browser; there is no undo grouping timer.

`syntax` overrides the markers per command, merged over the CommonMark /
GFM defaults (`DEFAULT_MARKDOWN_SYNTAX`):

```tsx
<MarkdownEditor syntax={{ bold: ['__', '__'], unorderedList: '* ', orderedList: ')' }} />
```

`ref` receives a `MarkdownEditorApi`: `runCommand(id)`
(built-in or custom), `insertText(text)`, `wrapSelection(before, after)`,
`focus()`, `blur()`, `getSelection()` (`{ start, end, text }`),
`setSelection(start, end)` and `element` (the textarea).
`onBeforeCommand({ id, source })` runs first and cancels with
`preventDefault()`; `onCommand({ id, source })` runs after.

<!-- demo: markdown-editor-commands -->

## Dialogs and uploads

Link (text and URL), image (URL, alternative text, and a file field when
`onUpload` is set) and table (rows and columns, a GFM table on lines of its
own) open in modal native `<dialog>`s rendered outside the editor, so their
forms never nest in yours. The selected text fills
the link text or image alt; Escape cancels and focus returns to the
textarea. `onUpload(file, { signal })` resolves to `{ src, alt? }`; it also
receives image files pasted into the textarea, inserted where the paste
happened. Dialogs and menus are lazy chunks loaded on first use.

## Preview

`renderPreview(markdown)` returns the preview; no Markdown parser is bundled.
It receives `useDeferredValue(value)`, so typing never
waits on the parser. `preview` / `defaultPreview` / `onPreviewChange`
choose `'off'` (default), `'tab'` (the preview replaces the textarea; text
commands are disabled) or `'split'` (side by side, stacked below a 40 rem
container width). The `preview` item toggles between `'off'` and the last
shown layout. With a parser that emits HTML, sanitize in `renderPreview`:

```tsx
import { marked } from 'marked';
import DOMPurify from 'dompurify';

<MarkdownEditor renderPreview={(md) => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(md) as string) }} />} />
```

A React-element renderer such as `react-markdown` avoids HTML strings
entirely.

## Fullscreen

`fullscreen` / `defaultFullscreen` / `onFullscreenChange` control the
fullscreen state (the editor covers the viewport); the item, Mod+Shift+F and
Escape in the textarea toggle it.

## Keyboard and accessibility

| Key | Action |
| --- | --- |
| Alt+F10 (Option+F10) in the textarea | Focus the toolbar |
| ArrowLeft / ArrowRight, Home / End in the toolbar | Move between items (mirrored in RTL) |
| Escape in the toolbar | Back to the textarea |
| Escape in a menu or dialog | Close it |
| Tab | Leaves the textarea; with `tabIndents` (*Salmon*), Tab / Shift+Tab indent and outdent |

The toolbar is an APG Toolbar (`role="toolbar"`, one tab stop, roving
focus, `aria-controls` pointing at the textarea). The heading and
More buttons are APG Menu Buttons; the dialogs are labelled modal dialogs;
the preview is a region labelled "Preview" with `aria-live="off"`. Axe and
ARIA snapshots run in light, dark and RTL.

## Styling, RTL and localization

`className` / `style` go to the root; `classNames` / `styles` reach the
`toolbar`, `textarea`, `preview` and `count` parts. Direction is
inherited: the toolbar mirrors, and the textarea and preview use
`dir="auto"` so mixed-direction content follows its first strong character.
`localeText` overrides every toolbar label, tooltip and dialog string, and
`locale` picks the case mapping of uppercase / lowercase (`MARKDOWN_DEFAULT_LOCALE_TEXT` holds the English defaults).

The toolbar, textarea and (for `'split'`) the preview render on the server
with the value; menus, dialogs and the overflow measurement exist only on
the client, with no hydration difference.

<!-- demo: markdown-editor-form -->

## Design notes

- `MarkdownEditor` is its own component, not a mode of `RichTextEditor`,
so a Markdown field never loads a rich text engine.
- Typing stays on the browser's native undo stack, which keeps IME
  composition, spell check replacements and platform undo gestures; see
  [Commands](#commands) for `undoLimit`.
- There is no built-in persistence: components never write to `localStorage`
  on their own, because hidden persistence breaks server rendering
  consistency. Persist the value from `onValueChange` (debounced by the
  application) and pass it back as `value` or `defaultValue`.
- There is no HTML sanitizer option: the editor edits plain text and renders
  no HTML itself, and bundling a parser and sanitizer would put them on
  every page with a Markdown field; sanitize in `renderPreview` if your
  parser emits HTML, as in the recipe above.
- `onValueChange` fires on every edit, not on blur; use `onBlur`
  for the blur timing.

## API reference

[`@salmonui/editors/markdown-editor`](/docs/reference/editors/markdown-editor)
lists every prop, the `MarkdownEditorApi` ref and the exported command
helpers.
