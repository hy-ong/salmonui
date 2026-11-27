// tooling/checks/isolation.mjs: manifest-driven module, import-edge and
// stylesheet rules, known-violation matching and the generated composition
// table. Fixtures only; no build is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  classify,
  classOwner,
  classOwners,
  composedFamilies,
  compositionTable,
  cssCompositionViolations,
  cssFilesUnder,
  cssSelectorViolations,
  dependencyClosure,
  dirPseudoViolations,
  familyEntries,
  familyOfFile,
  importEdgeViolations,
  internalSpecifiers,
  KNOWN_VIOLATIONS,
  manifestErrors,
  moduleViolations,
  ownerOf,
} from '../isolation.mjs';
import { PACKAGES } from '../packages.manifest.mjs';

const fam = (name, styles, more = {}) => ({ name, entry: `${name}.ts`, styles, ...more });
const FIXTURE = [
  { name: '@salmonui/core', dir: 'packages/core', deps: [], optionalPeers: [], families: [], classes: { 'button-core': ['salmon-button'], a11y: ['salmon-visually-hidden'] }, internal: true },
  {
    name: '@salmonui/buttons',
    dir: 'packages/buttons',
    deps: ['@salmonui/core'],
    optionalPeers: [],
    families: [fam('button', ['button']), fam('menu', ['menu'], { composes: ['button'] }), fam('tag-group', ['tag-group'])],
    classes: { menu: ['salmon-menu', 'salmon-split-button'], 'tag-group': ['salmon-tag'] },
    internal: true,
  },
  { name: '@salmonui/navigation', dir: 'packages/navigation', deps: ['@salmonui/core', '@salmonui/buttons'], optionalPeers: [], families: [fam('toolbar', ['toolbar'])], classes: { toolbar: ['salmon-toolbar'] } },
  {
    name: '@salmonui/charts',
    dir: 'packages/charts',
    deps: ['@salmonui/core', '@salmonui/buttons'],
    optionalPeers: ['@salmonui/navigation'],
    families: [fam('chart', ['chart'], { subpaths: { './features': 'chart/features.ts' } }), fam('stock-chart', ['stock-chart'], { composes: ['chart'] }), fam('gauge', ['gauge'])],
    classes: { chart: ['salmon-chart'], 'stock-chart': ['salmon-stock-chart'], gauge: ['salmon-gauge'] },
  },
  { name: '@salmonui/kanban', dir: 'packages/kanban', deps: ['@salmonui/core'], optionalPeers: [], families: [{ name: 'kanban', entry: 'kanban.ts', styles: ['kanban'], root: true }], classes: { kanban: ['salmon-kanban'] } },
  { name: '@salmonui/rich-text', dir: 'packages/rich-text', deps: ['@salmonui/core'], optionalPeers: [], families: [{ name: 'rich-text', entry: 'index.ts', styles: [], root: true }], thirdParty: [/^prosemirror-[a-z-]+$/] },
];
const pkg = (name) => FIXTURE.find((p) => p.name === name);
const family = (p, name) => pkg(p).families.find((f) => f.name === name);

test('dependency closure follows deps and, unless disabled, optional peers', () => {
  assert.deepEqual([...dependencyClosure(pkg('@salmonui/charts'), FIXTURE)].sort(), ['@salmonui/buttons', '@salmonui/core', '@salmonui/navigation']);
  assert.deepEqual([...dependencyClosure(pkg('@salmonui/charts'), FIXTURE, { optional: false })].sort(), ['@salmonui/buttons', '@salmonui/core']);
  assert.deepEqual([...dependencyClosure(pkg('@salmonui/navigation'), FIXTURE)].sort(), ['@salmonui/buttons', '@salmonui/core']);
});

test('family files: entries, subpath entries and the family directory; the rest is package-shared', () => {
  const charts = pkg('@salmonui/charts');
  assert.equal(familyOfFile(charts, 'chart.js'), 'chart');
  assert.equal(familyOfFile(charts, 'chart/features.js'), 'chart');
  assert.equal(familyOfFile(charts, 'stock-chart/StockChart.js'), 'stock-chart');
  assert.equal(familyOfFile(charts, 'internal/viz/scale.js'), null);
  assert.equal(familyOfFile(pkg('@salmonui/kanban'), 'internal/anything.js'), 'kanban');
  assert.deepEqual([...composedFamilies(charts, 'stock-chart')], ['chart']);
});

