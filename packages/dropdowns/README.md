# @salmonui/dropdowns

ListBox, Select, Combobox, TreeSelect and Mention for Salmon UI.

```sh
npm install @salmonui/dropdowns @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Select } from '@salmonui/dropdowns/select';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { TreeSelect } from '@salmonui/dropdowns/tree-select';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/dropdowns/listbox/styles.css';
```

Each family has its own `@salmonui/dropdowns/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/dropdowns/listbox`
- `@salmonui/dropdowns/select`
- `@salmonui/dropdowns/combobox`
- `@salmonui/dropdowns/tree-select`
- `@salmonui/dropdowns/mention`

## License

MIT
