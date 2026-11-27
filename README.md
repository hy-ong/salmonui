# Salmon UI

Salmon UI is an open-source React component library for data-heavy
applications: a virtualized Data Grid on a framework-agnostic engine, plus
buttons, inputs, dropdowns, calendars, a scheduler, Gantt, Kanban, pivot
table, charts, rich-text and PDF viewing, chat and AI-assist surfaces, and
layout and navigation components.

- React 19 and later; server rendering (Next.js App Router, Vite SSR) is
  first-class and React Compiler compatible.
- ESM only, tree-shakeable: every component family is its own subpath with
  its own stylesheet.
- Zero runtime dependencies, except the opt-in packages that wrap
  ProseMirror (`@salmonui/rich-text`) and pdf.js (`@salmonui/pdf-viewer`).
- Theming is colors only: five semantic seeds and a color scheme, written
  as `--salmon-*` CSS custom properties. No CSS-in-JS runtime.
- Accessible by default (WAI-ARIA patterns, keyboard support, RTL).

Documentation, guides and live demos: **https://salmonui.dev**

## Packages

| Package | Contents |
| --- | --- |
| [`@salmonui/core`](packages/core) | Theme and locale providers, server theme styles, locale packs, formatting, validation, virtual-scroll math, the export model and the theme stylesheet |
| [`@salmonui/data`](packages/data) | Data sources: remote, live, offline, cursor and infinite paging, cache, retry, optimistic writes |
| [`@salmonui/export`](packages/export) | XLSX, PDF, image and iCalendar writers |
| [`@salmonui/data-grid`](packages/data-grid) | Data Grid: sorting, filtering, grouping, editing, tree, detail rows, export, server helpers |
| [`@salmonui/buttons`](packages/buttons) | Button, ToggleButton, button groups, Menu, MenuButton, SplitButton, ContextMenu, Menubar, TagGroup |
| [`@salmonui/inputs`](packages/inputs) | Form, text, masked and number fields, FileUpload, Checkbox, RadioGroup, Switch, Rating, Slider, ColorPicker, SignaturePad and more |
| [`@salmonui/dropdowns`](packages/dropdowns) | ListBox, Select, Combobox, TreeSelect, Mention |
| [`@salmonui/calendars`](packages/calendars) | Calendar, DateField, TimeField, DatePicker, DateRangePicker, TimePicker |
| [`@salmonui/scheduler`](packages/scheduler) | Scheduler: day, week, month, agenda and timeline views, recurrence, resources |
| [`@salmonui/gantt`](packages/gantt) | Gantt chart: dependencies, critical path, baselines, resources |
| [`@salmonui/kanban`](packages/kanban) | Kanban board with swimlanes and virtualized columns |
| [`@salmonui/pivot-table`](packages/pivot-table) | PivotTable and PivotFieldList on a framework-agnostic pivot engine |
| [`@salmonui/query-builder`](packages/query-builder) | QueryBuilder with SQL and MongoDB import and export |
| [`@salmonui/charts`](packages/charts) | Chart, StockChart, Sparkline, PieChart, HeatMap, TreeMap, SankeyChart, Gauge, GeoMap, Barcode |
| [`@salmonui/navigation`](packages/navigation) | Accordion, Breadcrumbs, Carousel, SidebarLayout, SidebarMenu, Tabs, Toolbar, TreeView, Stepper, Pager |
| [`@salmonui/layout`](packages/layout) | Splitter, Card, Avatar, Timeline, List, DashboardLayout |
| [`@salmonui/overlays`](packages/overlays) | Dialog, AlertDialog, Drawer, Popover, Tooltip |
| [`@salmonui/notifications`](packages/notifications) | Message, Toast, Badge, Progress, Spinner, Skeleton |
| [`@salmonui/editors`](packages/editors) | InlineEdit, MarkdownEditor, ImageEditor |
| [`@salmonui/rich-text`](packages/rich-text) | RichTextEditor, BlockEditor and RichTextContent on ProseMirror, opt-in Yjs collaboration |
| [`@salmonui/pdf-viewer`](packages/pdf-viewer) | PdfViewer on pdf.js, loaded lazily on the client |
| [`@salmonui/chat`](packages/chat) | Conversation, InlineAssist, TextSuggest, SmartPaste with provider-agnostic AI adapters |
| [`@salmonui/mcp`](packages/mcp) | Model Context Protocol server that lets coding agents look up components, docs and APIs offline |

All `@salmonui/*` packages are released together with the same version;
an application must use one version of all of them.

## Install

```sh
npm install @salmonui/core @salmonui/data-grid react react-dom
```

`react` and `react-dom` 19 or later are peer dependencies.

## Quick start

Import the theme stylesheet once per application, then the stylesheet of
each component family you use:

```tsx
import '@salmonui/core/styles.css'; // theme variables, once per application
import '@salmonui/data-grid/styles.css';
import '@salmonui/buttons/button/styles.css';

import { ThemeProvider } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';
import { DataGrid } from '@salmonui/data-grid';
import { Button } from '@salmonui/buttons/button';

const theme = { colors: { primary: '#0f766e' }, colorScheme: 'auto' } as const;

const orders = [
  { id: 1, product: 'Espresso beans', total: 32.5 },
  { id: 2, product: 'Pour-over kettle', total: 74 },
];

const columns = [
  { field: 'id', header: 'Order', type: 'number', primaryKey: true },
  { field: 'product', header: 'Product' },
  { field: 'total', header: 'Total', type: 'number', format: 'C2', align: 'end' },
] as const;

export function App() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <ThemeProvider theme={theme}>
        <DataGrid aria-label="Orders" data={orders} columns={columns} sorting />
        <Button onClick={() => console.log('saved')}>Save</Button>
      </ThemeProvider>
    </>
  );
}
```

See https://salmonui.dev for every component, the theming guide, server
rendering setup and the API reference.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Third-party notices for the opt-in dependency packages are in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