test('ownerOf maps module ids to packages, families, peers and third-party packages', () => {
  assert.deepEqual(ownerOf('packages/buttons/dist/menu/Menu.js', FIXTURE), { type: 'module', pkg: '@salmonui/buttons', family: 'menu' });
  assert.deepEqual(ownerOf('packages/core/dist/internal/overlay.js', FIXTURE), { type: 'module', pkg: '@salmonui/core', family: null });
  assert.deepEqual(ownerOf('node_modules/@salmonui/buttons/dist/button.js', FIXTURE), { type: 'module', pkg: '@salmonui/buttons', family: 'button' });
  assert.deepEqual(ownerOf('node_modules/react/jsx-runtime.js', FIXTURE), { type: 'peer' });
  assert.deepEqual(ownerOf('\0rolldown/runtime.js', FIXTURE), { type: 'virtual' });
  assert.deepEqual(ownerOf('node_modules/prosemirror-model/dist/index.js', FIXTURE), { type: 'third-party', name: 'prosemirror-model' });
  assert.deepEqual(ownerOf('packages/react/dist/button.js', FIXTURE), { type: 'unknown' });
});

test('a composed family, shared code, dependency packages and peers pass', () => {
  const modules = [
    'packages/buttons/dist/menu.js',
    'packages/buttons/dist/menu/MenuButton.js',
    'packages/buttons/dist/button/Button.js',
    'packages/buttons/dist/internal/menu-popup.js',
    'packages/core/dist/internal/overlay.js',
    '\0rolldown/runtime.js',
    'node_modules/react/jsx-runtime.js',
  ];
  assert.deepEqual(moduleViolations({ entry: '@salmonui/buttons/menu', pkg: pkg('@salmonui/buttons'), family: family('@salmonui/buttons', 'menu'), modules, packages: FIXTURE }), []);
});

test('an uncomposed family, a package outside the deps, a third-party module and an unknown module fail', () => {
  const modules = [
    'packages/buttons/dist/button.js',
    'packages/buttons/dist/menu/list.js',
    'packages/kanban/dist/kanban.js',
    'node_modules/some-dep/index.js',
    'packages/react/dist/x.js',
  ];
  const v = moduleViolations({ entry: '@salmonui/buttons/button', pkg: pkg('@salmonui/buttons'), family: family('@salmonui/buttons', 'button'), modules, packages: FIXTURE });
  assert.deepEqual(v.map((x) => x.target), modules.slice(1));
  assert.match(v[0].reason, /family "menu" is not composed by "button"/);
  assert.match(v[1].reason, /package @salmonui\/kanban is not a dependency of @salmonui\/buttons/);
  assert.match(v[2].reason, /third-party package some-dep/);
  assert.ok(v.every((x) => x.kind === 'module' && x.entry === '@salmonui/buttons/button'));
  const rich = moduleViolations({ entry: '@salmonui/rich-text', pkg: pkg('@salmonui/rich-text'), family: pkg('@salmonui/rich-text').families[0], modules: ['node_modules/prosemirror-view/dist/index.js'], packages: FIXTURE });
  assert.deepEqual(rich, []);
});

test('an optional peer must stay in lazy chunks unless the family lists it in peers', () => {
  const charts = pkg('@salmonui/charts');
  const toolbar = 'packages/navigation/dist/toolbar/Toolbar.js';
  const args = { entry: '@salmonui/charts/chart', pkg: charts, family: family('@salmonui/charts', 'chart'), modules: [toolbar], packages: FIXTURE };
  assert.deepEqual(moduleViolations({ ...args, initialModules: [] }), []);
  assert.match(moduleViolations({ ...args, initialModules: [toolbar] })[0].reason, /optional peer @salmonui\/navigation is in the initial chunks/);
  assert.deepEqual(moduleViolations({ ...args, family: { ...args.family, peers: ['@salmonui/navigation'] }, initialModules: [toolbar] }), []);
});

