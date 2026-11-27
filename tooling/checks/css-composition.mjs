// Family stylesheet composition (packages.manifest.mjs): which source files make up each published family
// stylesheet, and which families of other packages each family renders.
//
// An application imports `@salmonui/core/styles.css` once (the theme) plus
// the stylesheet of each family it uses. It never has to know what a family
// renders internally, so a family stylesheet carries:
//
// 1. the stylesheets of the families of other packages it lists in
//    `carries` (each expanded the same way, recursively), then
// 2. its own `styles` entries: files of its package's `styles/` folder
//    (this includes the same-package parts it renders) and
//    `<package>:<module>` stylesheet modules of a package it depends on
//    that its markup needs (the core a11y, shimmer, dialog-core and drawer
//    modules, the buttons button-core module).
//
// A file is carried once per stylesheet (first occurrence wins). Rules
// repeat across stylesheets when an application imports several families
// that carry the same module; identical rules are harmless and production
// CSS minifiers merge them. A module of `@salmonui/core/styles.css` is never
// carried.
//
// Cascade layers: a repeated module must not
// beat, by source order, the family rules of a stylesheet imported earlier
// (select.css repeating dropdown.css after combobox.css). So every module is
// emitted inside a sublayer of `@layer salmon` named by its rank in the
// composition graph (`layerRanks()`, `layerName()`): the theme is
// `salmon.theme`, a family's own rules rank above every module it composes,
// carries or lists as a shared base, and the package-wide extra stylesheets
// (charts `viz-*.css`) sit directly in `salmon`, above every sublayer. Every published
// family sheet starts with the order statement of `salmon.a` up to its
// highest rank: each is a prefix of one sequence, so the layer order is the
// same whichever sheet loads first. Layered rules lose to unlayered
// application CSS whatever the specificity.
//
// `renderedFamilies()` reads the import graph of a family's sources, so the
// CSS check can prove `carries` and `notCarried` complete.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { PACKAGES, allFamilies } from './packages.manifest.mjs';

export const root = new URL('../../', import.meta.url).pathname;

const byName = new Map(allFamilies().map((f) => [f.family.name, f]));

/** The manifest entry `{ pkg, family, specifier }` of a family name. */
export function familyByName(name) {
  const f = byName.get(name);
  if (!f) throw new Error(`css-composition: no family "${name}" in packages.manifest.mjs`);
  return f;
}

/**
 * The ordered source files of a family stylesheet as `{ pkg, file }`
 * (`file` is the basename under the package's `styles/` folder): the
 * composed families' files first, then the family's own, each file once.
 */
export function stylesheetFiles(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`css-composition: "${name}" carries itself`);
  const { pkg, family } = familyByName(name);
  const out = [];
  const add = (entry) => {
    if (!out.some((e) => e.pkg === entry.pkg && e.file === entry.file)) out.push(entry);
  };
  for (const other of family.carries ?? []) {
    if (familyByName(other).pkg === pkg) throw new Error(`css-composition: ${name} carries "${other}" of its own package; list its files in \`styles\``);
    for (const e of stylesheetFiles(other, new Set([...seen, name]))) add(e);
  }
  for (const entry of family.styles) add(styleModule(pkg.name, entry));
  return out;
}

/** A `styles` entry as `{ pkg, file }`: a bare name is a file of `pkgName`, `<package>:<module>` one of that package. */
export function styleModule(pkgName, entry) {
  const at = entry.indexOf(':');
  return at < 0 ? { pkg: pkgName, file: entry } : { pkg: entry.slice(0, at), file: entry.slice(at + 1) };
}

/** The `{ pkg, file }` modules of `@salmonui/core/styles.css`, which no family stylesheet carries. */
export function coreBaseFiles() {
  return PACKAGES.find((p) => p.name === '@salmonui/core').css['./styles.css'].map((file) => ({ pkg: '@salmonui/core', file }));
}

