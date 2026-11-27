# @salmonui/charts

Charts and data visualization for Salmon UI: Chart, RangeSelector, StockChart, Sparkline, PieChart, HeatMap, TreeMap, SankeyChart, Gauge, GeoMap and Barcode, with server-side SVG.

```sh
npm install @salmonui/charts @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Chart, ChartAxis, ChartSeries } from '@salmonui/charts/chart';
import { PieChart } from '@salmonui/charts/pie-chart';
import { Sparkline } from '@salmonui/charts/sparkline';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/charts/chart/styles.css';
```

Each family has its own `@salmonui/charts/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/charts/chart`
- `@salmonui/charts/chart/features`
- `@salmonui/charts/chart/export`
- `@salmonui/charts/chart/indicators`
- `@salmonui/charts/chart/bullet`
- `@salmonui/charts/range-selector`
- `@salmonui/charts/stock-chart`
- `@salmonui/charts/sparkline`
- `@salmonui/charts/sparkline/canvas`
- `@salmonui/charts/pie-chart`
- `@salmonui/charts/heat-map`
- `@salmonui/charts/tree-map`
- `@salmonui/charts/sankey-chart`
- `@salmonui/charts/gauge`
- `@salmonui/charts/geo-map`
- `@salmonui/charts/barcode`
- `@salmonui/charts/barcode/pdf417`
- `@salmonui/charts/barcode/gs1-databar`
- `@salmonui/charts/barcode/dotcode`
- `@salmonui/charts/server`

Optional stylesheets: `@salmonui/charts/viz-animations.css`, `@salmonui/charts/viz-rtl.css`.

`StockChart` and the lazy chart toolbar need `@salmonui/navigation` and
`@salmonui/calendars` (optional peers).

## License

MIT
