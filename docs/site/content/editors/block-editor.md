---
title: Block Editor
description: BlockEditor - a block-based editor with a JSON value, slash menu, selection toolbar, drag handles and block menus, mentions and labels, paste cleanup, undo, server rendering and opt-in Yjs collaboration.
category: Components
order: 20
demos: [block-editor, block-editor-api, block-editor-collab]
---

`BlockEditor` from `@salmonui/rich-text` edits a document of blocks:
paragraphs, headings, bulleted, numbered and checklist items, quotes,
callouts, code, images, tables, dividers, toggles, audio and video.
It runs on the same ProseMirror engine and schema as
`RichTextEditor`. The value is plain JSON with a stable `id` on every block:

```tsx
import { BlockEditor, type Block } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';

const [blocks, setBlocks] = useState<Block[]>([
  { id: 'title', type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] },
  { id: 'todo', type: 'checklistItem', props: { checked: false }, content: [{ type: 'text', text: 'Write the spec' }] },
]);

<BlockEditor aria-label="Notes" value={blocks} onChange={setBlocks} />
```

`defaultValue` makes it uncontrolled. The server renders the blocks as
sanitized HTML inside the element the engine mounts on after hydration, so
the first paint is the real content and hydration never differs; ProseMirror
and the editor UI load afterwards with a dynamic `import()`.

<!-- demo: block-editor -->

## Block model

```ts
interface Block {
  id: string;
  type: BlockType;
  props?: Record<string, unknown>;
  content?: InlineContent[];   // the block's own text
  children?: Block[];          // sub-items, toggle body, quote and callout body
}
```

`props` by type: heading `level` and `textAlign`; paragraph `textAlign`;
numberedListItem `start` (begins a new numbered list); checklistItem
`checked`; callout `tone` (`info`, `success`, `warning`, `danger`,
`neutral`); code `language`; toggle `open`; image `src`, `alt`, `caption`,
`width`, `height`; audio `src`; video `src`, `width`, `height`; table
`headerRow` and `rows` (rows of cells of inline content) and `variant`.

Inline content is shared with `RichTextEditor`: text with marks
(`bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`,
`code`, and `color`, `backgroundColor`, `fontFamily`, `fontSize` with a
value), links, mentions, labels and hard breaks.

Consecutive list items of one kind form one list. Ids round-trip through
`data-block-id`; the editor keeps them present and unique (a duplicated or
split block gets a new id).

## Serialization

`blocksToHtml(blocks)` and `htmlToBlocks(html)` are pure and server-safe:
render stored blocks in a mail or a static page, or import HTML.
Both go through the sanitizer; `htmlToBlocks` gives blocks without
`data-block-id` deterministic ids from their position (`b0`, `b2-1`), so the
server and the client agree. The editor itself converts through the same two
functions, so there is one conversion path.

```ts
import { blocksToHtml, htmlToBlocks } from '@salmonui/rich-text';

const html = blocksToHtml(blocks);    // '<h1 data-block-id="title">Plan</h1>...'
const again = htmlToBlocks(html);     // deep-equals blocks
```

Render blocks read-only with `<RichTextContent blocks={blocks} />`.

## Editing blocks from code

The controlled value is the block API: adding, removing, moving and
updating are array edits. Immutable helpers keep untouched subtrees
identical: `findBlock`, `findParentId`, `forEachBlock`, `insertBlocks(blocks,
inserted, { before | after | parent, index })`, `removeBlocks(blocks, ids)`,
`updateBlock(blocks, id, patch)` (props merge) and `moveBlock(blocks, id,
position)`.

For an uncontrolled editor, `actionsRef` offers the same edits plus the
selection and command API:

| Method | Does |
| --- | --- |
| `getBlocks()`, `getBlock(id)` | Read the document |
| `insertBlocks(blocks, position?)`, `removeBlocks(ids)`, `updateBlock(id, patch)` | Edit as one undo step |
| `moveBlock(id, position)` | Move; `false` when `onBeforeBlockMove` cancels |
| `turnInto(id, type)` | Change a block's type, keeping its text |
| `getSelection()`, `setSelection({ blockId, offset })` | The caret as a block and an offset |
| `focus()`, `runCommand(id, ...args)` | Focus; run a toolbar command (`bold`, `heading2`, `insertTable`, `undo`, ...) |
| `getHtml()`, `print()` | Sanitized HTML; print the content |

