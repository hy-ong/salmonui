# @salmonui/buttons

Button, ToggleButton, button groups, Menu, MenuButton, SplitButton, ContextMenu, Menubar and TagGroup for Salmon UI.

```sh
npm install @salmonui/buttons @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { Menu, MenuItem, MenuButton, SplitButton } from '@salmonui/buttons/menu';
import { TagGroup, Tag } from '@salmonui/buttons/tag-group';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/buttons/button/styles.css';
```

Each family has its own `@salmonui/buttons/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/buttons/button`
- `@salmonui/buttons/menu`
- `@salmonui/buttons/tag-group`

## License

MIT
