# @salmonui/gantt

Gantt chart for Salmon UI on the Data Grid: dependencies, critical path, baselines, resources and undo history.

```sh
npm install @salmonui/gantt @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Gantt } from '@salmonui/gantt';
```

Import the theme stylesheet once per application, then the
package stylesheet,
after the stylesheets of the components it renders from other packages:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/layout/splitter/styles.css';
import '@salmonui/overlays/dialog/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import '@salmonui/gantt/styles.css';
```

Public entry points:

- `@salmonui/gantt`

## Documentation

- Gantt: <https://salmonui.dev/docs/calendars/gantt>

## License

MIT
