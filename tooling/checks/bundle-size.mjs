// Bundle budgets: gzip -9 size of a
// minified ESM consumer bundle per public entry, with the listed packages
// externalized, gated absolutely. Requires `npm run build`.
//
// The bundler is Vite 8 (Rolldown + Oxc minifier), already a workspace
// devDependency, instead of esbuild: no extra dependency, and it is the
// bundler the examples ship with. Each entry bundles `export * from '<entry>'`
// with entry signatures preserved, so the number is the whole public surface
// of that entry (an upper bound for any consumer that imports part of it).
//
// Lazy chunks (dynamic `import()`) are counted by default, so a row is the
// cost of every feature of the entry. A row with `scope: 'initial'` counts
// only the entry chunk and the chunks it imports statically: what a page
// loads before any optional feature is enabled; `scope: 'lazy'` counts only
// the other chunks (a prop-gated feature chunk of the entry). The `@salmonui/data-grid`
// and Full Data Grid app budgets gate the initial JS (as test:examples does for
// the example apps); their ", all chunks" rows gate the total. Every row
// also reports its initial and lazy split.
//
// The Minimal row also gates the render feature split: `forbidden` modules must not
// contribute bytes to its initial JS, and each `features` entry's closure
// (every chunk statically reachable from the chunk of its `feature-<name>`
// module, minus the initial chunks) must stay within its budget. Entries
// marked `pending` belong to render features that are not converted yet;
// they are reported, not gated, until their conversion drops the flag.
//
// A row with `report: true` is measured and printed, never gated (third-party
// engines of the dependency-exception packages).
//
// `--json` prints the report as JSON; `--only <regexp>` measures the rows whose name matches. `measureBundle()` is reused by
// deps:check (bundle contents) and test:examples (React allowance).
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { allFamilies, manifestOf } from './packages.manifest.mjs';

export const root = new URL('../../', import.meta.url).pathname;
const KB = 1024;

