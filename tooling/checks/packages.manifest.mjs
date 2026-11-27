// Package manifest: the single
// source of truth for the published @salmonui/* packages. Build, checks and
// site tooling read it instead of keeping their own package lists.
//
// Per package:
// - `name`, `dir`, `description` (one sentence; also the package.json description).
// - `deps`: the @salmonui packages it may depend on (exact-pinned to the
//   workspace version).
// - `optionalPeers`: @salmonui packages it may import only behind an optional
//   peer dependency (a subpath or a lazy chunk that needs them).
// - `react`: `required` (react / react-dom >=19 peers), `optional` (optional
//   peers; core) or `none`.
// - `families`: component families, each a public subpath (`.` when the
//   package has one family) with its entry source file under `src/` and its
//   stylesheet files (concatenated in order into `dist/<family>.css`): a
//   bare name is a file under the package's `styles/`, `<package>:<name>` a
//   stylesheet module of a package it depends on that its markup needs (the
//   core a11y, shimmer, dialog-core and drawer modules, the buttons
//   button-core module), carried because `@salmonui/core/styles.css` is the
//   theme only. `subpaths` lists further public entries of the family
//   (`./features` -> `data-grid/features.ts`).
// - `extra`: further public entries that are not a component family.
// - `css`: further published stylesheets (`./styles.css` aggregates).
// - `thirdParty`: the allow-list of direct third-party runtime dependencies
//   (only rich-text and pdf-viewer have one).
// - `classes`: the `.salmon-*` class prefixes each stylesheet module under
//   `styles/` owns (a class belongs to the longest matching prefix; checked
//   by isolation.mjs).
// - per family `composes`: the same-package families it imports (checked by
//   isolation.mjs); `peers`: optional peer packages its entry may load
//   eagerly (otherwise an optional peer stays in lazy chunks).
// - per family `carries`: the families of other packages it renders whose
//   stylesheets its own stylesheet carries, so an application never imports
//   the stylesheet of a family rendered internally; `notCarried` maps every other
//   family it renders without carrying its rules to the reason (`Not
//   needed`: an opt-in lazy feature whose stylesheet is imported with it, or
//   markup that needs only a carried module such as button-core).
//   css-composition.mjs expands both
//   and its test proves them complete against the import graph.
// - per family `alsoImport`: the stylesheets of other families an
//   application imports with this family because its stylesheet does not
//   carry them, keyed by family name, each with when it is needed (`null`:
//   always). It covers every `notCarried` entry whose reason asks for an
//   import, plus markup rendered from a carried module whose rules are
//   not carried (the SidebarLayout overlay); the docs pages, the Agent
//   Skills and the MCP index state exactly these (css-composition.test).
// - `internal`: true when the package exposes `./internal/*` to other
//   @salmonui packages (private, not semver, never documented).
// - `bin`: executables (`npx` command name -> entry source file under `src/`);
//   only the Node tooling package `@salmonui/mcp` has one.
// - `platform`: `node` for a Node-only package (no React, no DOM, zero runtime
//   deps; its built graph may import `node:*` builtins and nothing else).
//   Omitted for browser/universal packages, which never import `node:*`.
// - `data`: files under `dist/` that ship as data, not modules (no source
//   map, reached by `new URL(..., import.meta.url)`); pack:check requires
//   them in the tarball.
// - `bundle: false`: no browser bundle budget (bundle:check skips it).

// The release version: source stays 0.1.0 until `changeset version` applies
// .changeset/salmon-ui-0-2-0.md (release-plan.mjs).
export const VERSION = '0.2.0';