test('import edges must be declared in the manifest and package.json and name exported subpaths', () => {
  const exportsOf = (n) => ({ '@salmonui/core': { './theme': {}, './internal/*': {} }, '@salmonui/buttons': { './button': {}, './internal/*': {} }, '@salmonui/navigation': { './toolbar': {} }, '@salmonui/charts': { './chart': {} } })[n];
  const charts = pkg('@salmonui/charts');
  const manifestJson = { dependencies: { '@salmonui/core': '0.1.0', '@salmonui/buttons': '0.1.0' }, peerDependencies: { '@salmonui/navigation': '0.1.0' }, peerDependenciesMeta: { '@salmonui/navigation': { optional: true } } };
  const ok = ['@salmonui/core/theme', '@salmonui/core/internal/dev', '@salmonui/buttons/button', '@salmonui/navigation/toolbar', '@salmonui/charts/chart', 'react'];
  assert.deepEqual(importEdgeViolations({ file: 'a.ts', specs: ok, pkg: charts, manifestJson, exportsOf, packages: FIXTURE }), []);
  const bad = ['@salmonui/kanban', '@salmonui/react/button', '@salmonui/buttons/menu-internal', '@salmonui/navigation/internal/x', '@salmonui/charts/private'];
  const v = importEdgeViolations({ file: 'a.ts', specs: bad, pkg: charts, manifestJson, exportsOf, packages: FIXTURE });
  assert.deepEqual(v.map((x) => x.target), bad);
  assert.match(v[0].reason, /not in the manifest `deps` or `optionalPeers`/);
  assert.match(v[1].reason, /not a package of the manifest/);
  assert.match(v[2].reason, /does not export `.\/menu-internal`/);
  assert.match(v[3].reason, /does not expose `.\/internal\/\*`/);
  assert.match(v[4].reason, /import its own private modules relatively/);
  const undeclared = importEdgeViolations({ file: 'a.ts', specs: ['@salmonui/buttons/button', '@salmonui/navigation/toolbar'], pkg: charts, manifestJson: { dependencies: {}, peerDependencies: { '@salmonui/navigation': '0.1.0' } }, exportsOf, packages: FIXTURE });
  assert.match(undeclared[0].reason, /missing from its package.json "dependencies"/);
  assert.match(undeclared[1].reason, /not an optional "peerDependencies" entry/);
});

test('only a platform "node" package imports Node builtins; a react "none" package never imports React', () => {
  const exportsOf = () => ({});
  const manifestJson = { dependencies: {} };
  const tool = { name: '@salmonui/tool', react: 'none', platform: 'node', deps: [], optionalPeers: [], families: [] };
  assert.deepEqual(importEdgeViolations({ file: 'a.ts', specs: ['node:fs', 'node:url'], pkg: tool, manifestJson, exportsOf, packages: FIXTURE }), []);
  const v = importEdgeViolations({ file: 'a.ts', specs: ['react', 'react-dom/server'], pkg: tool, manifestJson, exportsOf, packages: FIXTURE });
  assert.deepEqual(v.map((x) => x.target), ['react', 'react-dom/server']);
  assert.match(v[0].reason, /react: 'none'/);
  const charts = pkg('@salmonui/charts');
  const node = importEdgeViolations({ file: 'a.ts', specs: ['node:fs', 'react'], pkg: charts, manifestJson, exportsOf, packages: FIXTURE });
  assert.deepEqual(node.map((x) => x.target), ['node:fs']);
  assert.match(node[0].reason, /not a platform "node" package/);
});

test('internal specifiers are found in any text', () => {
  assert.deepEqual(internalSpecifiers("import { x } from '@salmonui/core/internal/dev';\nsee `@salmonui/buttons/internal/*` and @salmonui/core/theme"), ['@salmonui/core/internal/dev', '@salmonui/buttons/internal/*']);
});

test('class prefixes map to stylesheet modules by the longest match', () => {
  const owners = classOwners(FIXTURE);
  assert.equal(classOwner('.salmon-button__icon', owners).module, 'button-core');
  assert.equal(classOwner('.salmon-split-button-trigger', owners).module, 'menu');
  assert.equal(classOwner('.salmon-buttonish', owners), null);
});

test('a stylesheet may use its own modules, core and its dependencies only', () => {
  const buttons = pkg('@salmonui/buttons');
  const ok = '/* .salmon-kanban in a comment */\n.salmon-menu-item { color: red }\n.salmon-split-button > .salmon-button:first-child {}\n.salmon-visually-hidden {}\n';
  assert.deepEqual(cssSelectorViolations({ entry: 'menu.css', pkg: buttons, styles: ['menu'], css: ok, packages: FIXTURE }), []);
  const bad = '.salmon-tag {}\n.salmon-kanban-card {}\n.salmon-unknown-thing {}\n';
  const v = cssSelectorViolations({ entry: 'menu.css', pkg: buttons, styles: ['menu'], css: bad, packages: FIXTURE });
  assert.deepEqual(v.map((x) => x.target), ['.salmon-kanban-card', '.salmon-tag', '.salmon-unknown-thing']);
  assert.match(v[0].reason, /@salmonui\/kanban .*does not depend on/);
  assert.match(v[1].reason, /does not carry/);
  assert.match(v[2].reason, /matches no manifest `classes` prefix/);
  assert.deepEqual(cssSelectorViolations({ entry: 'toolbar.css', pkg: pkg('@salmonui/navigation'), styles: ['toolbar'], css: '.salmon-toolbar .salmon-menu {}', packages: FIXTURE }), []);
});

