# @salmonui/layout

Splitter, Card, Avatar, Timeline, List and DashboardLayout for Salmon UI.

```sh
npm install @salmonui/layout @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Splitter, SplitterPane } from '@salmonui/layout/splitter';
import { Card, CardHeader, CardBody } from '@salmonui/layout/card';
import { DashboardLayout, DashboardLayoutPanel } from '@salmonui/layout/dashboard-layout';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/layout/splitter/styles.css';
```

Each family has its own `@salmonui/layout/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/layout/splitter`
- `@salmonui/layout/card`
- `@salmonui/layout/avatar`
- `@salmonui/layout/timeline`
- `@salmonui/layout/list`
- `@salmonui/layout/dashboard-layout`

## Documentation

- Component guides and API reference: <https://salmonui.dev>

## License

MIT
