---
title: Rich Text Editor
description: RichTextEditor from @salmonui/rich-text - an HTML editor on ProseMirror that server-renders its value, with toolbars, quick toolbars, tables, media uploads through callbacks, find and replace, source view, mentions and a streaming AI hook.
category: Components
order: 10
demos: [rich-text-editor, rich-text-editor-inline, rich-text-editor-insert, rich-text-editor-api]
---

`RichTextEditor` edits an HTML value. It lives in
`@salmonui/rich-text`, the one Salmon UI package that may use ProseMirror;
every other package except `@salmonui/pdf-viewer` has no runtime
dependencies.

```tsx
import { RichTextEditor } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';

<RichTextEditor
  aria-label="Body"
  defaultValue="<p>Hello</p>"
  onChange={(html) => save(html)}
  onUpload={async (file) => ({ src: await uploadToServer(file) })}
/>;
```

The stylesheet carries the button, menu and mention rules the toolbar and
the mention list render, so it is the only stylesheet besides
`@salmonui/core/styles.css` (the theme, once per app).

## Server rendering and loading

The server renders the toolbar shell and the sanitized HTML of `value`
inside the content element (`role="textbox"`, `aria-multiline`). After
hydration the editing engine loads with one dynamic `import()` and mounts
on that same element, so the markup matches and there is no hydration
warning. The root entry never loads ProseMirror on the server;
`loadRichTextEngine()` preloads it on the client if you want the first
keystroke to be instant. To show stored HTML read-only, use
[`RichTextContent`](/docs/editors/rich-text-content).

## Value

`value` / `defaultValue` hold an HTML string; `onChange(html)` fires once
per batch of transactions, `changeDelay` (ms) widens the batch, and `onBlur(html)` gives a
change-on-blur timing. A controlled `value` goes into the engine, never through
React re-rendering the content. Every value in and every HTML out passes
the always-on sanitizer (see
[HTML sanitizer and paste cleanup](/docs/editors/html-sanitizer-and-paste)).

Through `actionsRef`:

| Member | Does |
| --- | --- |
| `getHtml({ xhtml? })` | The HTML value; `xhtml: true` self-closes void elements |
| `getText()` | Plain text, blocks joined by new lines |
| `commands.bold()`, `commands.insertTable({ rows, cols })`, ... | Typed commands; each fires `onBeforeCommand` (cancellable) and `onCommand` |
| `run(id, ...args)` | A command or toolbar action by id |
| `getSelection()` / `setSelection(anchor, head)` / `focus()` | Selection API |
| `clearHistory()` | Empties undo and redo |
| `openDialog(id)` / `closeDialog()` | Built-in dialogs |
| `insertFiles(files)` | Inserts images or media through `onUpload` |

There is no `refreshUI`: toolbar state follows the editor state.

## Toolbar

`toolbar` lists built-in item ids, `'|'` separators and custom items
(`{ id, label, icon, onClick, pressed, disabled }`); a built-in id can be
written `{ id: 'bold', disabled: true }`. Defaults are in
`RICH_TEXT_DEFAULT_TOOLBAR`. Items are `Button`, `ToggleButton` and
`MenuButton` from `@salmonui/buttons`, inside an APG toolbar: one tab stop,
arrow keys move between items, Alt+F10 in the editor focuses the toolbar and
Escape returns.

- `toolbarOverflow`: `'menu'` (default) moves
  what does not fit into a "More" menu, `'scroll'` scrolls, `'wrap'` uses
  several rows.
- `toolbarPosition: 'top' | 'bottom'`, `stickyToolbar`.
- `toolbar="floating"` shows the toolbar only over a text selection;
`toolbar={false}` hides it.
- `quickToolbars`: item lists per context (`link`, `image`, `table`, `text`,
  `audio`, `video`; `false` hides one), shown in a popover next to the
  selected link, image, table or media. The defaults are
  `RICH_TEXT_DEFAULT_QUICK_TOOLBARS`. The `text` quick toolbar appears over
  a text selection only when you give it a list (or with
  `toolbar="floating"`). An audio or video node selected with the arrow
  keys shows the `audio` or `video` list.