/** The CSS text of a list of `{ pkg, file }`, concatenated in order (never `@import`). */
export function concatStyles(files) {
  return files
    .map(({ pkg, file }) => {
      const path = join(root, PACKAGES.find((p) => p.name === pkg).dir, 'styles', `${file}.css`);
      if (!existsSync(path)) throw new Error(`${pkg}: missing styles/${file}.css`);
      return readFileSync(path, 'utf8');
    })
    .join('\n');
}

/** The cascade layer that holds every Salmon UI rule; its sublayers (`layerName()`) are internal. */
export const LAYER = 'salmon';
const fileKey = (e) => `${e.pkg}:${e.file}`;
let ranks = null;

/**
 * The layer rank of every stylesheet module, keyed `<package>:<file>`:
 * `0` for the `@salmonui/core/styles.css` modules (the theme), then from 1 the
 * longest path in the composition graph. A family's exclusive modules are
 * the files of its own package in its `styles` list that no family it
 * composes (`composes`, same package) or carries (`carries`) lists; edges
 * run between consecutive exclusive modules and from every module of a
 * composed or carried family, and from every shared base module the family
 * lists (`<package>:<module>`), to every exclusive module; the shared base
 * modules of one package it lists keep their order. So the rules a
 * family adds outrank everything it renders on top of in every stylesheet,
 * while unrelated modules (siblings a family happens to list in some order,
 * shared base modules such as `@salmonui/core:a11y`) stay low and keep the
 * order statement short. Consecutive exclusive modules that every
 * stylesheet carries together, in that order, share a rank. The
 * package-wide extra stylesheets get `TOP` (directly in `salmon`). Throws on
 * a cycle (two families list the same exclusive modules in opposite orders).
 */
export function layerRanks() {
  if (ranks) return ranks;
  const before = new Map();
  const edge = (a, b) => {
    if (a === b) return;
    if (!before.has(b)) before.set(b, new Set());
    before.get(b).add(a);
  };
  const theme = new Set(coreBaseFiles().map(fileKey));
  const modules = new Set();
  const chains = [];
  // `@keyframes`-only modules stay unlayered (`layeredStyles()`): no rank, no edges.
  const keyframes = new Map();
  const unranked = (m) => {
    const k = fileKey(m);
    if (!keyframes.has(k)) keyframes.set(k, onlyKeyframes(concatStyles([m])));
    return keyframes.get(k);
  };
  for (const { pkg, family } of byName.values()) {
    for (const e of stylesheetFiles(family.name)) if (!unranked(e)) modules.add(fileKey(e));
    const under = new Set([...(family.composes ?? []), ...(family.carries ?? [])].flatMap((other) => stylesheetFiles(other).filter((e) => !unranked(e)).map(fileKey)));
    const exclusive = [];
    const lastBase = new Map();
    for (const entry of family.styles) {
      const m = styleModule(pkg.name, entry);
      const k = fileKey(m);
      if (unranked(m)) continue;
      if (entry.includes(':')) {
        // Shared base modules of one package keep their listed order (dialog-core, then drawer).
        if (lastBase.has(m.pkg)) edge(lastBase.get(m.pkg), k);
        lastBase.set(m.pkg, k);
        under.add(k);
      } else if (!under.has(k)) exclusive.push(k);
    }
    for (let i = 0; i + 1 < exclusive.length; i++) chains.push([exclusive[i], exclusive[i + 1]]);
    for (let i = 0; i + 1 < exclusive.length; i++) edge(exclusive[i], exclusive[i + 1]);
    for (const a of under) for (const b of exclusive) edge(a, b);
  }
  // Consecutive exclusive modules that every stylesheet carries together, in
  // the same order, share a rank: each copy is the whole run, so the last
  // copy keeps their order (the Data Grid's ten modules are one block).
  const sheets = [...byName.values()].map(({ family }) => stylesheetFiles(family.name).map(fileKey));
  const members = (k) => sheets.filter((s) => s.includes(k));
  const rep = new Map();
  const find = (k) => (rep.has(k) && rep.get(k) !== k ? find(rep.get(k)) : k);
  for (const [a, b] of chains) {
    const sa = members(a);
    const sb = members(b);
    if (sa.length === sb.length && sa.every((s) => sb.includes(s) && s.indexOf(a) < s.indexOf(b))) rep.set(find(b), find(a));
  }
  const grouped = new Map();
  for (const [b, as] of before) {
    const rb = find(b);
    if (!grouped.has(rb)) grouped.set(rb, new Set());
    for (const a of as) if (find(a) !== rb) grouped.get(rb).add(find(a));
  }
  const out = new Map();
  const visiting = [];
  const rankOf = (k) => {
    if (out.has(k)) return out.get(k);
    if (visiting.includes(k)) throw new Error(`css-composition: layer cycle ${[...visiting.slice(visiting.indexOf(k)), k].join(' -> ')}`);
    visiting.push(k);
    let r = 1;
    for (const b of grouped.get(k) ?? []) r = Math.max(r, rankOf(b) + 1);
    visiting.pop();
    out.set(k, r);
    return r;
  };
  for (const k of theme) out.set(k, 0);
  for (const k of modules) out.set(k, rankOf(find(k)));
  // The package-wide extra stylesheets sit directly in `salmon`, which
  // outranks every sublayer, so they need no order statement.
  for (const pkg of PACKAGES) {
    for (const [sub, files] of Object.entries(pkg.css ?? {})) {
      if (pkg.name === '@salmonui/core' && sub === './styles.css') continue;
      for (const file of files) if (!out.has(`${pkg.name}:${file}`)) out.set(`${pkg.name}:${file}`, TOP);
    }
  }
  ranks = out;
  return out;
}