const REACT = ['react', 'react-dom'];
const FAMILY_SPECIFIERS = new Map(allFamilies().map((f) => [f.family.name, f.specifier]));
/** The public import name of a component family (packages.manifest.mjs), plus an optional subpath. */
export function familyEntry(name, sub = '') {
  const specifier = FAMILY_SPECIFIERS.get(name);
  if (!specifier) throw new Error(`bundle-size: no family "${name}" in packages.manifest.mjs`);
  return sub ? `${specifier}/${sub}` : specifier;
}
const familyCss = (name) => familyEntry(name, 'styles.css');
/** The @salmonui packages a package composes, except core (always bundled: it was part of every entry). */
const composedPackages = (name) => manifestOf(name).deps.filter((d) => d !== '@salmonui/core');
const BUTTON_FORBIDDEN = [/\/internal\/(position|overlay|focus-scope|menu)/, /\/dist\/menu[./]/, /\/dist\/data-grid[./]/, /packages\/data-grid\//, /packages\/data\//];
// Visualization families pull only `#viz`, `internal/viz/` and their own family:
// never the Data Grid, and never another family's directory.
const VIZ_FAMILY_DIRS = ['sparkline', 'pie-chart', 'heat-map', 'tree-map', 'sankey-chart', 'chart', 'gauge', 'geo-map', 'barcode', 'kanban', 'range-selector', 'stock-chart'];
const vizForbidden = (family) => [/\/dist\/data-grid[./]/, /packages\/data-grid\//, ...VIZ_FAMILY_DIRS.filter((d) => d !== family).map((d) => new RegExp(`/dist/${d}[./]`))];
// `/sparkline` also stays clear of the shared figure, legend, tooltip and canvas parts and the axis code.
const SPARKLINE_FORBIDDEN = [...vizForbidden('sparkline'), /\/dist\/internal\/viz\//, /\/dist\/viz\/(layout|labels|scale|time-ticks|decimate|hit-test|stack|palette)\.js/];
// The code that was the separately installed engine package before the category split:
// the Data Grid and pivot engines and the neutral @salmonui/core subpaths that came out of
// it (data, format, validation, virtual, export model; not `./dates`, which was component code). Rows that
// excluded that engine keep excluding exactly this code, so their numbers stay comparable; the rest of
// @salmonui/core (theme, internal primitives) is component code and always bundled.
const CORE = ['@salmonui/data-grid/engine', '@salmonui/pivot-table/engine', ...manifestOf('@salmonui/core').neutral.filter((s) => s !== './dates').map((s) => `@salmonui/core${s.slice(1)}`)];
// Excluded from the rich-text own-code rows: React, the composed packages (not core) and the engines.
const RICH_TEXT_EXTERNAL = ['react', 'react-dom', ...composedPackages('@salmonui/rich-text'), ...['commands', 'dropcursor', 'gapcursor', 'history', 'inputrules', 'keymap', 'model', 'schema-list', 'state', 'tables', 'transform', 'view'].map((m) => `prosemirror-${m}`), 'orderedmap', 'rope-sequence', 'w3c-keyname', 'yjs', 'y-prosemirror', 'y-protocols', 'lib0'];
const VIZ_FORBIDDEN = [/\/dist\/data-grid[./]/];
// Excluded from the pdf-viewer own-code rows: React, the composed packages (not core) and pdf.js.
const PDF_VIEWER_EXTERNAL = ['react', 'react-dom', ...composedPackages('@salmonui/pdf-viewer'), 'pdfjs-dist'];
// Initial: measured 16.06 KB (2026-11-24) + about 5 %; all chunks gate the 30 KB budget.
// styles.css carries the composed families: measured 5.20 KB + about 5 %.
const PDF_VIEWER_INITIAL = 16.9 * KB;
const PDF_VIEWER_CSS = 5.5 * KB;
const DATA = ['@salmonui/data'];
/** What the pivot rows subtract: the Data Grid renderer they share. */
const PIVOT_BASELINE = { source: "export { DataGrid } from '@salmonui/data-grid';\n" };
// The families QueryBuilder composes by design.
const entriesOf = (names) => names.map((e) => `export * as ${e.replaceAll('-', '_')} from '${familyEntry(e)}';`).join('\n');
const cssOf = (names) => names.map((e) => `import '${familyCss(e)}';`).join('\n');
const FORM_RENDERER_FAMILIES = ['form', 'text-field', 'number-field', 'checkbox', 'switch', 'radio-group', 'select', 'button'];
const SPEECH_COMPOSED = entriesOf(['button']);
const FORM_RENDERER_COMPOSED = entriesOf(FORM_RENDERER_FAMILIES);
const QB_COMPOSED = ['select', 'combobox', 'tree-select', 'button', 'text-field', 'date-picker', 'number-field', 'checkbox']
  .map((e) => `export * as ${e.replace('-', '_')} from '${familyEntry(e)}';`)
  .join('\n');

/**
 * Budget rows. `exports` are re-exported entries, `css` are side-effect CSS
 * imports, `external` are package names excluded from the measurement;
 * `shareOf` gates the bytes that those private imports (`#dates`) add;
 * `baseline` (a `source` or `exports` / `css` spec) is measured alone and
 * subtracted, so the row gates its own bytes over a shared dependency.
 * `over` gates the bytes the entry adds to a bundle of the `over` entries.
 */
export const BUDGETS = [
  { name: '@salmonui/data-grid/engine', exports: ['@salmonui/data-grid/engine'], budget: 60 * KB, external: [] },
  // Tree mode: the bytes `./tree` adds to an app that already loads the
  // root entry (`over`): tree mode never runs without the engine, and the sort, key and aggregate code the
  // tree stage reuses is root code. The entry alone (with that root code) measured 13.41 KB.
  // 6 -> 12 KB (2026-11-24, tree mode: optimize-first rule, measured 11.25 KB + 5 %): the index, view and
  // module floor alone is about 7.5 KB.
  // 12 -> 13.1 KB (2026-11-24, same rule: measured 12.44 KB + 5 % with the move splice).
  { name: '@salmonui/data-grid/engine/tree (over the root entry)', exports: ['@salmonui/data-grid/engine/tree'], over: ['@salmonui/data-grid/engine'], budget: 13.1 * KB, external: [] },
  // The remote tree adapter (`createRemoteTree`): its own entry over `./tree`, a lazy chunk of the
  // React tree feature. 2.75 -> 3.2 KB (2026-11-24, tree mode: optimize-first rule, measured 3.05 KB + 5 %).
  { name: '@salmonui/data-grid/engine/tree-remote (over the tree entry)', exports: ['@salmonui/data-grid/engine/tree-remote'], over: ['@salmonui/data-grid/engine', '@salmonui/data-grid/engine/tree'], budget: 3.2 * KB, external: [] },
  {
    name: '@salmonui/data (all adapters)',
    exports: ['@salmonui/data', '@salmonui/data/json', '@salmonui/data/local', '@salmonui/data/stream', '@salmonui/data/storage', '@salmonui/data/views', '@salmonui/data/server'],
    budget: 25 * KB,
    external: CORE,
  },
  { name: '@salmonui/data/local', exports: ['@salmonui/data/local'], budget: 6 * KB, external: CORE },
  { name: '@salmonui/data-grid', exports: ['@salmonui/data-grid'], scope: 'initial', budget: 80 * KB, external: [...CORE, ...DATA, ...REACT] },
  // 115 -> 120 KB (2026-11-23): the one approved raise for the feature chunk split.
  // 132 -> 143.5 KB (2026-11-24, tree mode: optimize-first rule, measured 136.71 KB + 5 %): every lazy chunk counts.
  { name: '@salmonui/data-grid, all chunks', exports: ['@salmonui/data-grid'], budget: 143.5 * KB, external: [...CORE, ...DATA, ...REACT] },
  { name: '@salmonui/core/theme', exports: ['@salmonui/core/theme'], budget: 5 * KB, external: REACT },
  { name: '@salmonui/core/server', exports: ['@salmonui/core/server'], budget: 5 * KB, external: REACT },
  // LocaleProvider: the provider and its merge cache; measured 0.47 KB (2026-11-26) + about 5 %.
  { name: '@salmonui/core/locale', exports: ['@salmonui/core/locale'], budget: 0.5 * KB, external: REACT },
  // The whole zh-TW pack (every family); an application that imports single families pays only those
  // (`pager` alone measured 0.26 KB, `dataGrid` 3.16 KB). Measured 14.18 KB (2026-11-26) + about 5 %.
  { name: '@salmonui/core/locale/zh-TW (whole pack)', exports: ['@salmonui/core/locale/zh-TW'], budget: 14.9 * KB, external: [] },
  { name: "import { pager } from '@salmonui/core/locale/zh-TW'", source: "export { pager } from '@salmonui/core/locale/zh-TW';\n", budget: 0.3 * KB, external: [] },
  // Standalone SVG of server-rendered visualizations: the theme derivation and the chart palette in JS.
  // Measured 4.55 KB (2026-11-24; the /server theme code is 3.99 KB of it) plus about 5 %.
  { name: '@salmonui/charts/server', exports: ['@salmonui/charts/server'], budget: 4.8 * KB, external: REACT },
  { name: '@salmonui/data-grid/styles.css', css: ['@salmonui/data-grid/styles.css'], budget: 20 * KB, external: [] },
  // Buttons category: the Menu family with its positioning, overlay and /button code.
  // The navigation budgets set ContextMenu at +1.5 KB and Menubar at
  // +3 KB above the Menu family's own 10 KB, so the family is measured by its named exports and the subpath
  // (`export *`, both additions included) gets the sum.
  {
    name: '@salmonui/buttons/menu (Menu family)',
    source: "export { Menu, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuGroup, MenuSeparator, Submenu, MenuButton, SplitButton } from '@salmonui/buttons/menu';\n",
    budget: 9.6 * KB,
    external: REACT,
  },
  {
    name: '@salmonui/buttons/menu (Menu family + ContextMenu)',
    source: "export { Menu, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuGroup, MenuSeparator, Submenu, MenuButton, SplitButton, ContextMenu } from '@salmonui/buttons/menu';\n",
    budget: 11.5 * KB,
    external: REACT,
  },
  {
    name: '@salmonui/buttons/menu (Menu family + Menubar)',
    source: "export { Menu, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuGroup, MenuSeparator, Submenu, MenuButton, SplitButton, Menubar, MenubarMenu, MenubarItem } from '@salmonui/buttons/menu';\n",
    budget: 13.1 * KB,
    external: REACT,
  },
  { name: '@salmonui/buttons/menu', exports: ['@salmonui/buttons/menu'], budget: 14.5 * KB, external: REACT },
  { name: '@salmonui/buttons/menu/styles.css', css: ['@salmonui/buttons/menu/styles.css'], budget: 3.15 * KB, external: [] },
  // Dropdowns: Mention, measured 8.88 KB / 0.76 KB plus about 5 % (proposal 11 KB).
  { name: '@salmonui/dropdowns/mention', exports: ['@salmonui/dropdowns/mention'], budget: 9.5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/dropdowns/mention/styles.css', css: ['@salmonui/dropdowns/mention/styles.css'], budget: 1 * KB, external: [] },
  // Conversation: chat variant initial (composer, feed virtualizer,
  // store) measured 13.13 KB + 5 % (16 KB proposal); the Mention composition is a lazy chunk (8.66 KB). CSS 3.29 KB.
  { name: '@salmonui/chat/conversation', exports: ['@salmonui/chat/conversation'], scope: 'initial', budget: 13.75 * KB, external: [...CORE, ...REACT] },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/chat/conversation/styles.css', css: ['@salmonui/chat/conversation/styles.css'], budget: 3778, external: [] },
  // Assistant renderers chunk: loaded through
  // `#conversation-assistant` only for variant="assistant", Conversation.Dictation (with the Inputs
  // useSpeechRecognition hook) and the composer's clear button; its bytes beyond the initial chunk,
  // measured 4.06 KB + ~5 % (5 KB proposal).
  { name: '@salmonui/chat/conversation, assistant chunk', source: `export * as e0 from '@salmonui/chat/conversation';\nexport * as a from '${root}packages/chat/dist/conversation/assistant.js';\n`, scope: 'initial', baseline: { exports: ['@salmonui/chat/conversation'] }, budget: 4.25 * KB, external: [...CORE, ...REACT] },
  // InlineAssist (9 KB budget excluding Popover and Menu): the entry's own
  // code over the families it composes (`without`): Menu, Button and SpeechToText, and the Popover entry,
  // whose overlay, dismiss and focus primitives the assist shares. CSS: own rules over menu and speech-to-text
  // (the a11y helper rule is counted). Measured 2026-11-24 plus about 5 %, under the 9 KB / 2 KB caps:
  // 4.02 KB JS, 0.49 KB CSS.
  { name: '@salmonui/chat/inline-assist (own code)', exports: ['@salmonui/chat/inline-assist'], without: entriesOf(['popover', 'menu', 'button', 'speech-to-text']), budget: 4.25 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/chat/inline-assist/styles.css (own rules)', css: ['@salmonui/chat/inline-assist/styles.css'], without: cssOf(['menu', 'speech-to-text']), budget: 0.52 * KB, external: [] },
  { name: '@salmonui/core/styles.css', css: ['@salmonui/core/styles.css'], budget: 4 * KB, external: [] },
  // Editors: measured + about 5 %.
  // The design proposals (3 KB, 6 / 9 KB) exclude the composed Button / Menu and the overlay, dismiss,
  // focus, roving and press primitives; these rows count the whole entry, so they are larger.
  { name: '@salmonui/editors/inline-edit', exports: ['@salmonui/editors/inline-edit'], budget: 7.5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/editors/inline-edit/styles.css', css: ['@salmonui/editors/inline-edit/styles.css'], budget: 3 * KB, external: [] },
  { name: '@salmonui/editors/markdown-editor', exports: ['@salmonui/editors/markdown-editor'], scope: 'initial', budget: 12.5 * KB, external: REACT },
  { name: '@salmonui/editors/markdown-editor, all chunks', exports: ['@salmonui/editors/markdown-editor'], budget: 20.5 * KB, external: REACT },
  { name: '@salmonui/editors/markdown-editor/styles.css', css: ['@salmonui/editors/markdown-editor/styles.css'], budget: 4 * KB, external: [] },
  // ImageEditor (budget: <= 12 KB initial, <= 35 KB all chunks, excluding
  // react and the composed Button / Toolbar / Menu families). Panels, annotations, drawing, frames and the
  // pixel fallback are lazy chunks.
  { name: '@salmonui/editors/image-editor (own code)', exports: ['@salmonui/editors/image-editor'], scope: 'initial', budget: 12 * KB, external: [...REACT, '@salmonui/buttons/button', '@salmonui/navigation/toolbar', '@salmonui/buttons/menu'] },
  { name: '@salmonui/editors/image-editor (own code), all chunks', exports: ['@salmonui/editors/image-editor'], budget: 35 * KB, external: [...REACT, '@salmonui/buttons/button', '@salmonui/navigation/toolbar', '@salmonui/buttons/menu'] },
  { name: '@salmonui/editors/image-editor/styles.css', css: ['@salmonui/editors/image-editor/styles.css'], budget: 6 * KB, external: [] },
  // Dropdowns: the search index, the remote adapter
  // and drag and drop are lazy chunks. Listbox measured 9.66 KB (2026-11-23); measured + 5 % exceeds the
  // 10 KB design cap, so the row stays at the cap. The stylesheet measured 1.39 KB.
  { name: '@salmonui/dropdowns/listbox', exports: ['@salmonui/dropdowns/listbox'], scope: 'initial', budget: 10 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/dropdowns/listbox/styles.css', css: ['@salmonui/dropdowns/listbox/styles.css'], budget: 1.5 * KB, external: [] },
  // Select and Combobox: measured + 5 % (10.77 / 12.04 KB), under the
  // 12 / 14 KB caps. Combobox all chunks measured 20.0 KB against the 18 KB cap: reported, not raised.
  { name: '@salmonui/dropdowns/select', exports: ['@salmonui/dropdowns/select'], scope: 'initial', budget: 11.5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/dropdowns/combobox', exports: ['@salmonui/dropdowns/combobox'], scope: 'initial', budget: 12.75 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/dropdowns/combobox, all chunks', exports: ['@salmonui/dropdowns/combobox'], budget: 21 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/dropdowns/select/styles.css', css: ['@salmonui/dropdowns/select/styles.css'], budget: 5 * KB, external: [] },
  { name: '@salmonui/dropdowns/combobox/styles.css', css: ['@salmonui/dropdowns/combobox/styles.css'], budget: 5 * KB, external: [] },
  // Inputs and Forms: @salmonui/data-grid/engine is counted where used.
  { name: '@salmonui/inputs/form', exports: ['@salmonui/inputs/form'], budget: 6 * KB, external: REACT },
  { name: '@salmonui/inputs/form/styles.css', css: ['@salmonui/inputs/form/styles.css'], budget: 1 * KB, external: [] },
  // useFormState: its own subpath, so the /form row does not carry it. Measured 0.79 KB (2026-11-26).
  { name: '@salmonui/inputs/form/state', exports: ['@salmonui/inputs/form/state'], budget: 0.85 * KB, external: REACT },
  { name: '@salmonui/inputs/text-field', exports: ['@salmonui/inputs/text-field'], budget: 3.5 * KB, external: [...CORE, ...REACT] },
  // Text suggestions: `useTextSuggest`, an explicit
  // composition with the controller imported statically (no loader in /text-field); measured 2.63 KB + ~5 % (3 KB proposal), CSS 0.48 KB + ~5 %.
  { name: '@salmonui/chat/text-suggest', exports: ['@salmonui/chat/text-suggest'], budget: 2.75 * KB, external: REACT },
  { name: '@salmonui/chat/text-suggest/styles.css', css: ['@salmonui/chat/text-suggest/styles.css'], budget: 0.5 * KB, external: [] },
  // Smart paste: the hook entry, no stylesheet; measured 1.74 KB + 5 % (2 KB proposal).
  { name: '@salmonui/chat/smart-paste', exports: ['@salmonui/chat/smart-paste'], budget: 1.85 * KB, external: REACT },
  { name: '@salmonui/inputs/text-field/styles.css', css: ['@salmonui/inputs/text-field/styles.css'], budget: 2 * KB, external: [] },
  { name: '@salmonui/inputs/masked-field', exports: ['@salmonui/inputs/masked-field'], budget: 5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/masked-field/styles.css', css: ['@salmonui/inputs/masked-field/styles.css'], budget: 1.5 * KB, external: [] },
  { name: '@salmonui/inputs/number-field', exports: ['@salmonui/inputs/number-field'], budget: 6 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/number-field/styles.css', css: ['@salmonui/inputs/number-field/styles.css'], budget: 1.5 * KB, external: [] },
  // FileUpload (caps 6 KB / 1.5 KB / 1.5 KB; the stylesheet includes field.css; plain styled buttons, no
  // /button). Measured 2026-11-24: 6.52 KB JS (over the 6 KB cap: reported, not raised), 1.49 KB CSS, xhr 0.71 KB.
  // file-upload: optimized, still over the 6 KB design cap (shared field primitive ~2.4 KB); measured 6.47 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/file-upload', exports: ['@salmonui/inputs/file-upload'], budget: 6.8 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/file-upload/styles.css', css: ['@salmonui/inputs/file-upload/styles.css'], budget: 1.5 * KB, external: [] },
  { name: '@salmonui/inputs/file-upload/xhr', exports: ['@salmonui/inputs/file-upload/xhr'], budget: 0.75 * KB, external: [...CORE, ...REACT] },
  // Choice fields: CSS rows are measured + ~5 % under the 1 KB cap
  // (field.css parts without the input group, plus toggle-input.css / choice-group.css). The JS rows sit at the
  // design caps and fail: the shared useField / controllable / form-reset primitives are most of each entry
  // (TextField measures 3.53 KB). Measured checkbox 4.10, radio-group 3.68, switch 3.34, rating 4.36,
  // otp-field 3.79 KB. Reported, not raised (the caps predate the shared field primitive).
  // checkbox: optimized, still over the 2 KB design cap (shared field primitive ~2.4 KB); measured 4.05 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/checkbox', exports: ['@salmonui/inputs/checkbox'], budget: 4.25 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/checkbox/styles.css', css: ['@salmonui/inputs/checkbox/styles.css'], budget: 1 * KB, external: [] },
  // radio-group: optimized, still over the 2 KB design cap (shared field primitive ~2.4 KB); measured 3.63 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/radio-group', exports: ['@salmonui/inputs/radio-group'], budget: 3.8 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/radio-group/styles.css', css: ['@salmonui/inputs/radio-group/styles.css'], budget: 0.85 * KB, external: [] },
  // switch: optimized, still over the 1.5 KB design cap (shared field primitive ~2.4 KB); measured 3.28 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/switch', exports: ['@salmonui/inputs/switch'], budget: 3.45 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/switch/styles.css', css: ['@salmonui/inputs/switch/styles.css'], budget: 0.96 * KB, external: [] },
  // rating: optimized, still over the 2.5 KB design cap (shared field primitive ~2.4 KB); measured 4.30 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/rating', exports: ['@salmonui/inputs/rating'], budget: 4.5 * KB, external: [...CORE, ...REACT] },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/inputs/rating/styles.css', css: ['@salmonui/inputs/rating/styles.css'], budget: 1098, external: [] },
  // otp-field: optimized, still over the 2.5 KB design cap (shared field primitive ~2.4 KB); measured 3.72 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/otp-field', exports: ['@salmonui/inputs/otp-field'], budget: 3.9 * KB, external: [...CORE, ...REACT] },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/inputs/otp-field/styles.css', css: ['@salmonui/inputs/otp-field/styles.css'], budget: 759, external: [] },
  // Pointer controls (caps: slider 5 KB / 1.5 KB, signature-pad 6 KB / 1 KB; CSS rows include
  // field.css). Measured 2026-11-24: slider 6.26 KB JS, 1.33 KB CSS; signature-pad 6.89 KB JS, 0.70 KB CSS. The JS
  // rows sit at the caps and fail (useField and the form bridge are about 3 KB of each): reported, not raised.
  // slider: optimized, still over the 5 KB design cap (shared field primitive ~2.4 KB); measured 6.40 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/slider', exports: ['@salmonui/inputs/slider'], budget: 6.7 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/slider/styles.css', css: ['@salmonui/inputs/slider/styles.css'], budget: 1.4 * KB, external: [] },
  // signature-pad: optimized, still over the 6 KB design cap (shared field primitive ~2.4 KB); measured 7.01 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/signature-pad', exports: ['@salmonui/inputs/signature-pad'], budget: 7.35 * KB, external: [...CORE, ...REACT] },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/inputs/signature-pad/styles.css', css: ['@salmonui/inputs/signature-pad/styles.css'], budget: 812, external: [] },
  // ColorPicker (caps 9 KB JS excluding Popover / 2 KB CSS including the shared field and input-group
  // parts). The popover (internal Overlay, no public Popover yet) is a lazy chunk, so the JS row counts the initial
  // chunks. Measured 2026-11-24: 11.16 KB JS initial (over the 9 KB cap: reported, not raised; popover chunk
  // 2.93 KB), 2.00 KB CSS.
  // color-picker: optimized, still over the 9 KB design cap (shared field primitive ~2.4 KB); measured 11.27 KB + ~5 % (2026-11-24).
  { name: '@salmonui/inputs/color-picker', exports: ['@salmonui/inputs/color-picker'], scope: 'initial', budget: 11.8 * KB, external: [...CORE, ...REACT] },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/inputs/color-picker/styles.css', css: ['@salmonui/inputs/color-picker/styles.css'], budget: 2165, external: [] },
  // Query Builder: the entry's own code. `without`
  // subtracts the composed families (Select, Combobox, Button, TextField, DateField, NumberField, Checkbox),
  // measured alone, from the entry bundled with them. Measured 9.27 KB / 0.55 KB own CSS rules / 1.33 KB toSql /
  // 1.98 KB mongo (2026-11-24) plus about 5 %, capped at the design caps (14 / 2.5 / 2.5 / 2 KB).
  {
    name: '@salmonui/query-builder (own code)',
    exports: ['@salmonui/query-builder'],
    without: QB_COMPOSED,
    // + tree picker (a lazy chunk: TreeFieldPicker, plus Vite's dynamic import helper): measured 10.60 KB + ~5 %, under the 14 KB cap.
    budget: 11.1 * KB,
    external: REACT,
  },
  // The stylesheet contains the composed families' stylesheets verbatim (isolation:check); its own rules are gated.
  {
    name: '@salmonui/query-builder/styles.css (own rules)',
    css: ['@salmonui/query-builder/styles.css'],
    without: ['select', 'combobox', 'tree-select', 'button', 'text-field', 'number-field', 'checkbox', 'date-picker'].map((e) => `import '${familyCss(e)}';`).join('\n'),
    budget: 0.75 * KB,
    external: [],
  },
  // /sql with fromSql is over the 2.5 KB design cap, which predates fromSql: measured 3.07 KB
  // + ~5 % (2026-11-24). toSql alone, what a server that only writes SQL ships, is gated below it.
  { name: '@salmonui/query-builder/sql', exports: ['@salmonui/query-builder/sql'], budget: 3.2 * KB, external: REACT },
  { name: "import { toSql } from '@salmonui/query-builder/sql'", source: "export { toSql } from '@salmonui/query-builder/sql';\n", budget: 1.5 * KB, external: REACT },
  { name: '@salmonui/query-builder/mongo', exports: ['@salmonui/query-builder/mongo'], budget: 2 * KB, external: REACT },
  // Speech To Text and Form Renderer: the entries' own code and
  // own CSS rules (`without` the composed families). Measured 2026-11-24 plus about 5 %, under the caps:
  // speech-to-text 1.42 KB JS / 0.12 KB CSS (caps 2 / 0.5 KB), form-renderer 1.50 KB / 0.15 KB (caps 8 / 1 KB).
  { name: '@salmonui/inputs/speech-to-text (own code)', exports: ['@salmonui/inputs/speech-to-text'], without: SPEECH_COMPOSED, budget: 1.5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/speech-to-text/styles.css (own rules)', css: ['@salmonui/inputs/speech-to-text/styles.css'], without: cssOf(['button']), budget: 0.13 * KB, external: [] },
  { name: '@salmonui/inputs/form-renderer (own code)', exports: ['@salmonui/inputs/form-renderer'], without: FORM_RENDERER_COMPOSED, budget: 1.57 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/inputs/form-renderer/styles.css (own rules)', css: ['@salmonui/inputs/form-renderer/styles.css'], without: cssOf(FORM_RENDERER_FAMILIES), budget: 0.16 * KB, external: [] },
  // TreeSelect: measured + 5 % (10.30 KB, CSS 2.28 KB) under the 12 KB cap; the tree popup and its keyboard are a lazy chunk.
  { name: '@salmonui/dropdowns/tree-select', exports: ['@salmonui/dropdowns/tree-select'], scope: 'initial', budget: 10.8 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/dropdowns/tree-select/styles.css', css: ['@salmonui/dropdowns/tree-select/styles.css'], budget: 2.4 * KB, external: [] },
  // Navigation: proposed budgets, initial JS and CSS per subpath.
  { name: '@salmonui/navigation/accordion', exports: ['@salmonui/navigation/accordion'], scope: 'initial', budget: 3 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/accordion/styles.css', css: ['@salmonui/navigation/accordion/styles.css'], budget: 1.5 * KB, external: [] },
  { name: '@salmonui/navigation/breadcrumbs', exports: ['@salmonui/navigation/breadcrumbs'], scope: 'initial', budget: 3 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/breadcrumbs/styles.css', css: ['@salmonui/navigation/breadcrumbs/styles.css'], budget: 1 * KB, external: [] },
  { name: '@salmonui/navigation/carousel', exports: ['@salmonui/navigation/carousel'], scope: 'initial', budget: 4 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/carousel/styles.css', css: ['@salmonui/navigation/carousel/styles.css'], budget: 2 * KB, external: [] },
  { name: '@salmonui/navigation/sidebar-layout', exports: ['@salmonui/navigation/sidebar-layout'], scope: 'initial', budget: 3.35 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/sidebar-layout/styles.css', css: ['@salmonui/navigation/sidebar-layout/styles.css'], budget: 1.5 * KB, external: [] },
  // SidebarMenu: measured 4.49 KB initial, rail popups chunk 2.54 KB (loaded once
  // collapsed), CSS 1.57 KB; each gated at the measured size plus about 5 % (2026-11-26).
  { name: '@salmonui/navigation/sidebar-menu', exports: ['@salmonui/navigation/sidebar-menu'], scope: 'initial', budget: 4.7 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/sidebar-menu rail chunk (lazy, collapsed)', source: `export * from '${root}packages/navigation/dist/sidebar-menu/rail.js';\n`, budget: 2.7 * KB, external: REACT },
  { name: '@salmonui/navigation/sidebar-menu/styles.css', css: ['@salmonui/navigation/sidebar-menu/styles.css'], budget: 1.65 * KB, external: [] },
  { name: '@salmonui/navigation/tabs', exports: ['@salmonui/navigation/tabs'], scope: 'initial', budget: 5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/tabs/styles.css', css: ['@salmonui/navigation/tabs/styles.css'], budget: 2 * KB, external: [] },
  { name: '@salmonui/navigation/toolbar', exports: ['@salmonui/navigation/toolbar'], scope: 'initial', budget: 4 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/toolbar/styles.css', css: ['@salmonui/navigation/toolbar/styles.css'], budget: 1.5 * KB, external: [] },
  // Multi-size stepping: the lazy
  // `toolbar/sizing` chunk the measuring runtime loads only once a ToolbarItem declares more than one size
  // (the overflow primitives are passed in, so the chunk is its own code). Measured 1.06 KB, gated at the
  // measured size plus about 5 % (2026-11-24); the /toolbar initial row above is unchanged.
  { name: '@salmonui/navigation/toolbar sizing chunk (lazy, multi-size items)', source: `export * from '${root}packages/navigation/dist/toolbar/sizing.js';\n`, budget: 1.12 * KB, external: REACT },
  { name: '@salmonui/navigation/tree-view', exports: ['@salmonui/navigation/tree-view'], scope: 'initial', budget: 12 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/tree-view/styles.css', css: ['@salmonui/navigation/tree-view/styles.css'], budget: 2.5 * KB, external: [] },
  { name: '@salmonui/navigation/stepper', exports: ['@salmonui/navigation/stepper'], scope: 'initial', budget: 2.5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/stepper/styles.css', css: ['@salmonui/navigation/stepper/styles.css'], budget: 1.5 * KB, external: [] },
  { name: '@salmonui/navigation/pager', exports: ['@salmonui/navigation/pager'], scope: 'initial', budget: 3.5 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/navigation/pager/styles.css', css: ['@salmonui/navigation/pager/styles.css'], budget: 1 * KB, external: [] },
  // Kanban: measured 13.18 KB first load
  // (20 KB cap; drag and drop and the editor are lazy, 4.21 KB together), 17.39 KB all chunks, CSS 2.40 KB
  // (3 KB cap), each gated at the measured size plus about 5 % (2026-11-24).
  { name: '@salmonui/kanban', exports: ['@salmonui/kanban'], scope: 'initial', budget: 13.9 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/kanban, all chunks', exports: ['@salmonui/kanban'], budget: 18.3 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/kanban/styles.css', css: ['@salmonui/kanban/styles.css'], budget: 2.55 * KB, external: [] },
  {
    name: 'Full Data Grid app (local data)',
    exports: ['@salmonui/data-grid/engine', '@salmonui/data/local', '@salmonui/data-grid'],
    css: ['@salmonui/core/styles.css', '@salmonui/data-grid/styles.css'],
    scope: 'initial',
    budget: 165 * KB,
    external: REACT,
  },
  {
    // Every lazy feature chunk too (editing, overlays, export, print): the cost of a grid with every feature on.
    // 254 -> 283 KB (2026-11-24, tree mode: optimize-first rule, measured 269.40 KB + 5 %).
    name: 'Full Data Grid app (local data), all chunks',
    exports: ['@salmonui/data-grid/engine', '@salmonui/data/local', '@salmonui/data-grid'],
    css: ['@salmonui/core/styles.css', '@salmonui/data-grid/styles.css'],
    budget: 283 * KB,
    external: REACT,
  },
  {
    // `<DataGrid data columns />` without optional feature props: what every grid pays.
    name: 'Minimal Data Grid app (no optional features)',
    source: "import '@salmonui/core/styles.css';\nimport '@salmonui/data-grid/styles.css';\nexport { DataGrid } from '@salmonui/data-grid';\n",
    scope: 'initial',
    featureSplit: true,
    budget: 110 * KB,
    external: REACT,
  },
  // Calendars: each row counts the
  // internal date module and the overlay code it pulls in.
  { name: '@salmonui/calendars/calendar', exports: ['@salmonui/calendars/calendar'], budget: 8 * KB, external: REACT },
  // Pickers (2026-11-24): the popup is a lazy chunk, so the first-load rows gate
  // what a page pays before opening; the all-chunks rows were set to the measured size plus about 5 % per the
  // optimize-first rule (optimize first, then measured + 5 %).
  { name: '@salmonui/calendars/date-picker', exports: ['@salmonui/calendars/date-picker'], scope: 'initial', budget: 14 * KB, external: REACT },
  { name: '@salmonui/calendars/date-picker, all chunks', exports: ['@salmonui/calendars/date-picker'], budget: 25 * KB, external: REACT },
  // the opt-in Data Grid editor over the date-picker entry it wraps.
  { name: '@salmonui/calendars/date-picker/data-grid (over date-picker)', over: ['@salmonui/calendars/date-picker'], exports: ['@salmonui/calendars/date-picker/data-grid'], budget: 0.6 * KB, external: REACT },
  { name: '@salmonui/calendars/date-range-picker', exports: ['@salmonui/calendars/date-range-picker'], scope: 'initial', budget: 17 * KB, external: REACT },
  { name: '@salmonui/calendars/date-range-picker, all chunks', exports: ['@salmonui/calendars/date-range-picker'], budget: 23.5 * KB, external: REACT },
  { name: '@salmonui/calendars/time-picker', exports: ['@salmonui/calendars/time-picker'], scope: 'initial', budget: 13.1 * KB, external: REACT },
  { name: '@salmonui/calendars/time-picker, all chunks', exports: ['@salmonui/calendars/time-picker'], budget: 17.5 * KB, external: REACT },
  { name: 'Calendars together (calendar, date-picker, date-range-picker, time-picker)', exports: ['@salmonui/calendars/calendar', '@salmonui/calendars/date-picker', '@salmonui/calendars/date-range-picker', '@salmonui/calendars/time-picker'], budget: 33 * KB, external: REACT },
  // `shareOf`: the gzip bytes the private imports add to the entry (the entry measured with and without them external).
  ...['calendar', 'date-picker', 'date-range-picker', 'time-picker'].map((e) => ({ name: `#dates share of ${familyEntry(e)}`, exports: [familyEntry(e)], shareOf: ['@salmonui/core/dates', '@salmonui/core/internal/dates'], budget: e === 'calendar' ? 4 * KB : e === 'time-picker' ? 4.35 * KB : 5.65 * KB, external: REACT })),
  { name: '@salmonui/calendars/calendar/styles.css', css: ['@salmonui/calendars/calendar/styles.css'], budget: 5 * KB, external: [] },
  { name: '@salmonui/calendars/date-picker/styles.css', css: ['@salmonui/calendars/date-picker/styles.css'], budget: 5 * KB, external: [] },
  { name: '@salmonui/calendars/date-range-picker/styles.css', css: ['@salmonui/calendars/date-range-picker/styles.css'], budget: 5 * KB, external: [] },
  { name: '@salmonui/calendars/time-picker/styles.css', css: ['@salmonui/calendars/time-picker/styles.css'], budget: 5 * KB, external: [] },
  // Scheduler: measured plus about 5 %; the
  // whole entry at the 60 KB budget. The editor dialog and the header calendar are lazy chunks.
  { name: '@salmonui/scheduler', exports: ['@salmonui/scheduler'], scope: 'initial', budget: 60 * KB, external: [...CORE, ...REACT] },
  // All chunks and the stylesheet re-set 2026-11-24 after the interaction features (drag, context menu, tooltip, print, keyboard, clipboard, adaptive,
  // the public Dialog core and Popover in scheduler.css): measured 115.97 KB / 8.91 KB after optimizing, plus about 5 %.
  { name: '@salmonui/scheduler, all chunks', exports: ['@salmonui/scheduler'], budget: 122 * KB, external: [...CORE, ...REACT] },
  { name: "import { Scheduler } from '@salmonui/scheduler'", source: "export { Scheduler } from '@salmonui/scheduler';\n", scope: 'initial', budget: 36.5 * KB, external: [...CORE, ...REACT] },
  { name: "import { RecurrenceEditor } from '@salmonui/scheduler'", source: "export { RecurrenceEditor } from '@salmonui/scheduler';\n", scope: 'initial', budget: 32 * KB, external: [...CORE, ...REACT] },
  { name: '@salmonui/scheduler/styles.css', css: ['@salmonui/scheduler/styles.css'], budget: 9.35 * KB, external: [] },
  // Gantt: the entry over the Data Grid renderer it
  // composes (`baseline`: `<DataGrid>` alone is subtracted; the tree feature and the editing chunks load on demand
  // and keep their own Data Grid rows); the stylesheet row excludes the Data Grid stylesheet it carries verbatim.
  { name: '@salmonui/gantt', exports: ['@salmonui/gantt'], scope: 'initial', budget: 45.6 * KB, external: [...CORE, ...DATA, ...REACT], baseline: PIVOT_BASELINE },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/gantt/styles.css', css: ['@salmonui/gantt/styles.css'], budget: 2422, external: [], baseline: { css: ['@salmonui/data-grid/styles.css', '@salmonui/layout/splitter/styles.css', '@salmonui/overlays/dialog/styles.css', '@salmonui/calendars/date-picker/styles.css', '@salmonui/buttons/menu/styles.css'] } },
  // Buttons: `/button` never reaches menu, overlay,
  // positioning or Data Grid code (`forbid`, matched against bundled module ids).
  { name: '@salmonui/buttons/button', exports: ['@salmonui/buttons/button'], budget: 3.5 * KB, external: REACT, forbid: BUTTON_FORBIDDEN },
  { name: "import { Button } from '@salmonui/buttons/button'", source: "export { Button } from '@salmonui/buttons/button';\n", budget: 1.55 * KB, external: REACT, forbid: BUTTON_FORBIDDEN },
  { name: '@salmonui/buttons/button/styles.css', css: ['@salmonui/buttons/button/styles.css'], budget: 2.25 * KB, external: [] },
  // TagGroup: input chips; the pointer drag is a lazy chunk.
  // Measured 2026-11-24: 3.93 KB initial (incl. the Vite preload helper), 5.09 KB all chunks, 1.15 KB CSS; gates + about 5 %.
  { name: '@salmonui/buttons/tag-group', exports: ['@salmonui/buttons/tag-group'], scope: 'initial', budget: 4.15 * KB, external: REACT, forbid: BUTTON_FORBIDDEN },
  { name: '@salmonui/buttons/tag-group, all chunks', exports: ['@salmonui/buttons/tag-group'], budget: 5.35 * KB, external: REACT, forbid: BUTTON_FORBIDDEN },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/buttons/tag-group/styles.css', css: ['@salmonui/buttons/tag-group/styles.css'], budget: 1347, external: [] },
  // Pivot engine: the whole engine entry (the formula
  // parser included, since compute is synchronous) and the formula parser alone (`./pivot/formula`, what a
  // calculated field editor loads to validate formulas).
  { name: 'Pivot engine (@salmonui/pivot-table/engine)', exports: ['@salmonui/pivot-table/engine'], budget: 20 * KB, external: [] },
  { name: 'Pivot formula parser (@salmonui/pivot-table/engine/formula)', exports: ['@salmonui/pivot-table/engine/formula'], budget: 4 * KB, external: [] },
  // Pivot Table: the subpath rows exclude the Data Grid engine and the Data Grid
  // renderer it shares (`baseline`: the same measurement of `<DataGrid>` alone is subtracted); the stylesheet row
  // excludes the Data Grid, Button and Menu stylesheets it carries verbatim (component independence).
  { name: '@salmonui/pivot-table', exports: ['@salmonui/pivot-table'], scope: 'initial', budget: 25 * KB, external: [...CORE, ...DATA, ...REACT], baseline: PIVOT_BASELINE },
  { name: '@salmonui/pivot-table, all chunks', exports: ['@salmonui/pivot-table'], budget: 60 * KB, external: [...CORE, ...DATA, ...REACT], baseline: PIVOT_BASELINE },
  // `PivotChart` entry: routing and adapters; Chart and PieChart are lazy chunks with their own rows.
  { name: '@salmonui/pivot-table/chart', exports: ['@salmonui/pivot-table/chart'], scope: 'initial', budget: 3.6 * KB, external: [...CORE, ...DATA, ...REACT] },
  { name: '@salmonui/pivot-table/styles.css', css: ['@salmonui/pivot-table/styles.css'], budget: 8 * KB, external: [], baseline: { css: ['@salmonui/data-grid/styles.css', '@salmonui/buttons/button/styles.css', '@salmonui/buttons/menu/styles.css'] } },
  {
    // `<PivotTable data pivotModel />`: engine, Data Grid renderer, pivot parts and CSS.
    name: 'Minimal PivotTable app',
    source: "import '@salmonui/core/styles.css';\nimport '@salmonui/pivot-table/styles.css';\nexport { PivotTable } from '@salmonui/pivot-table';\n",
    scope: 'initial',
    budget: 150 * KB,
    external: REACT,
  },
  // Data Visualization: each row counts the `#viz` and
  // `internal/viz/` code its entry pulls in; budgets are the measured size plus about 5 % (2026-11-24),
  // never above the proposal. `/sparkline` never reaches internal/viz, the axis code or another family.
  // Measured: sparkline 3.73 / 5.03 (tooltip chunk 1.30) / CSS 0.49; pie-chart 13.08 / CSS 1.91;
  // heat-map 14.69, lazy canvas 0.97 + instance export 2.16 / CSS 1.82; tree-map 11.74 / CSS 1.97;
  // sankey-chart 11.27 / CSS 1.76. The tree-map and sankey-chart stylesheets exceed the 1.5 KB proposal
  // because every visualization stylesheet carries the shared viz.css (about 1.6 KB of it): reported,
  // gated at measured + 5 %.
  { name: '@salmonui/charts/sparkline', exports: ['@salmonui/charts/sparkline'], scope: 'initial', budget: 3.92 * KB, external: REACT, forbid: SPARKLINE_FORBIDDEN },
  { name: '@salmonui/charts/sparkline, all chunks', exports: ['@salmonui/charts/sparkline'], budget: 5.28 * KB, external: REACT, forbid: SPARKLINE_FORBIDDEN },
  { name: '@salmonui/charts/sparkline/styles.css', css: ['@salmonui/charts/sparkline/styles.css'], budget: 0.52 * KB, external: [] },
  // Opt-in entries of the cross-family visualization features,
  // measured 2026-11-24, budgets measured + about 5 %: the Sparkline canvas mark layer (0.68 KB, a
  // separate entry so `/sparkline` carries no loader for it), the shared transitions stylesheet (0.36 KB) and the RTL mirroring of the drawn titles and legends (0.29 KB), both kept out of the
  // family stylesheets, whose budgets have no room for them.
  { name: '@salmonui/charts/sparkline/canvas', exports: ['@salmonui/charts/sparkline/canvas'], budget: 0.72 * KB, external: REACT, forbid: SPARKLINE_FORBIDDEN },
  { name: '@salmonui/charts/viz-animations.css', css: ['@salmonui/charts/viz-animations.css'], budget: 0.38 * KB, external: [] },
  { name: '@salmonui/charts/viz-rtl.css', css: ['@salmonui/charts/viz-rtl.css'], budget: 0.3 * KB, external: [] },
  { name: '@salmonui/charts/pie-chart', exports: ['@salmonui/charts/pie-chart'], scope: 'initial', budget: 13.73 * KB, external: REACT, forbid: vizForbidden('pie-chart') },
  { name: '@salmonui/charts/pie-chart/styles.css', css: ['@salmonui/charts/pie-chart/styles.css'], budget: 2 * KB, external: [] },
  { name: '@salmonui/charts/heat-map', exports: ['@salmonui/charts/heat-map'], scope: 'initial', budget: 15.42 * KB, external: REACT, forbid: vizForbidden('heat-map') },
  { name: '@salmonui/charts/heat-map, all chunks', exports: ['@salmonui/charts/heat-map'], budget: 18.7 * KB, external: REACT, forbid: vizForbidden('heat-map') },
  { name: '@salmonui/charts/heat-map/styles.css', css: ['@salmonui/charts/heat-map/styles.css'], budget: 1.91 * KB, external: [] },
  { name: '@salmonui/charts/tree-map', exports: ['@salmonui/charts/tree-map'], scope: 'initial', budget: 12 * KB, external: REACT, forbid: vizForbidden('tree-map') },
  { name: '@salmonui/charts/tree-map/styles.css', css: ['@salmonui/charts/tree-map/styles.css'], budget: 2.07 * KB, external: [] },
  { name: '@salmonui/charts/sankey-chart', exports: ['@salmonui/charts/sankey-chart'], scope: 'initial', budget: 11.83 * KB, external: REACT, forbid: vizForbidden('sankey-chart') },
  { name: '@salmonui/charts/sankey-chart/styles.css', css: ['@salmonui/charts/sankey-chart/styles.css'], budget: 1.85 * KB, external: [] },
  // Data Visualization, Barcode: every symbology, QRCode alone
  // (tree-shaken from the 1D and Data Matrix encoders) and the stylesheet. Export is a lazy chunk.
  { name: '@salmonui/charts/barcode', exports: ['@salmonui/charts/barcode'], budget: 15.5 * KB, external: REACT, forbid: [/\/dist\/viz\//, /data-grid/, /encode\/(pdf417|databar|dotcode)/, /barcode\/rows/] },
  { name: "import { QRCode } from '@salmonui/charts/barcode'", source: "export { QRCode } from '@salmonui/charts/barcode';\n", scope: 'initial', budget: 6 * KB, external: REACT, forbid: [/encode\/(linear|datamatrix|pdf417|databar|dotcode)/] },
  // PDF417, GS1 DataBar and DotCode are subpaths of their own, so
  // `/barcode` never carries their encoders and each one never carries the others or the 1D / Data Matrix code.
  { name: '@salmonui/charts/barcode/pdf417', exports: ['@salmonui/charts/barcode/pdf417'], budget: 9.1 * KB, external: REACT, forbid: [/\/dist\/viz\//, /data-grid/, /encode\/(linear|datamatrix|qr|databar|dotcode|index)/] },
  { name: '@salmonui/charts/barcode/gs1-databar', exports: ['@salmonui/charts/barcode/gs1-databar'], budget: 10 * KB, external: REACT, forbid: [/\/dist\/viz\//, /data-grid/, /encode\/(datamatrix|qr|pdf417|dotcode|index)/] },
  { name: '@salmonui/charts/barcode/dotcode', exports: ['@salmonui/charts/barcode/dotcode'], budget: 8.6 * KB, external: REACT, forbid: [/\/dist\/viz\//, /data-grid/, /encode\/(datamatrix|qr|pdf417|databar|index)/, /barcode\/rows/] },
  { name: '@salmonui/charts/barcode/styles.css', css: ['@salmonui/charts/barcode/styles.css'], budget: 0.25 * KB, external: [] },
  // Data Visualization, Gauge: the #viz and internal/viz code it pulls
  // in is counted; export and print are a lazy chunk. The stylesheet carries the shared styles/viz.css.
  { name: '@salmonui/charts/gauge', exports: ['@salmonui/charts/gauge'], scope: 'initial', budget: 13.2 * KB, external: REACT, forbid: [/data-grid/, /\/dist\/barcode/] },
  { name: '@salmonui/charts/gauge/styles.css', css: ['@salmonui/charts/gauge/styles.css'], budget: 1.95 * KB, external: [] },
  // The pointer transition: a lazy chunk loaded after commit. Measured 0.44 KB (2026-11-24): + 5 %.
  { name: 'gauge pointer transition chunk (gauge/animate.js)', source: `export { animatePointers } from '${root}packages/charts/dist/gauge/animate.js';\n`, budget: 0.47 * KB, external: REACT },
  // Notifications: the proposed absolute budgets.
  // Spinner measured 0.55 KB JS / 0.53 KB CSS (2026-11-24) against the 0.4 / 0.5 KB proposals (the
  // children wrapper, overlay and label cost ~0.15 KB) and Badge 0.57 KB against 0.5 KB (about 0.22 KB is the
  // namespace wrapper of the export probe): both rows are measured + 5 %, reported, not raised further.
  ...[
    ['message', 0.75, 1.5],
    ['badge', 0.6, 1],
    ['toast', 4, 2],
    ['progress', 1.25, 1.5],
    ['spinner', 0.58, 0.56],
    ['skeleton', 0.5, 0.75],
  ].flatMap(([name, js, css]) => [
    { name: familyEntry(name), exports: [familyEntry(name)], budget: js * KB, external: REACT, forbid: BUTTON_FORBIDDEN },
    { name: familyCss(name), css: [familyCss(name)], budget: css * KB, external: [] },
  ]),
  // Data Visualization, GeoMap: the tile layer is a lazy chunk mounted after
  // hydration; clustering is static (the server renders clustered markers). Measured 15.70 KB initial and
  // 18.34 KB with the tile and export chunks (2026-11-24): measured + 5 %, under the 22 KB design budget. With marker
  // drag, spider clusters, pinch and selection zoom and legend positions: 16.45 / 18.96 KB (the tile chunk no longer
  // shares a split chunk with the entry, which saved 0.47 / 0.58 KB).
  { name: '@salmonui/charts/geo-map', exports: ['@salmonui/charts/geo-map'], scope: 'initial', budget: 16.5 * KB, external: REACT, forbid: [/data-grid/] },
  { name: '@salmonui/charts/geo-map, all chunks', exports: ['@salmonui/charts/geo-map'], budget: 19.25 * KB, external: REACT },
  // Cascade layers (2026-11-26): measured with layers + 5 %.
  { name: '@salmonui/charts/geo-map/styles.css', css: ['@salmonui/charts/geo-map/styles.css'], budget: 2488, external: [] },
  // Data Visualization, Chart:
  // each row includes the #viz and internal/viz code the entry pulls in; no
  // visualization entry reaches Data Grid code.
  { name: '@salmonui/charts/chart', exports: ['@salmonui/charts/chart'], scope: 'initial', budget: 35 * KB, external: [...CORE, ...REACT, '@salmonui/navigation/toolbar', '@salmonui/buttons/button'], forbid: VIZ_FORBIDDEN },
  // Every lazy chunk (export and print, canvas, zoom / pan / selection / point drag, polar layout, zoom toolbar
  // wrapper; the Toolbar and Button entries external): the proposal sums to 21 KB of chunks. Measured 42.44 (+5 %).
  { name: '@salmonui/charts/chart, all chunks', exports: ['@salmonui/charts/chart'], budget: 44.5 * KB, external: [...CORE, ...REACT, '@salmonui/navigation/toolbar', '@salmonui/buttons/button'], forbid: VIZ_FORBIDDEN },
  // /chart with the preload entry: the polar layout and the interaction controller in the initial JS.
  // Measured 38.30 (+5 %).
  { name: '@salmonui/charts/chart + /chart/features', exports: ['@salmonui/charts/chart', '@salmonui/charts/chart/features'], scope: 'initial', budget: 40.2 * KB, external: [...CORE, ...REACT, '@salmonui/navigation/toolbar', '@salmonui/buttons/button'], forbid: VIZ_FORBIDDEN },
  // Technical indicators: the opt-in `technicalIndicators` feature on #viz indicators.ts, its own entry
  // so neither /chart row carries it. Measured 2.13 KB (2026-11-24): + 5 %.
  // Combined export of several visualizations for chart pages: its own entry, out of the /chart rows.
  // Measured 2.75 KB with its lazy export chunk (2026-11-24): + 5 %.
  { name: '@salmonui/charts/chart/export', exports: ['@salmonui/charts/chart/export'], budget: 2.9 * KB, external: REACT, forbid: VIZ_FORBIDDEN },
  { name: '@salmonui/charts/chart/indicators', exports: ['@salmonui/charts/chart/indicators'], budget: 2.25 * KB, external: REACT, forbid: VIZ_FORBIDDEN },
  { name: '@salmonui/charts/chart/styles.css', css: ['@salmonui/charts/chart/styles.css'], budget: 4 * KB, external: [] },
  // BulletChart (2026-11-24): its own chart-family subpath over the
  // public /chart entry (exact specifier external, like the stock-chart own-code row; `!` keeps /chart/bullet
  // itself bundled). Measured 2.39 KB (2026-11-24; the point-text formatter and field reader are counted here
  // although an application shares them with /chart) plus about 5 %.
  { name: '@salmonui/charts/chart/bullet (own code)', exports: ['@salmonui/charts/chart/bullet'], budget: 2.5 * KB, external: [...CORE, ...REACT, '@salmonui/charts/chart!'], forbid: VIZ_FORBIDDEN },
  { name: '@salmonui/charts/range-selector', exports: ['@salmonui/charts/range-selector'], budget: 14 * KB, external: [...CORE, ...REACT, '@salmonui/buttons/button'], forbid: VIZ_FORBIDDEN },
  { name: '@salmonui/charts/range-selector/styles.css', css: ['@salmonui/charts/range-selector/styles.css'], budget: 2 * KB, external: [] },
  {
    name: '@salmonui/charts/stock-chart (own code)',
    exports: ['@salmonui/charts/stock-chart'],
    budget: 6 * KB,
    external: [...CORE, ...REACT, '@salmonui/charts/chart', '@salmonui/charts/range-selector', '@salmonui/buttons/menu', '@salmonui/buttons/button', '@salmonui/navigation/toolbar', '@salmonui/calendars/date-range-picker'],
    forbid: VIZ_FORBIDDEN,
  },
  { name: '@salmonui/charts/stock-chart/styles.css', css: ['@salmonui/charts/stock-chart/styles.css'], budget: 1 * KB, external: [] },
  // Layout.
  { name: '@salmonui/overlays/popover', exports: ['@salmonui/overlays/popover'], budget: 4.5 * KB, external: REACT },
  { name: '@salmonui/overlays/popover/styles.css', css: ['@salmonui/overlays/popover/styles.css'], budget: 1 * KB, external: [] },
  { name: '@salmonui/overlays/dialog (initial)', exports: ['@salmonui/overlays/dialog'], scope: 'initial', budget: 4.6 * KB, external: [...REACT, familyEntry('button')] },
  // The drag and resize chunk (≤ 3 KB) is lazy: initial 4 KB plus the chunk.
  // AlertDialog composes Button (its own family, measured by the /button rows), so the
  // dialog rows keep `@salmonui/buttons/button` external like react.
  { name: '@salmonui/overlays/dialog, all chunks', exports: ['@salmonui/overlays/dialog'], budget: 7 * KB, external: [...REACT, familyEntry('button')] },
  { name: '@salmonui/overlays/dialog/styles.css', css: ['@salmonui/overlays/dialog/styles.css'], budget: 3.1 * KB, external: [] },
  // Drawer (no proposed budget; not part of sidebar-layout): the dialog core
  // plus the edge panel, set at about measured + 5 %.
  { name: '@salmonui/overlays/drawer', exports: ['@salmonui/overlays/drawer'], scope: 'initial', budget: 3.1 * KB, external: REACT },
  // The drawer stylesheet carries the dialog core and the edge panel rules.
  { name: '@salmonui/overlays/drawer/styles.css', css: ['@salmonui/overlays/drawer/styles.css'], budget: 1.6 * KB, external: [] },
  { name: '@salmonui/overlays/tooltip', exports: ['@salmonui/overlays/tooltip'], budget: 4 * KB, external: REACT },
  { name: '@salmonui/overlays/tooltip/styles.css', css: ['@salmonui/overlays/tooltip/styles.css'], budget: 1 * KB, external: [] },
  { name: '@salmonui/layout/splitter', exports: ['@salmonui/layout/splitter'], budget: 3.5 * KB, external: REACT },
  { name: '@salmonui/layout/splitter/styles.css', css: ['@salmonui/layout/splitter/styles.css'], budget: 1 * KB, external: [] },
  { name: '@salmonui/layout/card', exports: ['@salmonui/layout/card'], budget: 0.65 * KB, external: REACT },
  { name: '@salmonui/layout/card/styles.css', css: ['@salmonui/layout/card/styles.css'], budget: 1 * KB, external: [] },
  { name: '@salmonui/layout/avatar', exports: ['@salmonui/layout/avatar'], budget: 1 * KB, external: REACT },
  { name: '@salmonui/layout/avatar/styles.css', css: ['@salmonui/layout/avatar/styles.css'], budget: 1 * KB, external: [] },
  { name: '@salmonui/layout/timeline', exports: ['@salmonui/layout/timeline'], budget: 0.75 * KB, external: REACT },
  { name: '@salmonui/layout/timeline/styles.css', css: ['@salmonui/layout/timeline/styles.css'], budget: 1.5 * KB, external: [] },
  { name: '@salmonui/layout/dashboard-layout', exports: ['@salmonui/layout/dashboard-layout'], budget: 9 * KB, external: REACT },
  { name: '@salmonui/layout/dashboard-layout/styles.css', css: ['@salmonui/layout/dashboard-layout/styles.css'], budget: 1.5 * KB, external: [] },
  { name: '@salmonui/layout/list', exports: ['@salmonui/layout/list'], budget: 0.32 * KB, external: REACT },
  { name: '@salmonui/layout/list/styles.css', css: ['@salmonui/layout/list/styles.css'], budget: 0.75 * KB, external: [] },
  { name: '@salmonui/export/xlsx (own code)', exports: ['@salmonui/export/xlsx'], budget: 15 * KB, external: 'third-party' },
  { name: '@salmonui/export/pdf (own code)', exports: ['@salmonui/export/pdf'], budget: 15 * KB, external: 'third-party' },
  // Pivot export entry: the XLSX and PDF writers load on first use and are gated by the rows above.
  { name: '@salmonui/export/pivot (own code)', exports: ['@salmonui/export/pivot'], scope: 'initial', budget: 6 * KB, external: 'third-party' },
  // iCalendar writer and parser for the Scheduler: measured 3.97 KB plus about 5 %.
  { name: '@salmonui/export/ics', exports: ['@salmonui/export/ics'], budget: 4.2 * KB, external: 'third-party' },
  // Gantt PDF writer: vector chart drawing over the PDF writer's text and font helpers (static, tree-shaken),
  // with the embedded-font chunk loaded on demand and counted. Measured 11.24 KB (6.05 KB initial) plus about 5 %.
  { name: '@salmonui/export/gantt (own code)', exports: ['@salmonui/export/gantt'], budget: 11.8 * KB, external: 'third-party' },
  // Vector graphics PDF writer for visualizations: SVG markup parsed without a DOM into PDF path and text
  // operators over the PDF writer's text and font helpers, the embedded-font chunk counted (5.18 KB, as for /gantt). Measured 14.10 KB (8.91 KB initial) plus about 5 %.
  { name: '@salmonui/export/graphics (own code)', exports: ['@salmonui/export/graphics'], budget: 14.8 * KB, external: 'third-party' },
  // Rich text: own code of @salmonui/rich-text, with the composed
  // packages external like the stock-chart (own code) row (they are shared entries with their
  // own rows), and ProseMirror, Yjs and React external. The initial row gates the 40 KB budget; the
  // all-chunks row (the lazy engine glue, dialogs, BlockEditor menus) is measured + about 5 %.
  // ProseMirror and Yjs are measured and reported by the report rows, not gated.
  { name: '@salmonui/rich-text own code', exports: ['@salmonui/rich-text'], scope: 'initial', budget: 40 * KB, external: RICH_TEXT_EXTERNAL },
  { name: '@salmonui/rich-text own code, all chunks', exports: ['@salmonui/rich-text'], budget: 70.5 * KB, external: RICH_TEXT_EXTERNAL },
  // /collab: its own row, set at measurement: 1.52 KB measured (2026-11-24) + 5 %.
  { name: '@salmonui/rich-text/collab own code', exports: ['@salmonui/rich-text/collab'], scope: 'initial', budget: 1.6 * KB, external: RICH_TEXT_EXTERNAL },
  { name: '@salmonui/rich-text with ProseMirror (reported)', exports: ['@salmonui/rich-text'], report: true, budget: Infinity, external: REACT },
  { name: '@salmonui/rich-text/collab with Yjs (reported)', exports: ['@salmonui/rich-text/collab'], report: true, budget: Infinity, external: REACT },
  { name: '@salmonui/rich-text/styles.css (reported)', css: ['@salmonui/rich-text/styles.css'], report: true, budget: Infinity, external: [] },
  // PDF viewer: own code of @salmonui/pdf-viewer (the shell, the
  // lazy engine glue and the worker entry), with React, the composed packages (not core) and
  // pdf.js external. pdf.js and its worker are measured and reported, not gated.
  { name: '@salmonui/pdf-viewer own code, initial', exports: ['@salmonui/pdf-viewer'], scope: 'initial', budget: PDF_VIEWER_INITIAL, external: PDF_VIEWER_EXTERNAL },
  { name: '@salmonui/pdf-viewer own code, all chunks', exports: ['@salmonui/pdf-viewer'], budget: 30 * KB, external: PDF_VIEWER_EXTERNAL },
  { name: '@salmonui/pdf-viewer/styles.css', css: ['@salmonui/pdf-viewer/styles.css'], budget: PDF_VIEWER_CSS, external: [] },
  { name: 'pdfjs-dist engine (reported)', exports: ['pdfjs-dist'], report: true, budget: Infinity, external: [] },
  { name: 'pdfjs-dist worker (reported)', exports: ['pdfjs-dist/build/pdf.worker.min.mjs'], report: true, budget: Infinity, external: [] },
];

const cacheDir = join(root, 'node_modules/.cache/salmon-bundle-size');

/** A render feature conversion clears `pending` on its rows below. */
const REACT_DIST = 'packages/data-grid/dist/data-grid/';
const CORE_DIST = 'packages/data-grid/dist/engine/';
const FORBIDDEN_IN_MINIMAL = [
  { module: `${REACT_DIST}features/feature-*` },
  { module: `${REACT_DIST}Pager.js` },
  { module: `${REACT_DIST}url-paging.js` },
  { module: `${REACT_DIST}paging-ui.js` },
  { module: `${CORE_DIST}paging.js` },
  { module: `${REACT_DIST}Group.js` },
  { module: `${REACT_DIST}group-config.js` },
  { module: `${REACT_DIST}aggregate-config.js` },
  { module: `${REACT_DIST}aggregate-rows.js` },
  { module: `${CORE_DIST}grouping.js` },
  { module: `${CORE_DIST}aggregates.js` },
  { module: `${CORE_DIST}group-tree.js` },
  { module: `${REACT_DIST}detail.js` },
  { module: `${REACT_DIST}detail-config.js` },
  { module: `${CORE_DIST}detail-view.js` },
  { module: `${CORE_DIST}hierarchy.js` },
  ...['tree.js', 'tree-index.js', 'tree-view.js', 'tree-cascade.js'].map((f) => ({ module: `${CORE_DIST}${f}` })),
  { module: `${REACT_DIST}Toolbar.js` },
  { module: `${REACT_DIST}Search.js` },
  { module: `${REACT_DIST}toolbar-edit-state.js` },
  { module: `${REACT_DIST}search-ui.js` },
  { module: `${REACT_DIST}search-highlight.js` },
  { module: `${CORE_DIST}search.js` },
  { module: `${REACT_DIST}span-resolver.js` },
  { module: `${REACT_DIST}span-plans.js` },
  ...['editing/edit-host.js', 'editing/edit-view.js', 'row-drag.js', 'deferred-module.js'].map((f) => ({ module: `${REACT_DIST}${f}` })),
  ...['edit-state.js', 'row-drag-state.js'].map((f) => ({ module: `${CORE_DIST}${f}` })),
  { module: `${REACT_DIST}row-pinning.js` },
  { module: `${CORE_DIST}row-pinning.js` },
  { module: `${REACT_DIST}lookup-ui.js` },
  { module: `${CORE_DIST}lookup.js` },
  { module: `${REACT_DIST}persist-state.js` },
  { module: `${CORE_DIST}persistence-binding.js` },
  { module: `${REACT_DIST}Adaptive.js` },
  { module: `${REACT_DIST}adaptive-controller.js` },
  { module: `${REACT_DIST}infinite-ui.js` },
  { module: `${REACT_DIST}output-impl.js` },
  // The menu item actions run only from an open menu (overlays chunk).
  { module: `${REACT_DIST}menu-action.js` },
  { module: `${REACT_DIST}print-document.js` },
  // Tree mode: the tree feature's UI; the public toggle part (tree-toggle.js) is a static export of its own.
  ...['tree-ui.js', 'tree-toggle.js', 'tree-remote-chunk.js', 'tree-client-chunk.js', 'tree-skeleton.js'].map((f) => ({ module: `${REACT_DIST}${f}` })),
  ...['tree-remote.js', 'tree-remote-binder.js', 'tree-copy.js'].map((f) => ({ module: `${CORE_DIST}${f}` })),
];

/** Render feature closure budgets. */
const FEATURE_CLOSURES = [
  { name: 'grouping', budget: 15 * KB },
  { name: 'aggregates', budget: 6.25 * KB },
  { name: 'detail', budget: 9.5 * KB },
  { name: 'editing', budget: 6.5 * KB },
  { name: 'persistState', budget: 3 * KB },
  { name: 'search', budget: 3 * KB },
  { name: 'paging', budget: 4 * KB },
  { name: 'spans', budget: 3.5 * KB },
  { name: 'rowDrag', budget: 3 * KB },
  { name: 'adaptive', budget: 2.75 * KB },
  { name: 'lookup', budget: 2.25 * KB },
  { name: 'rowPinning', budget: 2 * KB },
  { name: 'infiniteScroll', budget: 2.25 * KB },
  { name: 'toolbar', budget: 3 * KB },
  // Tree mode. 5 -> 19.25 KB (2026-11-24, tree mode: optimize-first
  // rule, measured 18.29 KB + 5 %): the closure includes the core ./tree entry, not only the React UI.
  // 19.25 -> 20.5 KB (2026-11-24, same rule: measured 19.50 KB + 5 % with the move splice).
  { name: 'tree', budget: 20.5 * KB },
].map((f) => ({ ...f, entry: new RegExp(`/features/feature-${f.name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}\\.js$`) })).concat([
  // The export and print implementation (interaction chunk, first export or print).
  { name: 'output-impl', budget: 1.7 * KB, entry: /\/output-impl\.js$/ },
]);

const globRegExp = (glob) => new RegExp(`${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);

/**
 * Forbidden modules that contribute bytes to the initial JS, and the closure
 * of each render feature, from a measured bundle (`measureBundle().chunkList`).
 */
export function featureSplitReport(m, { forbidden = FORBIDDEN_IN_MINIMAL, features = FEATURE_CLOSURES } = {}) {
  const initialChunks = m.chunkList.filter((c) => c.initial);
  const present = forbidden.map((f) => {
    const re = globRegExp(f.module);
    const hits = initialChunks.flatMap((c) => c.modules.filter((x) => x.bytes > 0 && re.test(x.id)).map((x) => x.id.replace(root, '')));
    return { module: f.module, pending: f.pending === true, hits };
  });
  const byName = new Map(m.chunkList.map((c) => [c.fileName, c]));
  const closures = features.map((f) => {
    const own = m.chunkList.find((c) => c.modules.some((x) => f.entry.test(x.id)));
    if (!own) return { name: f.name, budget: f.budget, pending: f.pending === true, gzip: null };
    const seen = new Set();
    const visit = (name) => {
      const c = byName.get(name);
      if (!c || seen.has(name) || c.initial) return;
      seen.add(name);
      for (const dep of c.imports) visit(dep);
    };
    visit(own.fileName);
    const gzip = [...seen].reduce((sum, name) => sum + byName.get(name).gzip, 0);
    return { name: f.name, budget: f.budget, pending: f.pending === true, gzip, initial: own.initial };
  });
  const failures = [
    ...present.filter((p) => !p.pending && p.hits.length).map((p) => `forbidden module in the initial JS: ${p.hits.join(', ')}`),
    ...closures.filter((c) => !c.pending && c.gzip === null).map((c) => `render feature "${c.name}": no chunk contains its feature module`),
    ...closures.filter((c) => !c.pending && c.initial).map((c) => `render feature "${c.name}" is in the initial JS`),
    ...closures.filter((c) => !c.pending && c.gzip !== null && c.gzip > c.budget).map((c) => `render feature "${c.name}" closure ${fmt(c.gzip)} exceeds ${fmt(c.budget)}`),
  ];
  return { forbidden: present, closures, failures };
}

/**
 * Bundles one virtual consumer module. Returns gzip sizes and the list of
 * bundled module ids (the metafile equivalent).
 * @param {{ name: string; source: string; external: string[] | 'third-party' }} spec
 */
export async function measureBundle(spec) {
  const { build } = await import('vite');
  mkdirSync(cacheDir, { recursive: true });
  const slug = spec.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const entry = join(cacheDir, `${slug}.js`);
  writeFileSync(entry, spec.source);
  const isExternal =
    spec.external === 'third-party'
      ? (id) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('@salmonui/') && !id.startsWith('\0')
      : // A trailing `!` externalizes that exact specifier only, not its subpaths.
        (id) => spec.external.some((p) => (p.endsWith('!') ? id === p.slice(0, -1) : id === p || id.startsWith(`${p}/`)));
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    root: cacheDir,
    mode: 'production',
    build: {
      write: false,
      minify: true,
      cssMinify: true,
      target: 'es2022',
      modulePreload: false,
      reportCompressedSize: false,
      emptyOutDir: false,
      rollupOptions: {
        input: entry,
        external: isExternal,
        preserveEntrySignatures: 'strict',
        output: { format: 'es' },
      },
    },
  });
  const outputs = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output);
  // Initial chunks: the entry and everything it imports statically.
  const byName = new Map(outputs.map((o) => [o.fileName, o]));
  const initial = new Set();
  const visit = (name) => {
    if (initial.has(name)) return;
    initial.add(name);
    for (const dep of byName.get(name)?.imports ?? []) if (byName.has(dep)) visit(dep);
  };
  for (const item of outputs) if (item.type === 'chunk' && item.isEntry) visit(item.fileName);
  let js = 0;
  let initialJs = 0;
  let css = 0;
  let raw = 0;
  const modules = new Set();
  const chunkList = [];
  for (const item of outputs) {
    if (item.type === 'chunk') {
      raw += Buffer.byteLength(item.code);
      const size = gzipSync(item.code, { level: 9 }).length;
      js += size;
      if (initial.has(item.fileName)) initialJs += size;
      chunkList.push({
        fileName: item.fileName,
        gzip: size,
        initial: initial.has(item.fileName),
        imports: item.imports ?? [],
        modules: Object.entries(item.modules ?? {}).map(([id, info]) => ({ id, bytes: info.renderedLength ?? 0 })),
      });
      for (const id of Object.keys(item.modules ?? {})) modules.add(id);
      for (const id of item.moduleIds ?? []) modules.add(id);
    } else if (item.fileName.endsWith('.css')) {
      const source = typeof item.source === 'string' ? item.source : Buffer.from(item.source);
      raw += Buffer.byteLength(source);
      css += gzipSync(source, { level: 9 }).length;
    }
  }
  return {
    js,
    css,
    gzip: js + css,
    initialJs,
    lazyJs: js - initialJs,
    initial: initialJs + css,
    raw,
    modules: [...modules],
    chunkList,
    chunks: outputs.filter((o) => o.type === 'chunk').length,
  };
}

export function sourceFor(row) {
  if (row.source) return row.source;
  return [...(row.css ?? []).map((c) => `import '${c}';`), ...(row.exports ?? []).map((e, i) => `export * as e${i} from '${e}';`)].join('\n') + '\n';
}

const fmt = (n) => (Number.isFinite(n) ? `${(n / KB).toFixed(2)} KB` : '-');

async function main() {
  const json = process.argv.includes('--json');
  if (!existsSync(join(root, 'packages/data-grid/dist/data-grid.js'))) {
    console.error('bundle-size: packages are not built; run `npm run build` first.');
    process.exit(1);
  }
  // `--only <regexp>` measures the matching rows only (a local iteration aid; the gate runs every row).
  const only = process.argv.includes('--only') ? new RegExp(process.argv[process.argv.indexOf('--only') + 1]) : null;
  const report = [];
  for (const row of BUDGETS.filter((r) => !only || only.test(r.name))) {
    if (row.requires && !existsSync(join(root, row.requires))) {
      report.push({ name: row.name, budget: row.budget, status: 'skipped', reason: `${row.requires} does not exist yet` });
      continue;
    }
    const own = sourceFor(row.over ? { ...row, exports: [...row.over, ...row.exports] } : row);
    const m = await measureBundle({ name: row.name, source: row.without ? `${row.without}\n${own}` : own, external: row.external });
    let gzip = row.scope === 'initial' ? m.initial : row.scope === 'lazy' ? m.lazyJs : m.gzip;
    // `over`: the entries the row's code sits on are subtracted (bundled alone).
    if (row.over) gzip -= (await measureBundle({ name: `${row.name} base`, source: sourceFor({ exports: row.over }), external: row.external })).gzip;
    // `without`: the bytes of a source bundled alone are subtracted (the row's own code over composed entries).
    if (row.without) gzip -= (await measureBundle({ name: `${row.name} without`, source: `${row.without}\n`, external: row.external })).gzip;
    // The composed source is prepended so both bundles share its modules.
    if (row.shareOf) gzip -= (await measureBundle({ name: `${row.name} without`, source: sourceFor(row), external: [...row.external, ...row.shareOf] })).gzip;
    if (row.baseline) {
      // The row's own bytes: the same measurement of the shared baseline alone is subtracted.
      const b = await measureBundle({ name: `${row.name} baseline`, source: sourceFor(row.baseline), external: row.external });
      gzip -= row.scope === 'initial' ? b.initial : b.gzip;
    }
    const split = row.featureSplit ? featureSplitReport(m) : null;
    const forbidden = (row.forbid ?? []).flatMap((re) => m.modules.filter((id) => re.test(id)).map((id) => id.replace(root, '')));
    for (const id of forbidden) console.error(`  error: ${row.name}: forbidden module ${id}`);
    const status = row.report ? 'report' : gzip <= row.budget && !split?.failures.length && !forbidden.length ? 'pass' : 'fail';
    report.push({ name: row.name, scope: row.scope ?? 'all', budget: row.budget, gzip, initial: m.initial, lazy: m.lazyJs, js: m.js, css: m.css, raw: m.raw, status, ...(split ? { featureSplit: split } : {}) });
  }
  rmSync(cacheDir, { recursive: true, force: true });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('entry | gated | gzip | budget | initial | lazy | minified | status');
    for (const r of report) {
      console.log(
        r.status === 'skipped'
          ? `${r.name} | - | - | ${fmt(r.budget)} | - | - | - | skipped (${r.reason})`
          : `${r.name} | ${r.scope} | ${fmt(r.gzip)} | ${fmt(r.budget)} | ${fmt(r.initial)} | ${fmt(r.lazy)} | ${fmt(r.raw)} | ${r.status}`,
      );
    }
    for (const r of report.filter((x) => x.featureSplit)) {
      const { forbidden, closures, failures } = r.featureSplit;
      console.log(`\n${r.name}: render feature closures (gzip, budget)`);
      for (const c of closures) console.log(`  ${c.name} | ${c.gzip === null ? '-' : fmt(c.gzip)} | ${fmt(c.budget)} | ${c.pending ? 'pending (not converted)' : c.gzip !== null && c.gzip <= c.budget && !c.initial ? 'pass' : 'fail'}`);
      const pendingHits = forbidden.filter((f) => f.pending && f.hits.length).length;
      console.log(`  forbidden modules: ${forbidden.filter((f) => !f.pending).length} gated, none in the initial JS${failures.some((f) => f.startsWith('forbidden')) ? ' (FAILED)' : ''}; ${pendingHits} pending still present`);
      for (const f of failures) console.error(`  error: ${f}`);
    }
  }
  const failed = report.filter((r) => r.status === 'fail');
  if (failed.length) {
    console.error(`bundle-size: FAILED (${failed.map((r) => r.name).join(', ')})`);
    process.exit(1);
  }
  console.log('bundle-size: OK');
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await main();
