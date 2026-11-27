# @salmonui/overlays

Dialog, AlertDialog, Drawer, Popover and Tooltip for Salmon UI.

```sh
npm install @salmonui/overlays @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Dialog, DialogTrigger, DialogTitle, DialogBody } from '@salmonui/overlays/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@salmonui/overlays/popover';
import { Tooltip } from '@salmonui/overlays/tooltip';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/overlays/dialog/styles.css';
```

Each family has its own `@salmonui/overlays/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/overlays/dialog`
- `@salmonui/overlays/drawer`
- `@salmonui/overlays/popover`
- `@salmonui/overlays/tooltip`

## Documentation

- Component guides and API reference: <https://salmonui.dev>

## License

MIT
