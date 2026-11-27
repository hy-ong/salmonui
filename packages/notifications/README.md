# @salmonui/notifications

Message, Toast, Badge, Progress, Spinner and Skeleton for Salmon UI.

```sh
npm install @salmonui/notifications @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Message } from '@salmonui/notifications/message';
import { Toaster, useToast } from '@salmonui/notifications/toast';
import { Spinner } from '@salmonui/notifications/spinner';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/notifications/message/styles.css';
```

Each family has its own `@salmonui/notifications/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/notifications/message`
- `@salmonui/notifications/toast`
- `@salmonui/notifications/badge`
- `@salmonui/notifications/progress`
- `@salmonui/notifications/spinner`
- `@salmonui/notifications/skeleton`

## Documentation

- Component guides and API reference: <https://salmonui.dev>

## License

MIT
