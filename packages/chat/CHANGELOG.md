# @salmonui/chat

## 0.2.0

### Minor Changes

- 3a5e9f5: Salmon UI 0.2.0 splits the React components into one package per category.
  The 0.1.0 packages were unpublished; 0.2.0 is the first release of this
  layout.
  
  **Breaking changes**
  
  - `@salmonui/react` is removed. Import every family from its category
    package: `@salmonui/<package>/<family>` (for example
    `@salmonui/buttons/button`, `@salmonui/inputs/text-field`), or
    `@salmonui/<package>` for a single-family package (`@salmonui/data-grid`,
    `@salmonui/kanban`, `@salmonui/gantt`, ...). There is no aggregate entry.
  - The theme moves to `@salmonui/core`: `ThemeProvider` from
    `@salmonui/core/theme`, `ThemeStyle` and `createThemeCss` from
    `@salmonui/core/server`.
  - Import `@salmonui/core/styles.css` once per application (the theme
    variables) plus each family's `styles.css`, which carries the rules of
    everything the family renders, from its package or another one. The PDF
    viewer also needs `@salmonui/buttons/button/styles.css`, and the overlay
    presentation of `SidebarLayout` `@salmonui/overlays/drawer/styles.css`.
  - `@salmonui/data-grid-core` is removed: the framework-agnostic engine is
    `@salmonui/data-grid/engine` (every former subpath under `/engine/*`, the
    server export at `/engine/export-server`), and the neutral data, query,
    validation, formatting, date, virtual-scroll and export model modules are
    `@salmonui/core/data`, `/validation`, `/format`, `/dates`, `/virtual` and
    `/export-model`.
  - `@salmonui/data-grid-export` is replaced by `@salmonui/export`, a
    zero-dependency package without a root entry: `/xlsx`, `/pdf`,
    `/graphics`, `/image`, `/ics`, `/pivot`, `/gantt` and `/blob`. It is an
    optional peer of `@salmonui/data-grid`, needed only by
    `/engine/export-server`.
  - `DataGridQuery` and `DataGridDataSource` are renamed to the neutral
    `DataQuery` and `DataSource`.
  
  **Packages**
  
  `@salmonui/core`, `@salmonui/data` and `@salmonui/export`, and the component
  packages `@salmonui/buttons`, `@salmonui/notifications`,
  `@salmonui/calendars`, `@salmonui/dropdowns`, `@salmonui/kanban`,
  `@salmonui/data-grid`, `@salmonui/overlays`, `@salmonui/layout`,
  `@salmonui/navigation`, `@salmonui/inputs`, `@salmonui/query-builder`,
  `@salmonui/charts`, `@salmonui/chat`, `@salmonui/editors`,
  `@salmonui/pivot-table`, `@salmonui/scheduler`, `@salmonui/gantt`,
  `@salmonui/rich-text` and `@salmonui/pdf-viewer`. Each depends only on the
  packages it composes (exact-pinned); only `@salmonui/rich-text` (ProseMirror,
  opt-in Yjs) and `@salmonui/pdf-viewer` (pdf.js) carry third-party runtime
  dependencies.
  
  `@salmonui/mcp` is new: a zero-dependency Model Context Protocol server for
  coding agents (`claude mcp add salmonui -- npx -y @salmonui/mcp`) that lists
  the components, searches the docs, returns component APIs and demo sources
  and checks `@salmonui/*` imports, from an offline index of the same version.
  
  All published packages share one fixed version and are released together;
  every `@salmonui/*` package of an application must resolve to the same
  version (`@salmonui/core` warns in development when a second copy loads).
  This is a pre-1.0 release: until 1.0.0, a minor version may contain breaking
  changes, and its changelog says so.

### Patch Changes

- Updated dependencies [3a5e9f5]
  - @salmonui/core@0.2.0
  - @salmonui/buttons@0.2.0
  - @salmonui/dropdowns@0.2.0
  - @salmonui/inputs@0.2.0
