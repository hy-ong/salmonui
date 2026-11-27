# @salmonui/kanban

Kanban board for Salmon UI with swimlanes, virtualized columns, keyboard and pointer card moves.

```sh
npm install @salmonui/kanban @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Kanban, KanbanColumn } from '@salmonui/kanban';
```

Import the theme stylesheet once per application, then the
package stylesheet:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/kanban/styles.css';
```

Public entry points:

- `@salmonui/kanban`

## Documentation

- Kanban: <https://salmonui.dev/docs/data-visualization/kanban>

## License

MIT