## Slash menu, selection toolbar and turning into

Typing `/` at the start of a block or after a space opens the slash menu:
the built-in entries `paragraph`, `heading1`..`heading3`,
`bulletList`, `numberedList`, `checklist`, `quote`, `callout`, `code`,
`toggle`, `image`, `table` and `divider`, grouped and filtered by the typed
text. Arrow keys move, Enter or Tab picks, Escape closes. `slashMenu` lists
the entries (custom ones are `{ id, label, keywords, group, onSelect({
block, actions }) }`); `false` turns the menu off.

Selecting text shows the selection toolbar with bold, italic,
underline, strikethrough, inline code, link and `turnInto`; `inlineToolbar`
lists its entries (custom ones as above) or hides it with `false`.
`transforms` restricts the types `turnInto` offers.

## Drag handles and block menus

Hovering a block (or moving the caret into it) shows a drag handle in the
inline-start gutter. Clicking it opens the block action
menu on the shared `Menu`: turn into, duplicate, delete, move up and move
down, image settings for images, row and column commands for tables, and
custom entries from `blockActions`. Dragging it moves the block: a line
shows the drop position, and dropping further to the inline end of a list
item, quote, callout or toggle nests the block inside it. The drag runs
outside React state. `draggable={false}` removes the handles;
`onBeforeBlockMove` (call `preventDefault()` to cancel) and `onBlockMove({
block, from, position, source })` report moves from the pointer, the
keyboard and `actionsRef`.

Right click opens the context menu: cut, copy, duplicate, delete,
move up, move down, turn into, and custom entries from `contextMenu`
(`false` keeps the browser menu; Shift and right click always does).

<!-- demo: block-editor-api -->

## Mentions and labels

