// Family stylesheet composition (css-composition.mjs): every family that renders another family gets
// that family's rules from its own stylesheet, so an application imports
// `@salmonui/core/styles.css` (the theme) plus the families it uses
// and nothing it does not know about. Reads sources only; no build needed.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { concatStyles, coreBaseFiles, familyByName, familyOfSpecifier, importsOf, LAYER, layeredStyles, layerName, layerRanks, onlyKeyframes, renderedFamilies, root, styleModule, stylesheetFiles, TOP } from '../css-composition.mjs';
import { allFamilies, manifestOf, PACKAGES } from '../packages.manifest.mjs';

const key = (e) => `${e.pkg}:${e.file}`;

test('every rendered family is carried by the family stylesheet or listed as not carried', () => {
  const problems = [];
  for (const { family } of allFamilies()) {
    const own = new Set(stylesheetFiles(family.name).map(key));
    for (const other of renderedFamilies(family.name)) {
      if (family.notCarried?.[other]) continue;
      const missing = stylesheetFiles(other).filter((e) => !own.has(key(e)));
      if (missing.length) problems.push(`${family.name} renders ${other} but its stylesheet lacks ${missing.map(key).join(', ')} (add "${other}" to \`carries\`, its files to \`styles\`, or a \`notCarried\` reason)`);
    }
  }
  assert.deepEqual(problems, []);
});

/** The families a family renders, directly or through the families it renders (lazy ones included). */
function renderedClosure(name) {
  const out = new Set();
  const stack = [name];
  while (stack.length) for (const next of renderedFamilies(stack.pop())) if (!out.has(next)) out.add(next) && stack.push(next);
  return out;
}

test('carries and notCarried name only families the sources render (directly or transitively)', () => {
  const stale = [];
  for (const { family } of allFamilies()) {
    const rendered = renderedClosure(family.name);
    for (const other of [...(family.carries ?? []), ...Object.keys(family.notCarried ?? {})]) {
      familyByName(other);
      if (!rendered.has(other)) stale.push(`${family.name} -> ${other}`);
    }
  }
  assert.deepEqual(stale, []);
});

test('alsoImport lists every not-carried stylesheet an application must import, and only families with a stylesheet', () => {
  const problems = [];
  for (const { family } of allFamilies()) {
    const also = family.alsoImport ?? {};
    for (const [other, reason] of Object.entries(family.notCarried ?? {})) {
      const asks = /\bimport\b/.test(reason);
      if (asks && !(other in also)) problems.push(`${family.name}: notCarried ${other} asks for an import but is not in alsoImport`);
      if (!asks && other in also) problems.push(`${family.name}: alsoImport ${other} but its notCarried reason needs no import`);
    }
    for (const [other, when] of Object.entries(also)) {
      familyByName(other);
      if (stylesheetFiles(other).length === 0) problems.push(`${family.name}: alsoImport ${other} has no stylesheet`);
      if (when !== null && typeof when !== 'string') problems.push(`${family.name}: alsoImport ${other} must be null or a string`);
    }
  }
  assert.deepEqual(problems, []);
});

test('carried families are of other packages and expand without cycles', () => {
  for (const { family } of allFamilies()) assert.doesNotThrow(() => stylesheetFiles(family.name), family.name);
});

test('every stylesheet module is published: core/styles.css carries none of its modules twice, every other module is carried', () => {
  const base = new Set(coreBaseFiles().map(key));
  const carried = new Set(allFamilies().flatMap(({ family }) => stylesheetFiles(family.name).map(key)));
  const problems = [];
  for (const { family } of allFamilies()) for (const e of stylesheetFiles(family.name)) if (base.has(key(e))) problems.push(`${family.name} carries ${key(e)}, which @salmonui/core/styles.css ships`);
  for (const pkg of PACKAGES) {
    const dir = join(root, pkg.dir, 'styles');
    if (!existsSync(dir)) continue;
    const extra = new Set(Object.values(pkg.css ?? {}).flat().map((file) => `${pkg.name}:${file}`));
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
      const k = `${pkg.name}:${f.slice(0, -4)}`;
      if (!carried.has(k) && !extra.has(k)) problems.push(`${pkg.dir}/styles/${f} is in no published stylesheet`);
    }
  }
  assert.deepEqual(problems, []);
});

test('a carried module belongs to the family package or to a package it depends on', () => {
  const problems = [];
  for (const { pkg, family } of allFamilies()) {
    const allowed = new Set([pkg.name, ...pkg.deps, ...pkg.optionalPeers]);
    for (const entry of family.styles) {
      const m = styleModule(pkg.name, entry);
      if (!allowed.has(m.pkg)) problems.push(`${family.name}: ${entry} is of a package ${pkg.name} does not depend on`);
      else if (!existsSync(join(root, manifestOf(m.pkg).dir, 'styles', `${m.file}.css`))) problems.push(`${family.name}: ${entry} does not exist`);
    }
  }
  assert.deepEqual(problems, []);
  assert.deepEqual(styleModule('@salmonui/overlays', '@salmonui/core:dialog-core'), { pkg: '@salmonui/core', file: 'dialog-core' });
  assert.deepEqual(styleModule('@salmonui/overlays', 'dialog'), { pkg: '@salmonui/overlays', file: 'dialog' });
});

