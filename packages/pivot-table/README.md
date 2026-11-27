# @salmonui/pivot-table

PivotTable and PivotFieldList for Salmon UI on a framework-agnostic pivot engine with formulas and a worker runner.

```sh
npm install @salmonui/pivot-table @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { PivotTable, PivotFieldList, usePivot } from '@salmonui/pivot-table';
import { PivotChart } from '@salmonui/pivot-table/chart';
import { createPivotWorkerEngine } from '@salmonui/pivot-table/engine';
```

Import the theme stylesheet once per application, then the
package stylesheet,
after the stylesheets of the components it renders from other packages:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/pivot-table/styles.css';
```

Public entry points:

- `@salmonui/pivot-table`
- `@salmonui/pivot-table/chart`
- `@salmonui/pivot-table/engine`
- `@salmonui/pivot-table/engine/formula`
- `@salmonui/pivot-table/engine/worker`

The pivot engine (`/engine`, `/engine/formula`, `/engine/worker`) imports
neither React nor the DOM. `/chart` needs `@salmonui/charts` (optional peer).

## Documentation

- Pivot Table: <https://salmonui.dev/docs/pivot-table/pivot-table>

## License

MIT