const family = (name, own, more = {}) => ({ name, entry: `${name}.ts`, styles: own, ...more });
// Reasons shared by several `notCarried` entries.
const LAZY_MENU = 'the lazy overflow menu renders Menu; import its stylesheet with the overflow menu so this budget stays met';
const LAZY_TOOLTIP = 'the lazy tooltip chunk renders Tooltip; import its stylesheet with the tooltip feature';
// `alsoImport` conditions shared by several families.
const OVERFLOW_MENU = 'with `overflow="menu"`';
const WITH_TOOLTIP = 'with the `tooltip` prop';
// Core stylesheet modules carried by the families whose markup needs them.
const A11Y = '@salmonui/core:a11y';
const DIALOG_CORE = '@salmonui/core:dialog-core';

export const PACKAGES = [
  {
    name: '@salmonui/core',
    dir: 'packages/core',
    description: 'Shared foundation of Salmon UI: theme and locale providers, server theme styles, locale packs, data and query types, virtual-scroll math, validation, formatting, the export model with CSV, and the theme stylesheet.',
    deps: [],
    optionalPeers: [],
    react: 'optional',
    families: [],
    extra: {
      './theme': 'theme.ts',
      './server': 'server.ts',
      './format': 'format.ts',
      './validation': 'validation.ts',
      './data': 'data.ts',
      './virtual': 'virtual.ts',
      './dates': 'dates.ts',
      './export-model': 'export-model.ts',
      './locale': 'locale.ts',
      './locale/zh-TW': 'locale/zh-TW.ts',
    },
    // Subpaths that must not import react or the DOM.
    neutral: ['./format', './validation', './data', './virtual', './dates', './export-model', './locale/zh-TW'],
    // The theme only: every other core stylesheet module is carried by the
    // family stylesheets whose markup needs it (`@salmonui/core:<module>`).
    css: { './styles.css': ['theme'] },
    classes: { a11y: ['salmon-visually-hidden'], 'dialog-core': ['salmon-dialog'], drawer: ['salmon-drawer'] },
    thirdParty: [],
    internal: true,
  },
  {
    name: '@salmonui/data',
    dir: 'packages/data',
    description: 'Data sources for Salmon UI components over the Salmon UI JSON protocol: remote, live, offline, cursor and infinite paging, cache, dedupe, retry, optimistic writes and state storage.',
    deps: [],
    optionalPeers: [],
    react: 'none',
    families: [],
    extra: {},
    thirdParty: [],
  },
  {
    name: '@salmonui/export',
    dir: 'packages/export',
    description: 'Zero-dependency XLSX, PDF, image and iCalendar writers for Salmon UI exports, built on the @salmonui/core export model.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'none',
    families: [],
    extra: { './blob': 'blob.ts', './xlsx': 'xlsx.ts', './pdf': 'pdf.ts', './graphics': 'graphics.ts', './image': 'image.ts', './ics': 'ics.ts', './pivot': 'pivot.ts', './gantt': 'gantt.ts' },
    thirdParty: [],
  },
  {
    name: '@salmonui/buttons',
    dir: 'packages/buttons',
    description: 'Button, ToggleButton, button groups, Menu, MenuButton, SplitButton, ContextMenu, Menubar and TagGroup for Salmon UI.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'required',
    families: [family('button', ['button-core', 'button']), family('menu', ['button-core', 'button', 'menu'], { composes: ['button'] }), family('tag-group', ['tag-group'])],
    extra: {},
    classes: { 'button-core': ['salmon-button', 'salmon-toggle-button'], menu: ['salmon-menu', 'salmon-split-button', 'salmon-context-menu', 'salmon-menubar'], 'tag-group': ['salmon-tag-group', 'salmon-tag'] },
    thirdParty: [],
    internal: true,
  },
  {
    name: '@salmonui/notifications',
    dir: 'packages/notifications',
    description: 'Message, Toast, Badge, Progress, Spinner and Skeleton for Salmon UI.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'required',
    families: [
      family('message', [A11Y, 'message']),
      family('toast', [A11Y, 'toast']),
      family('badge', [A11Y, 'badge']),
      family('progress', ['motion-spin', 'motion-pulse', 'motion-indeterminate', 'progress']),
      family('spinner', [A11Y, 'motion-spin', 'spinner']),
      family('skeleton', ['@salmonui/core:shimmer', 'motion-pulse', 'skeleton']),
    ],
    extra: {},
    classes: { message: ['salmon-message'], badge: ['salmon-badge'], progress: ['salmon-progress'], spinner: ['salmon-spinner'], skeleton: ['salmon-skeleton'], toast: ['salmon-toast', 'salmon-toaster'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/calendars',
    dir: 'packages/calendars',
    description: 'Calendar, DateField, TimeField, DatePicker, DateRangePicker and TimePicker for Salmon UI.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'required',
    families: [
      family('calendar', ['calendar']),
      family('date-field', ['date-field']),
      family('date-picker', ['calendar', 'date-field', 'picker', 'date-picker'], { composes: ['calendar', 'date-field'], subpaths: { './data-grid': 'date-picker/data-grid.ts' } }),
      family('date-range-picker', ['calendar', 'date-field', 'picker', 'date-range-picker'], { composes: ['calendar', 'date-field'] }),
      family('time-picker', ['date-field', 'picker', 'time-picker'], { composes: ['date-field'] }),
    ],
    extra: {},
    classes: { calendar: ['salmon-calendar'], 'date-field': ['salmon-date-field', 'salmon-time-field'], picker: ['salmon-picker', 'salmon-time-list'], 'date-picker': ['salmon-date-picker'], 'date-range-picker': ['salmon-date-range'], 'time-picker': ['salmon-time-picker'] },
    thirdParty: [],
    internal: true,
  },
  {
    name: '@salmonui/dropdowns',
    dir: 'packages/dropdowns',
    description: 'ListBox, Select, Combobox, TreeSelect and Mention for Salmon UI.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'required',
    families: [family('listbox', ['listbox']), family('select', ['dropdown', 'field', 'select']), family('combobox', ['dropdown', 'field', 'combobox']), family('tree-select', ['dropdown', 'tree-select']), family('mention', ['mention'])],
    extra: {},
    classes: { dropdown: ['salmon-dropdown'], field: ['salmon-dropdown-field'], listbox: ['salmon-listbox'], select: ['salmon-select'], combobox: ['salmon-combobox'], 'tree-select': ['salmon-tree-select'], mention: ['salmon-mention'] },
    thirdParty: [],
    internal: true,
  },
  {
    name: '@salmonui/kanban',
    dir: 'packages/kanban',
    description: 'Kanban board for Salmon UI with swimlanes, virtualized columns, keyboard and pointer card moves.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'required',
    families: [{ name: 'kanban', entry: 'kanban.ts', styles: [A11Y, 'kanban'], root: true }],
    extra: {},
    classes: { kanban: ['salmon-kanban'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/data-grid',
    dir: 'packages/data-grid',
    description: 'Virtualized React Data Grid for Salmon UI on a framework-agnostic engine: sorting, filtering, grouping, editing, tree, detail rows, export and server helpers.',
    deps: ['@salmonui/core'],
    // `/engine/export-server` loads the XLSX and PDF writers on use.
    optionalPeers: ['@salmonui/export'],
    react: 'required',
    families: [{ name: 'data-grid', entry: 'data-grid.ts', styles: ['data-grid', 'query', 'output', 'editing', 'adaptive', 'features', 'detail', 'infinite', '@salmonui/core:shimmer', 'icons'], root: true, subpaths: { './features': 'data-grid/features.ts' } }],
    extra: { './server': 'server.ts' },
    // The framework-agnostic engine (`src/engine`, its own tsconfig without the DOM lib).
    engine: {
      '.': 'index.ts',
      './sort': 'sort.ts',
      './filter': 'filter.ts',
      './search': 'search.ts',
      './paging': 'paging.ts',
      './grouping': 'grouping.ts',
      './aggregates': 'aggregates.ts',
      './selection': 'selection.ts',
      './focus': 'focus.ts',
      './keyboard': 'keyboard.ts',
      './edit': 'edit.ts',
      './edit-state': 'edit-state.ts',
      './clipboard': 'clipboard.ts',
      './validation': 'validation.ts',
      './expansion': 'expansion.ts',
      './hierarchy': 'hierarchy.ts',
      './row-drag-state': 'row-drag-state.ts',
      './row-drag-drop': 'row-drag-drop.ts',
      './infinite': 'infinite.ts',
      './lookup': 'lookup.ts',
      './persistence': 'persistence.ts',
      './locale': 'locale.ts',
      './export': 'export.ts',
      './export-server': 'export-server.ts',
      './row-pinning': 'row-pinning.ts',
      './tree': 'tree.ts',
      './tree-remote': 'tree-remote.ts',
    },
    classes: { 'data-grid': ['salmon-data-grid'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/overlays',
    dir: 'packages/overlays',
    description: 'Dialog, AlertDialog, Drawer, Popover and Tooltip for Salmon UI.',
    deps: ['@salmonui/core', '@salmonui/buttons'],
    optionalPeers: [],
    react: 'required',
    families: [family('dialog', [DIALOG_CORE, 'dialog'], { carries: ['button'] }), family('drawer', [DIALOG_CORE, '@salmonui/core:drawer']), family('popover', ['popover']), family('tooltip', ['tooltip'])],
    extra: {},
    classes: { dialog: ['salmon-alert-dialog'], popover: ['salmon-popover'], tooltip: ['salmon-tooltip'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/layout',
    dir: 'packages/layout',
    description: 'Splitter, Card, Avatar, Timeline, List and DashboardLayout for Salmon UI.',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    react: 'required',
    families: ['splitter', 'card', 'avatar', 'timeline', 'list', 'dashboard-layout'].map((n) => family(n, n === 'dashboard-layout' ? [A11Y, n] : [n])),
    extra: {},
    classes: { splitter: ['salmon-splitter'], card: ['salmon-card'], avatar: ['salmon-avatar'], timeline: ['salmon-timeline'], list: ['salmon-list'], 'dashboard-layout': ['salmon-dashboard'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/navigation',
    dir: 'packages/navigation',
    description: 'Accordion, Breadcrumbs, Carousel, SidebarLayout, SidebarMenu, Tabs, Toolbar, TreeView, Stepper and Pager for Salmon UI.',
    deps: ['@salmonui/core', '@salmonui/buttons'],
    optionalPeers: [],
    react: 'required',
    // The lazy overlay presentation of sidebar-layout renders the core dialog
    // and drawer markup; its rules are not carried (the sidebar budget), the
    // application imports @salmonui/overlays/drawer/styles.css with it.
    families: ['accordion', 'breadcrumbs', 'carousel', 'sidebar-layout', 'sidebar-menu', 'tabs', 'toolbar', 'tree-view', 'stepper', 'pager'].map((n) =>
      family(n, [n], ['breadcrumbs', 'tabs', 'toolbar'].includes(n) ? { notCarried: { menu: LAZY_MENU }, alsoImport: { menu: OVERFLOW_MENU } } : n === 'sidebar-layout' ? { alsoImport: { drawer: 'with the overlay presentation (`mode="overlay"` or below `collapseBelow`)' } } : {}),
    ),
    extra: {},
    classes: { accordion: ['salmon-accordion'], breadcrumbs: ['salmon-breadcrumbs'], carousel: ['salmon-carousel'], 'sidebar-layout': ['salmon-sidebar'], 'sidebar-menu': ['salmon-sidebar-menu'], tabs: ['salmon-tabs', 'salmon-tab'], toolbar: ['salmon-toolbar', 'salmon-app-bar'], 'tree-view': ['salmon-tree-view'], stepper: ['salmon-stepper'], pager: ['salmon-pager'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/inputs',
    dir: 'packages/inputs',
    description: 'Form, text, masked and number fields, FileUpload, Checkbox, RadioGroup, Switch, Rating, OtpField, Slider, SignaturePad, ColorPicker, SpeechToText and FormRenderer for Salmon UI.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/dropdowns'],
    optionalPeers: [],
    react: 'required',
    families: [
      family('form', ['field', 'form'], { subpaths: { './state': 'form-state.ts' } }),
      family('text-field', ['field', 'input-group', 'text-field']),
      family('masked-field', ['field', 'input-group']),
      family('number-field', ['field', 'input-group', 'number-field']),
      family('file-upload', ['field', 'file-upload'], { subpaths: { './xhr': 'file-upload-xhr.ts' } }),
      family('checkbox', ['field', 'toggle-input', 'choice-group', 'checkbox']),
      family('radio-group', ['field', 'toggle-input', 'choice-group', 'radio-group']),
      family('switch', ['field', 'toggle-input', 'switch']),
      family('rating', ['field', 'choice-group', 'rating']),
      family('otp-field', ['field', 'otp-field']),
      family('slider', ['field', 'slider']),
      family('signature-pad', ['field', 'signature-pad']),
      family('color-picker', ['field', 'input-group', 'color-picker']),
      family('speech-to-text', ['speech-to-text'], { carries: ['button'] }),
      family('form-renderer', ['field', 'form', 'input-group', 'toggle-input', 'choice-group', 'text-field', 'number-field', 'checkbox', 'switch', 'radio-group', 'form-renderer'], { composes: ['form', 'text-field', 'number-field', 'checkbox', 'switch', 'radio-group'], carries: ['select', 'button'] }),
    ],
    extra: {},
    classes: { field: ['salmon-field'], 'input-group': ['salmon-input'], 'toggle-input': ['salmon-toggle'], 'choice-group': ['salmon-choice-group'], 'text-field': ['salmon-text-field', 'salmon-text-area'], 'number-field': ['salmon-number-field'], 'file-upload': ['salmon-file-upload'], checkbox: ['salmon-toggle-checkbox'], 'radio-group': ['salmon-toggle-radio'], switch: ['salmon-toggle-switch', 'salmon-toggle-control', 'salmon-toggle-extra'], rating: ['salmon-rating'], 'otp-field': ['salmon-otp'], slider: ['salmon-slider'], 'signature-pad': ['salmon-signature-pad'], 'color-picker': ['salmon-color-picker', 'salmon-color-area', 'salmon-color-slider', 'salmon-color-field', 'salmon-color-swatch'], 'speech-to-text': ['salmon-speech-to-text'], 'form-renderer': ['salmon-form-renderer'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/query-builder',
    dir: 'packages/query-builder',
    description: 'QueryBuilder for Salmon UI with SQL and MongoDB import and export.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/dropdowns', '@salmonui/calendars', '@salmonui/inputs'],
    optionalPeers: [],
    react: 'required',
    families: [{ name: 'query-builder', entry: 'query-builder.ts', styles: ['query-builder'], carries: ['date-field', 'select', 'combobox', 'tree-select', 'button', 'text-field', 'number-field', 'checkbox'], root: true, subpaths: { './sql': 'query-builder/sql.ts', './mongo': 'query-builder/mongo.ts' } }],
    extra: {},
    classes: { 'query-builder': ['salmon-query-builder'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/charts',
    dir: 'packages/charts',
    description: 'Charts and data visualization for Salmon UI: Chart, RangeSelector, StockChart, Sparkline, PieChart, HeatMap, TreeMap, SankeyChart, Gauge, GeoMap and Barcode, with server-side SVG.',
    deps: ['@salmonui/core', '@salmonui/buttons'],
    optionalPeers: ['@salmonui/navigation', '@salmonui/calendars'],
    react: 'required',
    families: [
      family('chart', ['viz', 'chart'], { notCarried: { toolbar: 'the lazy zoom toolbar renders Toolbar; import its stylesheet with the zoom toolbar', button: 'the lazy zoom toolbar renders its tool group with Button; import the Button stylesheet with the zoom toolbar' }, alsoImport: { toolbar: 'with the zoom toolbar (`zoom.toolbar`)', button: 'with the zoom toolbar (`zoom.toolbar`)' }, subpaths: { './features': 'chart/features.ts', './export': 'chart-export.ts', './indicators': 'chart/indicators.ts', './bullet': 'chart-bullet.ts' } }),
      family('range-selector', ['viz', 'range-selector'], { notCarried: { button: 'the opt-in period selector renders ToggleButtonGroup; import the Button stylesheet with it so this budget stays met' }, alsoImport: { button: 'with the period selector (`periods`, `PeriodSelector`)' } }),
      family('stock-chart', ['stock-chart'], {
        composes: ['chart', 'range-selector'],
        peers: ['@salmonui/navigation'],
        notCarried: {
          chart: 'StockChart composes the public Chart; import chart/styles.css too',
          'range-selector': 'the navigator is the public RangeSelector; import range-selector/styles.css too',
          menu: 'indicator and export menus; import the Menu stylesheet too',
          toolbar: 'the period toolbar (optional peer); import the Toolbar stylesheet with it',
          'date-range-picker': 'the custom range input (optional peer, lazy); import its stylesheet with it',
        },
        alsoImport: { chart: null, 'range-selector': null, menu: null, toolbar: null, 'date-range-picker': 'with `customRange`' },
      }),
      family('sparkline', ['sparkline'], { subpaths: { './canvas': 'sparkline/canvas.ts' } }),
      family('pie-chart', ['viz', 'pie-chart']),
      family('heat-map', ['viz', 'heat-map']),
      family('tree-map', ['viz', 'tree-map']),
      family('sankey-chart', ['viz', 'sankey-chart']),
      family('gauge', ['viz', 'gauge']),
      family('geo-map', ['viz', 'geo-map']),
      family('barcode', ['barcode'], { subpaths: { './pdf417': 'barcode-pdf417.ts', './gs1-databar': 'barcode-gs1-databar.ts', './dotcode': 'barcode-dotcode.ts' } }),
    ],
    extra: { './server': 'server-visualization.ts' },
    css: { './viz-animations.css': ['viz-animations'], './viz-rtl.css': ['viz-rtl'] },
    classes: { viz: ['salmon-viz'], chart: ['salmon-chart'], 'range-selector': ['salmon-range-selector'], 'stock-chart': ['salmon-stock-chart'], sparkline: ['salmon-sparkline'], 'pie-chart': ['salmon-pie-chart', 'salmon-funnel-chart', 'salmon-accumulation'], 'heat-map': ['salmon-heat-map'], 'tree-map': ['salmon-tree-map'], 'sankey-chart': ['salmon-sankey-chart'], gauge: ['salmon-gauge'], 'geo-map': ['salmon-geo-map'], barcode: ['salmon-barcode', 'salmon-qr-code'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/chat',
    dir: 'packages/chat',
    description: 'Conversation, InlineAssist, TextSuggest and SmartPaste for Salmon UI with provider-agnostic AI adapters.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/dropdowns', '@salmonui/inputs'],
    optionalPeers: [],
    react: 'required',
    families: [
      family('conversation', ['conversation'], { carries: ['mention'], notCarried: { 'speech-to-text': 'Conversation.Dictation uses the useSpeechRecognition hook only (no SpeechToText markup)' } }),
      family('inline-assist', [A11Y, 'inline-assist'], { carries: ['menu', 'speech-to-text'] }),
      family('text-suggest', ['text-suggest']), family('smart-paste', [])],
    extra: {},
    classes: { conversation: ['salmon-conversation'], 'inline-assist': ['salmon-inline-assist'], 'text-suggest': ['salmon-text-suggest'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/editors',
    dir: 'packages/editors',
    description: 'InlineEdit, MarkdownEditor and ImageEditor for Salmon UI.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/navigation'],
    optionalPeers: [],
    react: 'required',
    families: [family('inline-edit', ['inline-edit'], { carries: ['button'] }), family('markdown-editor', ['markdown-editor'], { carries: ['button', 'menu'] }), family('image-editor', [A11Y, 'image-editor'], { carries: ['menu', 'toolbar'] })],
    extra: {},
    classes: { 'inline-edit': ['salmon-inline-edit'], 'markdown-editor': ['salmon-markdown-editor'], 'image-editor': ['salmon-image-editor'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/pivot-table',
    dir: 'packages/pivot-table',
    description: 'PivotTable and PivotFieldList for Salmon UI on a framework-agnostic pivot engine with formulas and a worker runner.',
    deps: ['@salmonui/core', '@salmonui/data-grid', '@salmonui/buttons'],
    optionalPeers: ['@salmonui/charts'],
    react: 'required',
    families: [{ name: 'pivot-table', entry: 'pivot-table.ts', styles: ['pivot-table'], carries: ['data-grid', 'menu'], notCarried: { chart: 'the separate `/chart` entry (PivotChart) loads Chart lazily; import chart/styles.css with it', 'pie-chart': 'the separate `/chart` entry loads PieChart lazily; import pie-chart/styles.css with it' }, alsoImport: { chart: 'with `PivotChart` (`@salmonui/pivot-table/chart`)', 'pie-chart': 'with `PivotChart` (`@salmonui/pivot-table/chart`)' }, root: true, subpaths: { './chart': 'pivot-table-chart.ts' } }],
    extra: {},
    engine: { '.': 'index.ts', './formula': 'formula.ts', './worker': 'worker.ts' },
    classes: { 'pivot-table': ['salmon-pivot-table'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/scheduler',
    dir: 'packages/scheduler',
    description: 'Scheduler for Salmon UI: day, week, month, agenda and timeline views with recurrence, resources and iCalendar data.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/calendars', '@salmonui/dropdowns', '@salmonui/overlays'],
    optionalPeers: [],
    react: 'required',
    families: [
      {
        name: 'scheduler',
        entry: 'scheduler.ts', styles: ['@salmonui/buttons:button-core', DIALOG_CORE, '@salmonui/dropdowns:dropdown', '@salmonui/dropdowns:select', 'recurrence-editor', 'scheduler'],
        carries: ['popover', 'date-picker'],
        notCarried: { select: 'the bare Select (no label, description or error parts): the stylesheet carries the dropdown and select modules, not the field module', button: 'plain Button and ToggleButtonGroup only: the stylesheet carries the button-core module, not the Button extras', menu: 'the lazy context menu renders Menu; import its stylesheet with the context menu', tooltip: LAZY_TOOLTIP },
        alsoImport: { menu: 'with the `contextMenu` prop', tooltip: WITH_TOOLTIP },
        root: true,
      },
    ],
    extra: {},
    classes: { 'recurrence-editor': ['salmon-recurrence-editor'], scheduler: ['salmon-scheduler'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/gantt',
    dir: 'packages/gantt',
    description: 'Gantt chart for Salmon UI on the Data Grid: dependencies, critical path, baselines, resources and undo history.',
    deps: ['@salmonui/core', '@salmonui/data-grid', '@salmonui/calendars', '@salmonui/overlays', '@salmonui/buttons', '@salmonui/layout'],
    optionalPeers: [],
    react: 'required',
    families: [{ name: 'gantt', entry: 'gantt.ts', styles: [A11Y, 'gantt'], carries: ['data-grid', 'splitter', 'dialog', 'menu', 'date-picker'], notCarried: { tooltip: LAZY_TOOLTIP }, alsoImport: { tooltip: WITH_TOOLTIP }, root: true }],
    extra: {},
    classes: { gantt: ['salmon-gantt'] },
    thirdParty: [],
  },
  {
    name: '@salmonui/rich-text',
    dir: 'packages/rich-text',
    description: 'RichTextEditor, BlockEditor and RichTextContent for Salmon UI on one ProseMirror engine, with an opt-in Yjs collaboration subpath.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/dropdowns'],
    optionalPeers: [],
    react: 'required',
    families: [{ name: 'rich-text', entry: 'index.ts', styles: ['rich-text'], carries: ['menu', 'mention'], root: true, subpaths: { './collab': 'collab.ts' } }],
    extra: {},
    classes: { 'rich-text': ['salmon-rich-text', 'salmon-block-editor'] },
    thirdParty: [/^prosemirror-[a-z-]+$/, 'orderedmap', 'rope-sequence', 'w3c-keyname', 'yjs', 'y-prosemirror', 'lib0', 'y-protocols'],
  },
  {
    name: '@salmonui/pdf-viewer',
    dir: 'packages/pdf-viewer',
    description: 'PdfViewer for Salmon UI: view, search, thumbnails, bookmarks, print, text markup and form filling on pdf.js, loaded lazily on the client.',
    deps: ['@salmonui/core', '@salmonui/buttons', '@salmonui/navigation', '@salmonui/overlays'],
    optionalPeers: [],
    react: 'required',
    // The viewer carries the Menu and Dialog modules without the Button
    // stylesheet: with it the stylesheet is over its budget (6.8 KB against
    // 5.5 KB), so its Button rules come with the Button stylesheet.
    families: [
      {
        name: 'pdf-viewer',
        entry: 'index.ts',
        styles: ['@salmonui/buttons:menu', DIALOG_CORE, '@salmonui/overlays:dialog', 'pdf-viewer'],
        carries: ['toolbar', 'tree-view'],
        notCarried: {
          button: 'toolbar and sidebar buttons; import the Button stylesheet with the viewer (carrying it puts this stylesheet over its budget)',
          menu: 'carries the menu module only; the Button rules of its trigger come with the Button stylesheet',
          dialog: 'carries the dialog core and dialog modules only; the Button rules come with the Button stylesheet',
        },
        alsoImport: { button: null },
        root: true,
      },
    ],
    extra: {},
    classes: { 'pdf-viewer': ['salmon-pdf-viewer'] },
    thirdParty: ['pdfjs-dist'],
  },
  {
    name: '@salmonui/mcp',
    dir: 'packages/mcp',
    description: 'Model Context Protocol server for Salmon UI: lets coding agents list components, search the docs, read component APIs and demos, and check @salmonui imports, from an offline index of the same version.',
    deps: [],
    optionalPeers: [],
    react: 'none',
    families: [],
    extra: { '.': 'index.ts' },
    // Node CLI (`npx -y @salmonui/mcp`): an MCP server over stdio that reads the bundled `dist/index.json`.
    bin: { 'salmonui-mcp': 'bin.ts' },
    platform: 'node',
    // Written by `npm run mcp:index` (release:verify, prepack) after the build.
    data: ['index.json'],
    bundle: false,
    thirdParty: [],
  },
];

export const PACKAGE_NAMES = PACKAGES.map((p) => p.name);

/** The manifest entry of a package name. */
export function manifestOf(name) {
  return PACKAGES.find((p) => p.name === name);
}

/** The public subpath of a family inside its package: `.` for single-family packages. */
export function familySubpath(pkg, fam) {
  return fam.root ? '.' : `./${fam.name}`;
}

/** Every family as `{ pkg, family, specifier }`, `specifier` being the public import name. */
export function allFamilies() {
  return PACKAGES.flatMap((pkg) => pkg.families.map((fam) => ({ pkg, family: fam, specifier: fam.root ? pkg.name : `${pkg.name}/${fam.name}` })));
}