test('core/styles.css is the theme; control base modules are carried by the families that render them', () => {
  assert.deepEqual(coreBaseFiles().map(key), ['@salmonui/core:theme']);
  const has = (name, k) => stylesheetFiles(name).map(key).includes(k);
  for (const name of ['button', 'menu', 'dialog', 'scheduler', 'gantt', 'query-builder']) assert.ok(has(name, '@salmonui/buttons:button-core'), `${name} carries button-core`);
  // The PDF viewer leaves the Button rules to the Button stylesheet (its budget).
  assert.ok(!has('pdf-viewer', '@salmonui/buttons:button-core') && has('pdf-viewer', '@salmonui/buttons:menu'));
  for (const name of ['dialog', 'drawer', 'scheduler', 'gantt', 'pdf-viewer']) assert.ok(has(name, '@salmonui/core:dialog-core'), `${name} carries dialog-core`);
  for (const name of ['date-picker', 'date-range-picker', 'time-picker', 'scheduler', 'gantt']) assert.ok(has(name, '@salmonui/calendars:picker'), `${name} carries picker`);
  assert.ok(has('drawer', '@salmonui/core:drawer'));
  assert.ok(has('data-grid', '@salmonui/core:shimmer') && has('skeleton', '@salmonui/core:shimmer'));
  assert.ok(!has('calendar', '@salmonui/calendars:picker'));
});

test('the import scanner sees static, re-exported and lazy imports but not type-only ones', () => {
  const src = "import { a } from './a.js';\nexport { b } from '@salmonui/buttons/menu';\nimport type { C } from '@salmonui/overlays/dialog';\nconst d = () => import('@salmonui/navigation/toolbar');\n// import { e } from '@salmonui/x';\n";
  assert.deepEqual(importsOf(src), ['./a.js', '@salmonui/buttons/menu', '@salmonui/navigation/toolbar']);
  assert.equal(familyOfSpecifier('@salmonui/calendars/date-picker/data-grid').family.name, 'date-picker');
  assert.equal(familyOfSpecifier('@salmonui/data-grid/engine'), null);
  assert.equal(familyOfSpecifier('@salmonui/data-grid').family.name, 'data-grid');
});

test('every family entry with a stylesheet registers the development check with a class its stylesheet selects', () => {
  const coreCss = concatStyles(coreBaseFiles());
  const problems = [];
  for (const { pkg, family, specifier } of allFamilies()) {
    if (!family.styles.length) continue;
    const src = readFileSync(join(root, pkg.dir, 'src', family.entry), 'utf8');
    const m = /if \(process\.env\.NODE_ENV !== 'production'\) expectStylesheet\('([^']+)', '([^']+)'\);/.exec(src);
    if (!m) {
      problems.push(`${specifier}: no \`if (DEV) expectStylesheet(...)\` in src/${family.entry}`);
      continue;
    }
    if (m[1] !== specifier) problems.push(`${specifier}: registers ${m[1]}`);
    if (!`${concatStyles(stylesheetFiles(family.name))}\n${coreCss}`.includes(`.${m[2]}`)) problems.push(`${specifier}: no rule of its stylesheet or of core selects .${m[2]}`);
  }
  assert.deepEqual(problems, []);
});

test('a carried family brings its whole stylesheet, before the own rules', () => {
  const files = stylesheetFiles('pivot-table').map(key);
  for (const f of [...stylesheetFiles('data-grid'), ...stylesheetFiles('menu')].map(key)) assert.ok(files.includes(f), f);
  assert.equal(files.at(-1), '@salmonui/pivot-table:pivot-table');
  assert.equal(new Set(files).size, files.length);
});