test('a family stylesheet is exactly its computed modules, of its dependencies, without the core base', () => {
  const menu = pkg('@salmonui/buttons');
  const coreBase = [{ pkg: '@salmonui/core', file: 'theme' }];
  const files = [{ pkg: '@salmonui/core', file: 'a11y' }, { pkg: '@salmonui/buttons', file: 'menu' }];
  const args = { entry: 'menu.css', pkg: menu, files, coreBase, packages: FIXTURE };
  assert.deepEqual(cssCompositionViolations({ ...args, css: 'a\nb', expected: 'a\nb' }), []);
  assert.deepEqual(cssCompositionViolations({ ...args, css: 'a\nb\nextra', expected: 'a\nb' }).map((x) => x.kind), ['css-composition']);
  const wrong = [{ pkg: '@salmonui/core', file: 'theme' }, { pkg: '@salmonui/kanban', file: 'kanban' }, ...files];
  assert.deepEqual(
    cssCompositionViolations({ ...args, files: wrong, css: 'x', expected: 'x' }).map((x) => [x.kind, x.target]),
    [['css-core-base', '@salmonui/core:theme'], ['css-foreign', '@salmonui/kanban:kanban']],
  );
});

test('manifest errors: unknown composed family, unknown peer, missing style module', () => {
  const broken = [{ ...pkg('@salmonui/charts'), families: [fam('chart', [], { composes: ['nope'], peers: ['@salmonui/kanban'] })], classes: { ghost: ['salmon-ghost'] } }];
  assert.equal(manifestErrors(broken, (_p, m) => m !== 'ghost').length, 3);
});

test('the real manifest is consistent and lists every family entry', () => {
  assert.deepEqual(manifestErrors(PACKAGES), []);
  const specs = familyEntries().map((e) => e.specifier);
  for (const s of ['@salmonui/buttons/button', '@salmonui/data-grid', '@salmonui/data-grid/features', '@salmonui/calendars/date-picker/data-grid', '@salmonui/charts/barcode/pdf417', '@salmonui/inputs/file-upload/xhr']) assert.ok(specs.includes(s), s);
  assert.equal(new Set(specs).size, specs.length);
});

test('the composition table lists every package from the manifest', () => {
  for (const p of PACKAGES) assert.ok(compositionTable().includes(`| \`${p.name}\` |`), p.name);
  assert.match(compositionTable(), /\| `@salmonui\/calendars` \| .*date-picker \(\+ `\/data-grid`\).* \| date-picker -> calendar, date-field/);
});

test('KNOWN_VIOLATIONS is empty', () => {
  assert.deepEqual(KNOWN_VIOLATIONS, []);
});

test('known violations are reported separately and stale ones are found', () => {
  const v = [
    { kind: 'module', entry: '@salmonui/buttons/button', target: 'packages/buttons/dist/menu/list.js' },
    { kind: 'css-selector', entry: 'button.css', target: '.salmon-menu-item' },
  ];
  const known = [
    { kind: 'css-selector', entry: 'button.css', target: '.salmon-menu-item', todo: 'TODO' },
    { kind: 'css-composition', entry: 'menu.css', target: 'menu.css', todo: 'TODO' },
  ];
  const r = classify(v, known);
  assert.deepEqual(r.fresh, [v[0]]);
  assert.deepEqual(r.known, [v[1]]);
  assert.deepEqual(r.stale, [known[1]]);
});

test('dirPseudoViolations flags every :dir(', () => {
  const files = [
    { file: 'a.css', css: ".x { scale: var(--salmon-dir, 1) 1; }\n[dir='rtl'] .y { text-anchor: end; }" },
    { file: 'b.css', css: '.x:dir(rtl) { scale: -1 1; }\n/* ok */\n.y:DIR(ltr)::before { content: ""; }' },
  ];
  assert.deepEqual(dirPseudoViolations(files), ['b.css:1', 'b.css:3']);
});

test('the source stylesheets of the packages and the docs site have no :dir(', () => {
  const root = new URL('../../../', import.meta.url).pathname;
  const sheets = [...PACKAGES.map((p) => `${p.dir}/styles`), 'docs/site/app'].flatMap((d) => cssFilesUnder(`${root}${d}`)).map((file) => ({ file, css: readFileSync(file, 'utf8') }));
  assert.ok(sheets.length > 50);
  assert.deepEqual(dirPseudoViolations(sheets), []);
});
