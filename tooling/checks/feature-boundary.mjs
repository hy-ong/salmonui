// feature:boundary:check (tree-shaking rules). Requires
// `npm run build`. Paths come from packages.manifest.mjs (the Data Grid
// package directory and its family entry and `./features` subpath).
//
// - The browser graph of `@salmonui/data-grid` (and of every family entry of
//   the packages that depend on it, followed into the Data Grid package),
//   static edges only, with `#data-grid-features` resolved under the
//   `browser` condition, reaches no `features/feature-*` module: render
//   features load through the lazy registry's `import()` edges only.
// - Only `features/registry-static.js`, `features/registry-lazy.js` (with
//   `import()` only) and the public `./features` entry import a
//   `features/feature-*` module; nothing imports the features entry.
// - `detect.js`, `inert.js` and `types.js` import no feature module (they
//   may import feature types, which are erased).
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { importGraph, importsOf, listFiles, reporter, requireBuild, resolveWorkspaceSpecifier, root } from './lib.mjs';
import { PACKAGES, manifestOf } from './packages.manifest.mjs';

const r = reporter('feature:boundary:check');
requireBuild('feature:boundary:check');

const GRID = '@salmonui/data-grid';
const grid = manifestOf(GRID);
const gridFamily = grid.families.find((f) => f.name === 'data-grid');
const toJs = (src) => src.replace(/\.ts$/, '.js');
const dist = join(root, grid.dir, 'dist');
const ENTRY = toJs(gridFamily.entry);
const FEATURES_ENTRY = toJs(gridFamily.subpaths['./features']);
const FEATURES_DIR = FEATURES_ENTRY.replace(/\.js$/, '');
const FAMILY_DIR = FEATURES_ENTRY.split('/')[0];
const FEATURE = /(^|\/)features\/feature-[^/]+\.js$/;
const BROWSER = ['browser', 'import'];
const rel = (f) => relative(dist, f);
const inGrid = (f) => f.startsWith(`${dist}/`);

// 1. Static browser graph of the render entries: the Data Grid entry and the
// family entries of every package that depends on the Data Grid (followed
// into @salmonui/data-grid through its exports map).
const dependents = PACKAGES.filter((p) => p.deps.includes(GRID) || p.optionalPeers.includes(GRID));
const entries = [{ label: `${GRID} (${grid.dir}/dist/${ENTRY})`, file: join(dist, ENTRY), own: true }];
for (const p of dependents) {
  for (const fam of p.families) {
    const specs = [fam.root ? p.name : `${p.name}/${fam.name}`, ...Object.keys(fam.subpaths ?? {}).map((s) => `${p.name}/${s.slice(2)}`)];
    for (const spec of specs) entries.push({ label: spec, file: resolveWorkspaceSpecifier(spec), own: false });
  }
}
for (const { label, file, own } of entries) {
  if (!file || !existsSync(file)) {
    r.fail(`${label}: built entry is missing`);
    continue;
  }
  const g = importGraph(file, { followDynamic: false, conditions: BROWSER, resolvePackage: (spec) => (spec === GRID || spec.startsWith(`${GRID}/`) ? resolveWorkspaceSpecifier(spec) : null) });
  const reached = g.files.filter((f) => inGrid(f) && FEATURE.test(rel(f)));
  for (const f of reached) r.fail(`${label} reaches ${rel(f)} through a static import (browser condition); render features load through registry-lazy's import() only`);
  if (g.files.some((f) => inGrid(f) && rel(f) === FEATURES_ENTRY)) r.fail(`${label} reaches ${FEATURES_ENTRY}; nothing may import the features entry`);
  const lazy = g.privateEdges.filter((e) => e.spec === '#data-grid-features');
  if (own && !lazy.some((e) => e.targets.some((t) => t.endsWith(`${FEATURES_DIR}/registry-lazy.js`)))) r.fail(`${label}: #data-grid-features does not resolve to registry-lazy.js under the browser condition`);
  r.note(`${label}: ${g.files.length} modules in the static browser graph, no render feature module`);
}

// 2. Who imports feature modules and the features entry.
const ALLOWED_STATIC = new Set([`${FEATURES_DIR}/registry-static.js`, FEATURES_ENTRY]);
const ALLOWED_DYNAMIC = new Set([`${FEATURES_DIR}/registry-lazy.js`]);
const TYPE_ONLY = new Set(['detect.js', 'inert.js', 'types.js'].map((f) => `${FEATURES_DIR}/${f}`));
let features = 0;
for (const f of listFiles(dist).filter((x) => x.endsWith('.js'))) {
  if (FEATURE.test(f)) features++;
  const { static: stat, dynamic } = importsOf(readFileSync(join(dist, f), 'utf8'));
  const resolved = (spec) => (spec.startsWith('.') ? relative(dist, join(dist, f, '..', spec)) : null);
  for (const spec of stat) {
    const target = resolved(spec);
    if (target === null) continue;
    if (FEATURE.test(target) && !ALLOWED_STATIC.has(f)) r.fail(`${f} statically imports ${target}; only registry-static.js and the features entry may`);
    if (target === FEATURES_ENTRY) r.fail(`${f} imports the features entry; nothing in the package may`);
    if (TYPE_ONLY.has(f) && FEATURE.test(target)) r.fail(`${f} imports feature code ${target}; it may use \`import type\` only`);
  }
  for (const spec of dynamic) {
    const target = resolved(spec);
    if (target !== null && FEATURE.test(target) && !ALLOWED_DYNAMIC.has(f)) r.fail(`${f} loads ${target} with import(); only registry-lazy.js may`);
  }
}
if (!features) r.fail('no features/feature-*.js module in dist; run `npm run build`');
r.note(`${features} render feature modules, imported only by the registries and the features entry`);

// 3. Chunking hub: every lazy module of the grid
// (each `import()` target: render features and interaction chunks) that has
// runtime imports reaches `DataGrid.js` statically, so the consumer's bundler
// keeps the static graph in one chunk; a package subpath is never an
// `import()` target (it goes through a local module with the hub).
const HUB = `${FAMILY_DIR}/DataGrid.js`;
const lazyTargets = new Set();
for (const f of listFiles(dist).filter((x) => x.startsWith(FAMILY_DIR) && x.endsWith('.js'))) {
  for (const spec of importsOf(readFileSync(join(dist, f), 'utf8')).dynamic) {
    if (spec.startsWith('.')) lazyTargets.add(relative(dist, join(dist, f, '..', spec)));
    else r.fail(`${f} loads the package subpath ${spec} with import(); load it through a local module with the chunking hub`);
  }
}
for (const target of lazyTargets) {
  const file = join(dist, target);
  if (!existsSync(file)) continue;
  if (!importsOf(readFileSync(file, 'utf8')).static.length) continue;
  const g = importGraph(file, { followDynamic: false, conditions: BROWSER });
  if (!g.files.some((x) => rel(x) === HUB)) r.fail(`${target} (an import() target) does not reach ${HUB} statically; give it the chunking hub`);
}
r.note(`${lazyTargets.size} lazy modules, each with the chunking hub or without runtime imports`);
r.done();