```tsx
<RichTextEditor
  quickToolbars={{
    text: ['bold', 'italic'],            // a selection toolbar next to the fixed one
    video: ['alignments', 'removeNode'],
    link: false,                         // no link popover
  }}
/>
```

<!-- demo: rich-text-editor-inline -->

## Formatting

Marks: bold, italic, underline, strikethrough, subscript, superscript,
inline code, font family, font size, text color and background color, plus
uppercase and lowercase commands (`fontFamilies`, `fontSizes`,
`colors` set the pickers). Blocks: paragraph and heading formats,
alignment, bulleted, numbered and checklists with list styles, indent and
outdent, line height, blockquote, horizontal rule and clear format.
The format painter copies marks and the block format: a click applies once,
a double click keeps applying, Escape ends. Markdown-style input
rules (`# `, `- `, `1. `, `> `, `[] `, ```` `) work as you type.

## Links, images, media, tables and code

- Links: insert and edit dialog (text, URL, open in a new window, which adds
  `rel="noopener noreferrer"`), and a quick toolbar to open, edit or remove.
Unsafe URLs are refused.
- Images: dialog (URL, alt, size, caption), resize handles, and
  `onUpload(file) => Promise<{ src, alt? }>`. A pasted or dropped image shows
  a pending placeholder until the promise settles; a rejection removes it
  and calls `onUploadError`. Without `onUpload`, `imageInsert` is `'blob'`
  (default) or `'base64'`.
- Audio and video from a URL or `onUpload`, rendered with native controls;
  embeds (`<iframe>`) only from hosts in `embedHosts`.
- Tables: insert dialog, row and column insert and delete, header row, merge
  and split cells, column resize by dragging, table styles.
- Code blocks with a `codeLanguages` picker; `highlight(code, language)`
  decorates them, no highlighter is bundled.
- `onBrowseFiles(kind)` opens your own file browser from the image and media
  dialogs.

## Paste, import and export

`pasteCleanup` normalizes Word and Google Docs HTML to the editor
vocabulary, keeps it, pastes plain text, or prompts. There is no
built-in Word or PDF service: `onImport(file) => Promise<string>`
receives the file from the import item and returns HTML that is sanitized
and inserted, and `getHtml()` gives the HTML to export. A server converts
Word files (for example with mammoth, LibreOffice or a document server) and
renders PDF from that HTML; built-in DOCX interop is not included.

<!-- demo: rich-text-editor-insert -->

## Find and replace, source view, count, fullscreen, print

- Find and replace: highlighted matches, next and previous, replace and
  replace all, from the `'findReplace'` toolbar item.
- `'sourceCode'` switches to an HTML textarea; switching back sanitizes it.
- `showCount` shows the character count in the status bar; `maxLength` is
  enforced by a transaction filter, so typing and pasting past it is
  refused while deletions still apply; the count is announced politely at
  thresholds only.
- `resizable`, controlled `fullscreen` / `onFullscreenChange`, and
  `'print'`, which prints the content only.

## Slash menu, emoji and mentions

- `/` at the start of a word opens the block menu (`slashMenu`: `true`, or
  your own items with `onSelect`).
- The `'emoji'` item and `:` open the emoji picker (search, arrows, Enter);
  the built-in list is a lazy chunk, `emojiList` replaces it.
- `mentions={{ trigger: '@', items | onSearch, renderItem }}` attaches
  [`Mention`](/docs/dropdowns/mention) to the editor and inserts mention
  nodes.

## AI assistant

`aiAssistant={{ onRequest({ prompt, selectionHtml, signal }) }}` may return
a string or an `AsyncIterable<string>`. The answer streams into a pending
insert that the user accepts or discards. Model output is inserted as
escaped text, never rendered as HTML. There is no built-in model or
provider. WebMCP tool registration is not built in:
register `actionsRef` commands yourself.

## Keyboard, Enter and Tab

The default shortcuts are the common editor ones (Mod+B, Mod+I, Mod+U, Mod+Z,
Mod+Shift+Z, Mod+Y, Mod+K for a link, Mod+Shift+F for fullscreen, Mod+Shift+H for the source view, ...); `keyBindings` maps a key to a
command id, an action id, a function, or `false` to remove a default.
`enterKey` (`'p'`, `'div'`, `'br'`) and `shiftEnterKey` choose
what Enter and Shift+Enter insert; `tabKey: 'focus'` (default) leaves Tab to
the page, `'indent'` indents.

## Undo

Transaction history with `undoLimit` and `undoGroupDelay` (ms between
typing groups); toolbar items `'undo'`, `'redo'`.

## Forms, states and events

`name` renders a hidden input with the HTML value, form reset restores
`defaultValue`, `required` blocks an empty submit, and `invalid` sets
`aria-invalid`. `placeholder`, `readOnly` and `disabled`.

Inside a [`Field`](/docs/inputs/field) the editor uses the Field error
display of the Inputs components: the field label names the editor
(`aria-labelledby`), the description and the visible error are in
`aria-describedby`, `aria-errormessage` points at the error, and the
Field's rules run on blur and when a submit reaches the empty `required`
editor. Pass the HTML to the Field as `value` (an empty editor reports
`''`):

```tsx
import { Field } from '@salmonui/inputs/form';
import '@salmonui/inputs/form/styles.css';

<Field label="Article body" description="Shown on the front page" name="body" validation={{ required: true }} value={html}>
  {() => <RichTextEditor name="body" required defaultValue="" onChange={setHtml} />}
</Field>
```

Events come in before/after pairs: `onBeforeCommand` / `onCommand`,
`onToolbarItemClick`, `onBeforeDialogOpen` / `onDialogClose`,
`onBeforePopupOpen`, `onToolbarStateChange`.

<!-- demo: rich-text-editor-api -->

## Localization, RTL and styling

`localeText` (defaults in `RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT`), inherited
`dir` (the toolbar mirrors, the content follows), `className` and `style`
on the root; set the size with CSS `width` and `height`. Colors
come from the theme seeds. There is no built-in persistence (see
[Design notes](#design-notes)).

## Extensions

`extensions` adds nodes, marks, commands, key bindings, input rules,
toolbar items and ProseMirror plugins (an async plugin factory is awaited
before the editor mounts); collaboration from `@salmonui/rich-text/collab`
is one. See [Headless editor](/docs/editors/headless-editor).

## Modern Rich Text Editor

A floating toolbar, slash menu, mentions, Markdown shortcuts and block
editing are configuration of `RichTextEditor`, see
[Modern Rich Text Editor](/docs/editors/modern-rich-text-editor).

## Design notes

- No iframe mode: the content is a `contenteditable` element whose
  CSS is scoped under `.salmon-rich-text`, so the editor server-renders its
  value and shares the page theme. Scope custom content CSS under the
  editor's `className`.
- No built-in Word or PDF service: conversion needs a server, and
  the editor should not call a vendor endpoint. Use `onImport` for Word
  import and send `getHtml()` to your own converter for
  Word or PDF export.
- No built-in file browser: `onBrowseFiles(kind)` opens your own
  browser (see the
  [File Manager](/docs/navigation/file-manager)).
- No built-in model: `aiAssistant.onRequest` calls your provider
  and handles each prompt request.
- No WebMCP tools: tool registration would tie the editor to one
  agent protocol that is still moving. Register `actionsRef.current.commands`
  as tools in application code, with your own confirmation step before a
  tool runs.
- No built-in persistence: components never write to `localStorage`
  on their own, because hidden persistence breaks server rendering
  consistency. Store what `onChange` reports and pass it back as `value` or
  `defaultValue`.
- `refreshUI` is not needed: toolbar state follows the editor state.

## API reference

[`@salmonui/rich-text`](/docs/reference/rich-text) lists every prop,
command, callback and type of `RichTextEditor`, `RichTextContent`,
`BlockEditor` and the engine; [`@salmonui/rich-text/collab`](/docs/reference/rich-text/collab)
the collaboration helpers.
