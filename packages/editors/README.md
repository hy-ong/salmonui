# @salmonui/editors

InlineEdit, MarkdownEditor and ImageEditor for Salmon UI.

```sh
npm install @salmonui/editors @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { InlineEdit } from '@salmonui/editors/inline-edit';
import { MarkdownEditor } from '@salmonui/editors/markdown-editor';
import { ImageEditor } from '@salmonui/editors/image-editor';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/editors/inline-edit/styles.css';
```

Each family has its own `@salmonui/editors/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/editors/inline-edit`
- `@salmonui/editors/markdown-editor`
- `@salmonui/editors/image-editor`

## License

MIT
