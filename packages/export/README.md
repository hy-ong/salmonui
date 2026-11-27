# @salmonui/export

Zero-dependency XLSX, PDF, image and iCalendar writers for Salmon UI exports, built on the @salmonui/core export model.

```sh
npm install @salmonui/export @salmonui/core
```

No third-party runtime dependencies, no React, no DOM: the writers run in
browsers and Node. ESM only; there is no root entry, import the format you
need. Every `@salmonui/*` package of an application must resolve to the same version (they are released together and exact-pinned to each other); `@salmonui/core` warns in development when a second copy loads.

```ts
import { exportXlsx } from '@salmonui/export/xlsx';
import { exportPdf } from '@salmonui/export/pdf';
import { exportICalendar } from '@salmonui/export/ics';
```

Components never import this package. Pass writer loaders instead, so a
writer loads only when an export runs:

```tsx
<DataGrid
  exportWriters={{ excel: () => import('@salmonui/export/xlsx'), pdf: () => import('@salmonui/export/pdf') }}
  /* ... */
/>
```

Server-side Data Grid exports use `@salmonui/data-grid/engine/export-server`,
which loads these writers on use.

Public entry points:

- `@salmonui/export/blob` (`toBlob`)
- `@salmonui/export/xlsx`
- `@salmonui/export/pdf`
- `@salmonui/export/graphics`
- `@salmonui/export/image`
- `@salmonui/export/ics`
- `@salmonui/export/pivot`
- `@salmonui/export/gantt`

## License

MIT
