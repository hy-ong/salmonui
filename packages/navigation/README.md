# @salmonui/navigation

Accordion, Breadcrumbs, Carousel, SidebarLayout, SidebarMenu, Tabs, Toolbar, TreeView, Stepper and Pager for Salmon UI.

```sh
npm install @salmonui/navigation @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Tabs, TabList, Tab, TabPanel } from '@salmonui/navigation/tabs';
import { Toolbar, ToolbarItem } from '@salmonui/navigation/toolbar';
import { TreeView } from '@salmonui/navigation/tree-view';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/navigation/accordion/styles.css';
```

Each family has its own `@salmonui/navigation/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/navigation/accordion`
- `@salmonui/navigation/breadcrumbs`
- `@salmonui/navigation/carousel`
- `@salmonui/navigation/sidebar-layout`
- `@salmonui/navigation/sidebar-menu`
- `@salmonui/navigation/tabs`
- `@salmonui/navigation/toolbar`
- `@salmonui/navigation/tree-view`
- `@salmonui/navigation/stepper`
- `@salmonui/navigation/pager`

## Documentation

- Component guides and API reference: <https://salmonui.dev>

## License

MIT