/** The rank of the rules placed directly in `salmon` (above every sublayer). */
export const TOP = Infinity;

/**
 * The layer name of a rank: `salmon` for `TOP`, `salmon.theme` for 0, then one letter per
 * rank (`salmon.a`, `salmon.b`, ..., `salmon.z`, `salmon.ba`, ...). Short,
 * because every published sheet repeats them (bundle budgets).
 */
export function layerName(rank) {
  if (rank === TOP) return LAYER;
  if (rank === 0) return `${LAYER}.theme`;
  let name = '';
  for (let n = rank - 1; ; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(97 + (n % 26)) + name;
    if (n < 26) break;
  }
  return `${LAYER}.${name}`;
}

/** Whether CSS text holds only `@keyframes` rules (and comments). */
export function onlyKeyframes(css) {
  let text = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!text) return false;
  while (text) {
    const m = /^@keyframes\s+[\w-]+\s*\{/.exec(text);
    if (!m) return false;
    let depth = 1;
    let i = m[0].length;
    for (; i < text.length && depth; i++) depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
    if (depth) return false;
    text = text.slice(i).trim();
  }
  return true;
}

/**
 * The published text of a stylesheet of `{ pkg, file }` modules: the order
 * statement of the family sublayers up to its highest rank, then each module
 * inside its `@layer` block, by rank and in source order within a rank. The theme sheet needs no
 * statement: it is the one `salmon.theme` module and is imported first; its
 * selectors match no rule of a family module (css-composition.test), so its
 * place among the sublayers cannot change a computed value. A module of
 * `@keyframes` only stays unlayered: it cannot override a rule, and the
 * wrapper would cost bytes.
 */
export function layeredStyles(files) {
  if (!files.length) return '';
  const all = layerRanks();
  const rankOf = (f) => all.get(fileKey(f)) ?? 0;
  const top = Math.max(0, ...files.map(rankOf).filter((r) => r !== TOP));
  const out = top > 0 ? [`@layer ${Array.from({ length: top }, (_, i) => layerName(i + 1)).join(',')};`] : [];
  // A stable sort by rank keeps the cascade (layer order decides between ranks,
  // source order within one) and lets minifiers merge the blocks of one layer.
  for (const f of [...files].sort((a, b) => (rankOf(a) > rankOf(b)) - (rankOf(a) < rankOf(b)))) {
    const css = concatStyles([f]);
    const rank = all.get(fileKey(f));
    if (rank === undefined && !onlyKeyframes(css)) throw new Error(`css-composition: ${fileKey(f)} has no layer rank`);
    out.push(rank === undefined ? css : `@layer ${layerName(rank)} {\n${css}\n}`);
  }
  return `${out.join('\n')}\n`;
}