test('layer ranks: a family outranks every module it composes, carries or lists as a shared base, and its exclusive modules keep their order', () => {
  const ranks = layerRanks();
  const rank = (e) => ranks.get(key(e));
  const problems = [];
  for (const { pkg, family } of allFamilies()) {
    const under = new Set([...(family.composes ?? []), ...(family.carries ?? [])].flatMap((o) => stylesheetFiles(o).map(key)));
    const exclusive = [];
    for (const entry of family.styles) {
      const m = styleModule(pkg.name, entry);
      if (rank(m) === undefined) continue;
      if (entry.includes(':')) under.add(key(m));
      else if (!under.has(key(m))) exclusive.push(m);
    }
    const below = stylesheetFiles(family.name).filter((e) => rank(e) !== undefined && under.has(key(e)));
    for (const x of exclusive) for (const u of below) if (rank(u) >= rank(x)) problems.push(`${family.name}: ${key(u)} (${rank(u)}) does not rank below ${key(x)} (${rank(x)})`);
    // Consecutive exclusive modules rank in order, or share a rank when every stylesheet carries them together in that order.
    for (let i = 0; i + 1 < exclusive.length; i++) {
      const [a, b] = [exclusive[i], exclusive[i + 1]];
      if (rank(a) < rank(b)) continue;
      const sheets = allFamilies().map((f) => stylesheetFiles(f.family.name).map(key));
      const together = sheets.every((s) => s.includes(key(a)) === s.includes(key(b)) && (!s.includes(key(a)) || s.indexOf(key(a)) < s.indexOf(key(b))));
      if (rank(a) > rank(b) || !together) problems.push(`${family.name}: ${key(a)} does not rank below ${key(b)}`);
    }
  }
  assert.deepEqual(problems, []);
  assert.equal(ranks.get('@salmonui/core:theme'), 0);
  // The extra stylesheets sit directly in `salmon`, above every sublayer.
  for (const k of ['@salmonui/charts:viz-rtl', '@salmonui/charts:viz-animations']) assert.equal(ranks.get(k), TOP, k);
  assert.match(layeredStyles([{ pkg: '@salmonui/charts', file: 'viz-rtl' }]), /^@layer salmon \{\n/);
  // The ten Data Grid modules always travel together: one rank, one block.
  assert.equal(new Set(stylesheetFiles('data-grid').map((e) => ranks.get(key(e))).filter((r) => r !== undefined)).size, 1);
  // The regressions this guards: a repeated shared module never ties the family rules it underlies.
  assert.ok(ranks.get('@salmonui/dropdowns:dropdown') < ranks.get('@salmonui/dropdowns:combobox'));
  assert.ok(ranks.get('@salmonui/inputs:choice-group') < ranks.get('@salmonui/inputs:rating'));
  assert.ok(ranks.get('@salmonui/buttons:button') < ranks.get('@salmonui/inputs:speech-to-text'));
});

test('layer names are short, unique and ordered; @keyframes-only modules stay unlayered', () => {
  assert.equal(layerName(TOP), LAYER);
  assert.equal(layerName(0), `${LAYER}.theme`);
  assert.equal(layerName(1), 'salmon.a');
  assert.equal(layerName(26), 'salmon.z');
  assert.equal(layerName(27), 'salmon.aa');
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => layerName(i))).size, 100);
  assert.ok(onlyKeyframes('/* c */\n@keyframes a { to { opacity: 0 } }\n@keyframes b-c { 0% { x: 1 } }'));
  assert.ok(!onlyKeyframes('@keyframes a { to { opacity: 0 } }\n.x { color: red }'));
  assert.ok(!onlyKeyframes('/* only a comment */'));
  const spinner = layeredStyles(stylesheetFiles('spinner'));
  assert.match(spinner, /^@layer salmon\.a(,salmon\.[a-z]+)*;\n/);
  assert.match(spinner, /\n@keyframes salmon-spin/);
});

test('every family stylesheet starts with a prefix of one layer order and declares every layer it uses', () => {
  const full = Array.from({ length: Math.max(...[...layerRanks().values()].filter((r) => r !== TOP)) }, (_, i) => layerName(i + 1));
  for (const { family } of allFamilies()) {
    const files = stylesheetFiles(family.name);
    if (!files.length) continue;
    const css = layeredStyles(files);
    const m = /^@layer ([^;{]+);\n/.exec(css);
    assert.ok(m, `${family.name}: no order statement`);
    const names = m[1].split(',');
    assert.deepEqual(names, full.slice(0, names.length), `${family.name}: the order statement is not a prefix`);
    for (const b of css.matchAll(/^@layer (salmon\.[a-z]+) \{$/gm)) assert.ok(names.includes(b[1]), `${family.name}: ${b[1]} is not declared`);
  }
  assert.match(layeredStyles(coreBaseFiles()), /^@layer salmon\.theme \{\n/);
});

test('the theme sets nothing a family module sets, so its place among the layers cannot change a computed value', () => {
  const themeProps = new Set([...concatStyles(coreBaseFiles()).matchAll(/(--salmon-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const problems = [];
  for (const pkg of PACKAGES) {
    const dir = join(root, pkg.dir, 'styles');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
      if (pkg.name === '@salmonui/core' && f === 'theme.css') continue;
      const css = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/(?:^|[;{\s])(--salmon-[a-z0-9-]+)\s*:/g)) if (themeProps.has(m[1])) problems.push(`${pkg.dir}/styles/${f} sets theme token ${m[1]}`);
      if (/data-salmon-theme/.test(css)) problems.push(`${pkg.dir}/styles/${f} selects the theme scope`);
    }
  }
  assert.deepEqual(problems, []);
});
