---
title: Headless Editor
description: The ProseMirror engine behind RichTextEditor and BlockEditor - loaded on demand, usable without React, with typed commands, HTML in and out, and the extensions API for nodes, marks, plugins, keys, input rules, commands and toolbar items.
category: Guides
order: 50
demos: [rich-text-extensions]
---

`RichTextEditor` and `BlockEditor` share one engine module: the
ProseMirror schema of the shared HTML vocabulary, typed commands,
transactions, history, key bindings, input rules, the sanitizer and the
serializers. The engine ships in
`@salmonui/rich-text` and loads on demand, so it never reaches the server
bundle or the first paint.

<!-- demo: rich-text-extensions -->

## Using the engine directly

```ts
import { loadRichTextEngine } from '@salmonui/rich-text';

const { createEngine } = await loadRichTextEngine();
const engine = await createEngine({ html: '<p>Hello</p>' });

engine.commands.selectAll();
engine.commands.bold();
engine.getHtml();           // '<p><strong>Hello</strong></p>'
engine.getText();           // 'Hello'
engine.setHtml('<h2>New</h2>');

const view = engine.mount(element);   // an EditorView on an existing element
const off = engine.subscribe((tr) => render(engine.state));
// ...
off();
engine.destroy();
```

The engine runs headless (in Node or a worker, commands apply to the state
directly) and mounts on an existing element, typically the server-rendered
content element. `createEngineSync` skips async extension plugins.

| Member | Does |
| --- | --- |
| `state`, `view`, `schema` | The ProseMirror state, the view once mounted, the schema |
| `commands` | Typed commands (`bold()`, `heading(2)`, `setLink({ href })`, `insertTable({ rows, cols })`, `undo()`, ...); each returns whether it applied |
| `run(id, ...args)` | A command, an alias (`heading2`, `alignCenter`), an extension command or a UI action by id |
| `getHtml({ xhtml? })`, `getText()`, `setHtml(html)` | HTML in and out, always sanitized |
| `getSelection()`, `setSelection(anchor, head?)` | Selection in document positions |
| `subscribe(listener)` | Called after every transaction |
| `insertFiles(files)` | Images, audio and video through the upload handler |
| `mount(element)`, `focus()`, `destroy()` | View lifecycle |

`RichTextEditor` exposes its engine as `actionsRef.current.engine`.

## Extensions

Both editors take `extensions`: plain objects that add to the
schema and the editing behavior. Keep the array stable.

```ts
import type { RichTextExtension } from '@salmonui/rich-text';
import { Plugin } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';

const highlight: RichTextExtension = {
  name: 'highlight',
  marks: {
    highlight: { parseDOM: [{ tag: 'mark' }], toDOM: () => ['mark', 0] },
  },
  commands: {
    toggleHighlight: () => (state, dispatch) => toggleMark(state.schema.marks.highlight!)(state, dispatch),
  },
  keyBindings: { 'Mod-Shift-h': 'toggleHighlight' },
  toolbarItems: [{ id: 'highlight', label: 'Highlight', command: 'toggleHighlight' }],
  plugins: ({ schema, getState, getView }) => [new Plugin({ /* ... */ })],
};

<RichTextEditor extensions={[highlight]} toolbar={[...RICH_TEXT_DEFAULT_TOOLBAR, '|', 'highlight']} />
```

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Identifies the extension |
| `nodes`, `marks` | `Record<string, NodeSpec / MarkSpec>` | Added to the schema |
| `plugins` | `(context) => Plugin[] \| Promise<Plugin[]>` | ProseMirror plugins; the factory gets `schema`, `getState()` and `getView()`, and may be async (the editor waits) |
| `keyBindings` | `Record<string, string \| Command>` | Key to command id or ProseMirror command, before the built-in keys |
| `inputRules` | `(schema) => InputRule[]` | Typing shortcuts |
| `commands` | `Record<string, (...args) => Command>` | Run with `actionsRef.current.run(id, ...args)` or from a key or toolbar item |
| `toolbarItems` | `{ id, label, command, icon? }[]` | Items the `toolbar` prop can name |
| `html` | `{ tags?, attributes? }` | Elements and attributes the extension writes, added to the sanitizer allow-list for value in, paste and HTML out (never active content, `on*` handlers or `style`) |
| `replacesHistory`, `history` | `boolean`, `{ undo, redo }` | Replace the engine's undo history (the Yjs undo manager of `/collab` does) |

Content an extension adds still passes the sanitizer: the shared vocabulary
plus the extension's `html` entry survive `getHtml()` and paste. Script,
style, iframe, object, embed and form elements, `on*` handlers, `style` and
URL attributes other than `href`, `cite`, `src` and `poster` can never be
allowed, and those four are still checked by the URL rules. `BlockEditor`
stores marks in its block JSON, so an extension mark there needs a matching
block mark; command, key binding, plugin and toolbar extensions work in both
editors.

The example imports `prosemirror-state` and `prosemirror-commands`, which
`@salmonui/rich-text` already depends on; add them to your own
`dependencies` when you import them directly. Commands can also be written
against the `state` and `dispatch` they receive without any import, as in
the demo above.

React is the only framework binding: the editors are the binding, and the
engine is plain TypeScript for anything else.

## API reference

[`@salmonui/rich-text`](/docs/reference/rich-text) lists
`RichTextExtension`, `RichTextEngine`, `loadRichTextEngine` and the
command types.