const SOURCE_EXT = ['.ts', '.tsx'];

function resolveRelative(from, spec) {
  const base = normalize(join(dirname(from), spec)).replace(/\.js$/, '');
  for (const candidate of [...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => join(base, `index${e}`))]) if (existsSync(candidate)) return candidate;
  return null;
}

// Value imports only: `import type` / `export type` carry no runtime code and no markup.
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every module specifier a source file imports at runtime (static and dynamic). */
export function importsOf(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) out.push(m[1] ?? m[2]);
  return out;
}

/**
 * The family a public `@salmonui/*` specifier belongs to (its entry or a
 * subpath of it), or null. `@salmonui/<pkg>/internal/<family>` is the bare
 * component of that family re-exported for other @salmonui packages
 * (`@salmonui/dropdowns/internal/select`): it renders the family's markup too.
 */
export function familyOfSpecifier(spec) {
  const bare = /^(@salmonui\/[a-z0-9-]+)\/internal\/([a-z0-9-]+)$/.exec(spec);
  if (bare) {
    const f = byName.get(bare[2]);
    if (f && f.pkg.name === bare[1]) return f;
  }
  let best = null;
  for (const f of byName.values()) {
    if ((spec === f.specifier || spec.startsWith(`${f.specifier}/`)) && (!best || f.specifier.length > best.specifier.length)) best = f;
  }
  // A package root specifier also prefixes its subpaths (`@salmonui/data-grid/engine` is not the grid family).
  if (best && best.family.root && spec !== best.specifier) {
    const sub = `.${spec.slice(best.specifier.length)}`;
    if (!Object.keys(best.family.subpaths ?? {}).includes(sub)) return null;
  }
  return best;
}

const entryFiles = (pkg, family) => [family.entry, ...Object.values(family.subpaths ?? {})].map((e) => join(root, pkg.dir, 'src', e));

/**
 * The other families a family renders: the families whose entries its
 * sources import (statically or lazily), following relative imports inside
 * its package from the family entry. A family of another package is reached
 * through its public specifier, one of the same package through a relative
 * import of its entry file.
 */
export function renderedFamilies(name) {
  const { pkg, family } = familyByName(name);
  // A file of another family of the package: its entry or subpath files, or a file under `src/<name>/`.
  const others = pkg.families.filter((f) => f !== family);
  const ownerOf = (file) => others.find((f) => entryFiles(pkg, f).includes(file) || file.startsWith(join(root, pkg.dir, 'src', f.name) + '/'))?.name;
  // Private `#name` imports resolve through the package's `imports` map.
  const pkgJson = JSON.parse(readFileSync(join(root, pkg.dir, 'package.json'), 'utf8'));
  const privateImport = (spec) => {
    const target = pkgJson.imports?.[spec];
    const path = typeof target === 'string' ? target : (target?.types ?? target?.import ?? target?.default);
    return path ? resolveRelative(join(root, pkg.dir, 'x'), path.replace(/^\.\/dist\//, './src/').replace(/\.d\.ts$/, '.js')) : null;
  };
  const seen = new Set();
  const found = new Set();
  const stack = entryFiles(pkg, family).filter((e) => existsSync(e));
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.') || spec.startsWith('#')) {
        const next = spec.startsWith('#') ? privateImport(spec) : resolveRelative(file, spec);
        if (!next) continue;
        const owner = ownerOf(next);
        if (owner) found.add(owner);
        stack.push(next);
        continue;
      }
      if (!spec.startsWith('@salmonui/')) continue;
      const f = familyOfSpecifier(spec);
      if (f && f.family !== family) found.add(f.family.name);
    }
  }
  return [...found].sort();
}
