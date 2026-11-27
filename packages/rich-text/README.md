# @salmonui/rich-text

Rich text editing for Salmon UI: `RichTextEditor` (HTML value, toolbar,
quick toolbars, dialogs), `BlockEditor` (block JSON value, slash menu, drag
handles, block menus) and `RichTextContent` (server-safe read-only HTML),
all on one ProseMirror engine.

```sh
npm install @salmonui/rich-text @salmonui/core react react-dom
```

Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

- Dependency-exception package: the only Salmon UI package that may use
  ProseMirror, and, through the opt-in `@salmonui/rich-text/collab`
  subpath only, Yjs. Every other package stays free of third-party runtime
  dependencies.
- ProseMirror loads with dynamic `import()` on the client after hydration.
  The server renders the sanitized HTML of `value` in the element the
  engine mounts on, so the markup matches and nothing reads the DOM during
  render.
- `react` and `react-dom` `>=19` are peers. ESM only.
- Public entry points: `@salmonui/rich-text` (`RichTextEditor`,
  `BlockEditor`, `RichTextContent`) and `@salmonui/rich-text/collab`
  (`createCollaboration`).

```tsx
import { RichTextEditor } from '@salmonui/rich-text';
import { createCollaboration } from '@salmonui/rich-text/collab'; // opt-in, adds Yjs

import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/dropdowns/mention/styles.css';
import '@salmonui/rich-text/styles.css';

<RichTextEditor defaultValue="<p>Hello</p>" onChange={(html) => save(html)} aria-label="Body" />;
```

The editor toolbars render buttons, menus and mentions, so their family
stylesheets come before `@salmonui/rich-text/styles.css`.

## Third-party dependencies

Every direct runtime dependency is exact-pinned, on the allow-list in
`tooling/checks/packages.manifest.mjs` (`thirdParty`) and
listed with its license in the repository `THIRD_PARTY_LICENSES.md`.

| Package | License | Used by |
| --- | --- | --- |
| `prosemirror-model` | MIT | engine (lazy chunk) |
| `prosemirror-state` | MIT | engine (lazy chunk) |
| `prosemirror-view` | MIT | engine (lazy chunk) |
| `prosemirror-transform` | MIT | engine (lazy chunk) |
| `prosemirror-commands` | MIT | engine (lazy chunk) |
| `prosemirror-history` | MIT | engine (lazy chunk) |
| `prosemirror-keymap` | MIT | engine (lazy chunk) |
| `prosemirror-inputrules` | MIT | engine (lazy chunk) |
| `prosemirror-schema-list` | MIT | engine (lazy chunk) |
| `prosemirror-tables` | MIT | engine (lazy chunk) |
| `prosemirror-dropcursor` | MIT | engine (lazy chunk) |
| `prosemirror-gapcursor` | MIT | engine (lazy chunk) |
| `yjs` | MIT | `@salmonui/rich-text/collab` only |
| `y-prosemirror` | MIT | `@salmonui/rich-text/collab` only |
| `y-protocols` | MIT | `@salmonui/rich-text/collab` only |

Transitive: `orderedmap`, `rope-sequence`, `w3c-keyname` (ProseMirror) and
`lib0` and `isomorphic.js` (Yjs), all MIT.

## Documentation

- RichTextEditor: <https://salmonui.dev/docs/editors/rich-text-editor>
- BlockEditor: <https://salmonui.dev/docs/editors/block-editor>
- RichTextContent: <https://salmonui.dev/docs/editors/rich-text-content>

## License

MIT. Third-party licenses: [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md).