`mentions={{ items }}` and `labels={{ items }}` attach the contenteditable
`Mention` to the editor: `@` inserts a mention atom, `#` a label
atom (the item's `tone` colors it). Both triggers can be changed; `items` is
an array or a `@salmonui/data` source.

## Images, code and tables

The image entry of the slash menu opens a file picker. With
`onUpload(file) => Promise<{ src, alt? }>` the block is pending until the
upload settles; without it the image is a blob URL. The caption is editable
text under the image. Hovering the image shows a resize handle (always
shown, and larger, on touch screens); dragging it scales the image with its
aspect ratio and writes `width` and `height` to the block on release, so the
drag itself never re-renders React. The block menu's image settings edit the
alternative text and the width from the keyboard. An image dropped or
pasted into text becomes its own block.

Code blocks take `codeLanguages` (the language picker, a labelled
"Code language" select with "Plain text" first) and the `highlight` hook of
`RichTextEditor`: `(code, language) => { from, to, className }[]`, applied
as decorations, so the classes style the editor but never reach the block
value. Choosing a language sets the block's `props.language`.

```tsx
<BlockEditor
  codeLanguages={[{ value: 'ts', label: 'TypeScript' }, { value: 'css', label: 'CSS' }]}
  highlight={(code) => [...code.matchAll(/\b(const|let)\b/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, className: 'tok-keyword' }))}
/>
```

Table blocks use the table
commands: insert and delete rows and columns, merge and split cells, toggle
the header row, from the block menu or `runCommand`.

## Paste

Paste goes through the shared paste cleanup: `pasteCleanup={{ mode:
'clean' }}` by default, `'keep'`, `'plainText'` or `'prompt'`, plus tag and
attribute filters. Word and Google Docs content arrives as real headings,
lists and marks. `onBeforePaste({ html, text, files })` can cancel a paste
with `preventDefault()`; `onPaste({ html, text, blocks })` follows it. All
content is sanitized: only the schema's nodes and marks survive and
text is always escaped, so there is no encode switch. See
[HTML sanitizer and paste cleanup](/docs/editors/html-sanitizer-and-paste).

## Undo, keys and Markdown

Every edit, including block moves and menu actions, is one undo step:
Ctrl+Z (Cmd+Z), Ctrl+Y or Ctrl+Shift+Z; `undoLimit` sets the depth.
Under collaboration, undo is per user.

Default keys, rebindable with `keyBindings={{ commandId:
'Mod-Shift-x' }}` (`false` removes a default):

| Keys | Command |
| --- | --- |
| Ctrl/Cmd+Shift+Arrow Up / Down | `moveBlockUp` / `moveBlockDown` |
| Ctrl/Cmd+D | `duplicateBlock` |
| Ctrl/Cmd+Shift+Backspace | `deleteBlock` |
| Alt+F10 | Focus the selection toolbar, or open the block menu |
| Shift+F10 | `contextMenu` |
| Ctrl/Cmd+P | `print` |
| Tab / Shift+Tab | Nest / unnest a list item |

The `RichTextEditor` formatting keys work as well. Markdown shortcuts turn a
block as you type: `# ` to `###### ` headings, `- ` or `* ` bullets, `1. `
numbers, `[] ` checklist items, `> ` quotes and three backticks code.

The editing surface is `role="textbox"` with `aria-multiline`, labelled by
`aria-label` or `aria-labelledby`; menus are `role="menu"`, the slash menu a
`listbox`, and the selection toolbar an APG toolbar.

## Read only, print and events

`readOnly` keeps the content selectable but not editable and removes the
handles and menus. `actionsRef.current.print()` prints the content
only, with the page's styles.

Events: `onChange(blocks)`, `onBlockChange({ type: 'add' | 'update'
| 'remove' | 'move', block })`, `onSelectionChange({ blockId, offset } |
null)`, `onFocus` and `onBlur`.

`localeText` replaces any string; the direction is inherited from the page,
so under `dir="rtl"` the handles sit on the right; `className` and `style`
go to the root.

## Collaboration

`@salmonui/rich-text/collab` adds Yjs collaboration to
`BlockEditor` and `RichTextEditor` through `extensions`. The application
owns the `Y.Doc`, the provider (y-websocket, WebRTC, ...) and the server:

```tsx
import { createCollaboration } from '@salmonui/rich-text/collab';

const extensions = useMemo(
  () => [createCollaboration({ doc, awareness: provider.awareness, user: { id: me.id, name: me.name, color: '#2563eb' } })],
  [doc, provider],
);

<BlockEditor aria-label="Notes" extensions={extensions} />
```

Edits sync through the `Y.Doc`; with `awareness`, remote cursors and
selections show each user's name and color; the engine's history is
replaced by the Yjs undo manager, so undo reverts only your own changes. The
`Y.Doc` is the source of truth: seed it once with `await
seedCollaborationDoc(doc, html)` and read it with `await
collaborationDocToHtml(doc)` (server rendering, persistence) instead of
driving the editor with a controlled `value`.

<!-- demo: block-editor-collab -->

## Design notes

- Version history (`getVersionHistory`) is not included: it needs a
  snapshot store, diffing and a restore UI whose storage the application
  owns. Keep
  snapshots of the `onChange` value, or Yjs snapshots under `/collab`, and
  restore one by passing it back as `value`.
- There is no built-in persistence: components never write to
  `localStorage` on their own, because hidden persistence breaks server
  rendering consistency; store what `onChange` reports and pass it back as
  `value`.
- Block edits are array edits on the value plus `actionsRef`. The value is
  JSON already, so it is the saved format; convert to and from HTML with
  `blocksToHtml` / `htmlToBlocks`.

## API reference

[`@salmonui/rich-text`](/docs/reference/rich-text) lists `BlockEditor`,
its `BlockEditorActions`, the block types and the serialization helpers;
[`@salmonui/rich-text/collab`](/docs/reference/rich-text/collab) the
collaboration helpers.
