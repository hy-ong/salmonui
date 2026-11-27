// server:boundary:check (server-safe entries, no DOM globals in neutral
// code). Walks the built import
// graph of every neutral and server-safe entry, following imports into other
// @salmonui packages through their `exports` maps (so a neutral entry cannot
// reach React or the DOM through another package), then imports each entry
// in a child Node process with browser-like globals removed. Packages and
// their neutral entries come from packages.manifest.mjs. Requires
// `npm run build`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  codeOnly,
  exportTargets,
  importChain,
  importGraph,
  manifestPackages,
  packageName,
  privateImportTargets,
  reporter,
  requireBuild,
  resolveWorkspaceSpecifier,
  root,
} from './lib.mjs';

const r = reporter('server:boundary:check');
requireBuild('server:boundary:check');

const DOM_GLOBALS = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'indexedDB',
  'HTMLElement', 'Element', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia', 'DOMParser', 'XMLHttpRequest',
  'screen', 'devicePixelRatio',
];
// Identifier use, not a property access (`x.window`) or an object key (`window:`).
const domPattern = new RegExp(`(?<![.\\w$])(${DOM_GLOBALS.join('|')})(?![\\w$])(?!\\s*[:?])`, 'g');
const HOOKS = /\buse(State|Effect|LayoutEffect|InsertionEffect|SyncExternalStore|Context|Ref|Memo|Callback|Reducer|Transition|DeferredValue|Id|ActionState|Optimistic)\s*\(|\buse\s*\(/;
const isClientModule = (_file, text) => /^\s*['"]use client['"]/.test(text);
const SALMON = /^@salmonui\//;

const packages = new Map(manifestPackages().map((p) => [p.manifest.name, p]));
const pkg = (name) => packages.get(name);
const specifierOf = (name, subpath) => (subpath === '.' ? name : `${name}/${subpath.slice(2)}`);
const owner = (file) => [...packages.values()].find((p) => file.startsWith(`${p.dir}/`));

/** Public JS entries of a package (`exports` import targets), optionally filtered by subpath. */
function entryFiles(name, filter = () => true) {
  const p = pkg(name);
  if (!p) return [];
  return exportTargets(p.pkg.exports)
    .filter((t) => t.condition === 'import' && t.target.endsWith('.js') && !t.subpath.includes('*') && filter(t.subpath))
    .map((t) => ({ subpath: specifierOf(name, t.subpath), file: join(p.dir, t.target) }));
}

/** The built file of a public specifier, or a failure when it is missing. */
function entryOf(spec) {
  const file = resolveWorkspaceSpecifier(spec);
  if (!file) r.fail(`${spec}: no built entry (missing from exports or not built)`);
  return file;
}

// Entries whose whole graph (static and dynamic, across @salmonui packages)
// must stay free of React, the DOM and third-party packages.
const neutral = [];
for (const [name, p] of packages) {
  const m = p.manifest;
  // Packages without React at all (`react: 'none'`, such as data and export) are neutral as a whole.
  // A Node-only package (`platform: 'node'`, @salmonui/mcp) may import `node:*`
  // builtins and nothing else; its `bin` entries are checked too but never
  // imported by the smoke (they start the server).
  const node = m.platform === 'node';
  if (m.react === 'none') neutral.push(...entryFiles(name).map((e) => ({ ...e, node })));
  if (node) {
    for (const [cmd, target] of Object.entries(typeof p.pkg.bin === 'string' ? { [name]: p.pkg.bin } : (p.pkg.bin ?? {}))) {
      const file = join(p.dir, target);
      if (!existsSync(file)) r.fail(`${name}: bin ${cmd} -> ${target} is not built`);
      else neutral.push({ subpath: `${name} bin ${cmd}`, file, node, smoke: false });
    }
  }
  for (const sub of m.neutral ?? []) {
    const file = entryOf(specifierOf(name, sub));
    if (file) neutral.push({ subpath: specifierOf(name, sub), file });
  }
  // The framework-agnostic engines: `./engine` and every `./engine/*` subpath.
  if (m.engine) {
    for (const sub of Object.keys(m.engine)) {
      const spec = specifierOf(name, sub === '.' ? './engine' : `./engine/${sub.slice(2)}`);
      const file = entryOf(spec);
      if (file) neutral.push({ subpath: spec, file });
    }
  }
}
// Private neutral modules reached through `#` imports (the date module
// and `#viz`): DOM-free like a public
// neutral entry. Resolved through the owning package.json `imports` field.
const PRIVATE_NEUTRAL = { '@salmonui/core': ['#dates'], '@salmonui/charts': ['#viz'] };
for (const [name, specs] of Object.entries(PRIVATE_NEUTRAL)) {
  const p = pkg(name);
  if (!p) continue;
  for (const spec of specs) {
    const [file] = privateImportTargets(join(p.dir, 'package.json'), spec, ['import']).filter((f) => f.endsWith('.js'));
    if (!file || !existsSync(file)) r.fail(`${name} ${spec}: built module is missing (run npm run build)`);
    else neutral.push({ subpath: `${name} ${spec}`, file, url: true });
  }
}

/**
 * Walks one entry's graph and applies the rules. `allowed`: bare non-@salmonui
 * specifiers the graph may import; `dom`, `hooks`, `css`, `useClient`: whether
 * DOM globals, React hook calls, CSS imports and "use client" modules are
 * allowed; `node`: `node:*` builtins are allowed; `island`: stop at "use client" modules below the entry (client
 * islands of a render-safe entry); `followDynamic`: walk `import()` edges.
 */
function check(label, file, { allowed = new Set(), node = false, dom = false, hooks = false, css = false, useClient = false, island = false, followDynamic = true } = {}) {
  const g = importGraph(file, { followDynamic, stopAt: island ? isClientModule : null, resolvePackage: (spec) => (SALMON.test(spec) ? resolveWorkspaceSpecifier(spec) : null) });
  for (const m of g.missing) r.fail(`${label}: ${m.from} imports missing ${m.spec}`);
  for (const dep of g.packages) {
    if (SALMON.test(dep.spec)) r.fail(`${label}: ${dep.from} imports "${dep.spec}", which is not a built export (${importChain(g, dep.from)})`);
    else if (node && dep.spec.startsWith('node:')) continue;
    else if (!allowed.has(dep.spec)) r.fail(`${label}: imports "${dep.spec}"${dep.kind === 'dynamic' ? ' (dynamic)' : ''} via ${importChain(g, dep.from)}${allowed.size ? ` (allowed: ${[...allowed].join(', ')})` : ''}`);
  }
  // Cross-package edges stay within each package's declared deps / optional peers.
  for (const edge of g.packageEdges) {
    const from = owner(join(root, edge.from))?.manifest;
    const to = packageName(edge.spec);
    if (from && to !== from.name && !from.deps.includes(to) && !from.optionalPeers.includes(to)) r.fail(`${label}: ${edge.from} imports "${edge.spec}", not a dependency or optional peer of ${from.name}`);
  }
  let islands = 0;
  for (const f of g.files) {
    const rel = relative(root, f);
    if (f.endsWith('.css')) {
      if (!css) r.fail(`${label} imports CSS (${importChain(g, f)})`);
      continue;
    }
    const text = readFileSync(f, 'utf8');
    if (isClientModule(f, text)) {
      if (!useClient && !(island && f !== file)) r.fail(`${label}: ${rel} is a "use client" module (${importChain(g, f)})`);
      if (island && f !== file) {
        islands++;
        continue;
      }
    }
    const code = codeOnly(text);
    if (!dom) {
      const hits = [...code.matchAll(domPattern)].map((m) => m[1]);
      if (hits.length) r.fail(`${label}: ${rel} references DOM globals ${[...new Set(hits)].join(', ')} (${importChain(g, f)})`);
    }
    if (!hooks && HOOKS.test(code)) r.fail(`${label}: ${rel} calls a React hook (${importChain(g, f)})`);
  }
  return { graph: g, islands };
}

// 1. Neutral entries: no React, no DOM global, no CSS, no "use client", no
// third-party package, statically or through import(), in their whole graph
// including the @salmonui modules they import. With `react` unreachable a
// hook call cannot exist, so the textual hook scan (which would flag a local
// helper named `use`) runs only on the private modules, as it always did.
for (const { subpath, file, url, node } of neutral) check(subpath, file, { hooks: !url, node });

// 2. Server entries.
const SERVER_ALLOWED = new Set(['react', 'react/jsx-runtime']);
const serverSpecs = [];
// `./server` of every package that has one (core: theme CSS and ThemeStyle;
// data-grid: server data helpers; charts: server-side SVG): React elements
// at most, no DOM global, no hook, no CSS, no "use client".
for (const [name, p] of packages) {
  if (!p.manifest.extra?.['./server']) continue;
  const spec = `${name}/server`;
  const file = entryOf(spec);
  if (!file) continue;
  serverSpecs.push(spec);
  const { graph } = check(spec, file, { allowed: p.manifest.react === 'none' ? new Set() : SERVER_ALLOWED });
  r.note(`${spec} graph: ${graph.files.length} modules, packages ${[...new Set(graph.packages.map((d) => d.spec))].join(', ') || 'none'}`);
  // Nothing else of the package reaches its server entry statically (an
  // entry never re-exports ./server).
  for (const other of entryFiles(name, (s) => s !== './server')) {
    if (importGraph(other.file, { followDynamic: false }).files.includes(file)) r.fail(`${other.subpath} reaches ${spec} through a static import`);
  }
}
// FileUpload transport: constructs XMLHttpRequest
// only when a file is sent, so it is importable on the server: no package
// import but @salmonui modules, no React hooks, not a "use client" module;
// the runtime smoke imports it without DOM globals.
const XHR = '@salmonui/inputs/file-upload/xhr';
if (pkg('@salmonui/inputs')) {
  const file = entryOf(XHR);
  if (file) check(XHR, file, { dom: true });
}
// Query Builder converters: no React, no
// hooks, no CSS, no "use client", no DOM globals.
const CONVERTERS = pkg('@salmonui/query-builder') ? ['@salmonui/query-builder/sql', '@salmonui/query-builder/mongo'] : [];
for (const spec of CONVERTERS) {
  const file = entryOf(spec);
  if (file) check(spec, file);
}
// Server components (notifications and layout subpaths): server-safe
// entries carry no "use client" module, hook, DOM global or CSS import in
// their graph; render-safe entries with a client island are not "use client"
// themselves and are checked up to the "use client" modules they import.
const SERVER_COMPONENT_ENTRIES = {
  '@salmonui/notifications/badge': 'server-safe',
  '@salmonui/notifications/progress': 'server-safe',
  '@salmonui/notifications/spinner': 'server-safe',
  '@salmonui/notifications/skeleton': 'server-safe',
  '@salmonui/notifications/message': 'island',
  '@salmonui/layout/card': 'server-safe',
  '@salmonui/layout/timeline': 'server-safe',
  '@salmonui/layout/list': 'server-safe',
  '@salmonui/layout/avatar': 'island',
};
for (const [spec, mode] of Object.entries(SERVER_COMPONENT_ENTRIES)) {
  const file = entryOf(spec);
  if (!file) continue;
  const { graph, islands } = check(spec, file, { allowed: SERVER_ALLOWED, island: mode === 'island' });
  if (mode === 'island' && islands === 0) r.note(`${spec}: no client island module (render-safe entry is fully server-safe)`);
  r.note(`${spec} (${mode}): ${graph.files.length} modules${mode === 'island' ? `, ${islands} client island module(s)` : ''}`);
}

// 3. Optional-peer writers: a package that lists @salmonui/export as an
// optional peer loads it through import() only, never statically.
for (const [name, p] of packages) {
  if (!p.manifest.optionalPeers.includes('@salmonui/export')) continue;
  for (const { subpath, file } of entryFiles(name)) {
    const g = importGraph(file);
    for (const dep of g.packages) {
      if (packageName(dep.spec) === '@salmonui/export' && dep.kind === 'static') r.fail(`${subpath}: ${dep.from} statically imports "${dep.spec}" (an optional peer; load it with import())`);
    }
  }
}
// No package imports @salmonui/export unless it is a dependency or optional peer.
for (const [name, p] of packages) {
  if (name === '@salmonui/export' || p.manifest.deps.includes('@salmonui/export') || p.manifest.optionalPeers.includes('@salmonui/export')) continue;
  for (const { subpath, file } of entryFiles(name)) {
    for (const dep of importGraph(file).packages) {
      if (packageName(dep.spec) === '@salmonui/export') r.fail(`${subpath}: ${dep.from} imports @salmonui/export`);
    }
  }
}

// 4. @salmonui/rich-text: the root entry is
// server-safe. Its static graph (what a server render loads) reaches no
// ProseMirror or Yjs module; the engine is a dynamic import() run in an
// effect on the client. Module-scope DOM access is caught by the runtime smoke.
if (pkg('@salmonui/rich-text')) {
  const rt = entryOf('@salmonui/rich-text');
  if (rt) {
    const g = importGraph(rt, { followDynamic: false });
    for (const m of g.missing) r.fail(`@salmonui/rich-text: ${m.from} imports missing ${m.spec}`);
    for (const dep of g.packages) {
      if (dep.kind === 'static' && /^(prosemirror-|y-|yjs$|lib0$)/.test(packageName(dep.spec))) r.fail(`@salmonui/rich-text: ${dep.from} statically imports "${dep.spec}" (server render path)`);
    }
    r.note(`@salmonui/rich-text static graph: ${g.files.length} modules, packages ${[...new Set(g.packages.filter((d) => d.kind === 'static').map((d) => packageName(d.spec)))].join(', ') || 'none'}`);
  }
}

// 5. @salmonui/pdf-viewer: the root entry is
// server-safe; pdf.js and its worker are reached only through dynamic
// import() and `new Worker(new URL(...))`, never statically.
if (pkg('@salmonui/pdf-viewer')) {
  const pv = entryOf('@salmonui/pdf-viewer');
  if (pv) {
    const g = importGraph(pv, { followDynamic: false });
    for (const m of g.missing) r.fail(`@salmonui/pdf-viewer: ${m.from} imports missing ${m.spec}`);
    for (const dep of g.packages) {
      if (dep.kind === 'static' && packageName(dep.spec) === 'pdfjs-dist') r.fail(`@salmonui/pdf-viewer: ${dep.from} statically imports "${dep.spec}" (server render path)`);
    }
    if (g.files.some((f) => /engine[\\/](controller|pdf-worker)\.js$/.test(f))) r.fail('@salmonui/pdf-viewer: the engine chunk is in the static graph of the root entry');
    r.note(`@salmonui/pdf-viewer static graph: ${g.files.length} modules, packages ${[...new Set(g.packages.filter((d) => d.kind === 'static').map((d) => packageName(d.spec)))].join(', ') || 'none'}`);
  }
}

// Runtime smoke: import every neutral and server-safe entry with browser-like
// globals removed (Node >= 21 defines `navigator`; newer versions may define
// `localStorage`) and render the core server entry's output.
const smokeEntries = [
  ...neutral.filter((e) => e.smoke !== false).map((e) => (e.url ? pathToFileURL(e.file).href : e.subpath)),
  ...serverSpecs,
  ...(pkg('@salmonui/inputs') ? [XHR] : []),
  ...CONVERTERS,
  ...Object.keys(SERVER_COMPONENT_ENTRIES),
  ...(pkg('@salmonui/rich-text') ? ['@salmonui/rich-text'] : []),
  ...(pkg('@salmonui/pdf-viewer') ? ['@salmonui/pdf-viewer'] : []),
];
const smoke = `
for (const name of ${JSON.stringify(DOM_GLOBALS)}) {
  try { delete globalThis[name]; } catch {}
  if (name in globalThis) Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
}
for (const spec of ${JSON.stringify(smokeEntries)}) {
  const mod = await import(spec);
  if (Object.keys(mod).length === 0) throw new Error(spec + ' has no exports');
}
const server = await import('@salmonui/core/server');
const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const css = server.createThemeCss();
if (!css.includes('--salmon-')) throw new Error('createThemeCss() emitted no --salmon-* variables');
const html = renderToString(createElement(server.ThemeStyle, {}));
if ((html.match(/<style/g) ?? []).length !== 1) throw new Error('ThemeStyle must render exactly one <style> block: ' + html.slice(0, 120));
if (typeof window !== 'undefined' || typeof document !== 'undefined' || typeof navigator !== 'undefined') throw new Error('globals leaked');
console.log('smoke: ' + ${smokeEntries.length} + ' entries imported without DOM globals, core ThemeStyle rendered');
`;
const child = spawnSync(process.execPath, ['--input-type=module', '-e', smoke], { cwd: root, encoding: 'utf8' });
if (child.status !== 0) r.fail(`runtime smoke failed:\n${child.stderr || child.stdout}`);
else r.note(child.stdout.trim());

r.note(`${neutral.length} neutral entries checked (no React, DOM or third-party package in their cross-package graph)`);
r.done();
