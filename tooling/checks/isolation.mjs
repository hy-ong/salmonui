// Component isolation: importing
// one component family never drags in another family, its CSS or a package
// the family's package does not depend on. Requires `npm run build`.
//
// tooling/checks/packages.manifest.mjs is the single source of truth:
// packages, their `deps` and `optionalPeers`, families with their `styles`,
// the same-package families each one `composes`, and the class prefixes each
// stylesheet module owns (`classes`). `--table` prints the "Packages and
// composition" Markdown table generated from it.
//
// Rules:
// - Module graph: every JavaScript subpath of every family is bundled with
//   `measureBundle()` from bundle-size.mjs (Vite 8 / Rolldown, lazy chunks
//   included, React external). A bundled module of the family's own package
//   must belong to the family, to a family it composes (transitively) or to
//   no family (package-shared code such as `internal/`). A module of another
//   package must belong to a package reachable through the manifest `deps`
//   and `optionalPeers`; one reachable only through an optional peer must
//   stay out of the initial chunks unless the family lists that package in
//   `peers`. Third-party modules are allowed only from the package's
//   `thirdParty` allow-list.
// - Import edges: every `@salmonui/*` specifier in a package's `src/` names
//   a package of its manifest `deps` (a `dependencies` entry of its
//   package.json) or `optionalPeers` (an optional `peerDependencies` entry),
//   and a subpath the target exports: a public one, or `./internal/*` of a
//   package the manifest marks `internal`. A `react: 'none'` package never
//   imports react or react-dom, and only a `platform: 'node'` package
//   (@salmonui/mcp) imports `node:*` builtins.
// - Private subpaths: examples, the docs site and the user-facing READMEs
//   never import `@salmonui/<pkg>/internal/*`.
// - Stylesheets: each family's `dist/<family>.css` uses only the class
//   prefixes of its own `styles` modules, of core and of the packages its
//   package may depend on. It is exactly the modules css-composition.mjs
//   computes (its own and the carried ones, in order), none of them of a
//   package outside its `deps` and `optionalPeers`, and none of them a
//   module that `@salmonui/core/styles.css` already ships (the application
//   imports that stylesheet once).
// - Direction: no stylesheet of a package (source and
//   dist) or of the docs site uses the `:dir()` pseudo-class. Bundlers that
//   target older browsers (Lightning CSS in Next.js by default) rewrite it
//   into `:lang()` lists, so `dir="rtl"` would never match.
//
// Violations present when the check landed would be listed in
// KNOWN_VIOLATIONS with a TODO: a listed violation is reported as a note, an
// unlisted one fails, and a listed one that no longer occurs is a warning
// (delete it). `--json` prints the violations as JSON.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { importsOf, packageName, readJson, reporter, root } from './lib.mjs';
import { coreBaseFiles, layeredStyles, stylesheetFiles } from './css-composition.mjs';
import { PACKAGES } from './packages.manifest.mjs';

const PEERS = ['react', 'react-dom'];

/**
 * Violations that existed when the check landed. Each entry matches one
 * violation by `kind`, `entry` (the subpath, source file or stylesheet) and
 * `target` (module path relative to the repository root, specifier or
 * `.salmon-*` class). Fix the cause, then delete the entry; never add one
 * for new code.
 */
export const KNOWN_VIOLATIONS = [];

const byName = (packages) => new Map(packages.map((p) => [p.name, p]));
const short = (name) => name.replace(/^@salmonui\//, '');

/** Packages reachable from `pkg` through `deps` (and `optionalPeers` with `optional`), excluding itself. */
export function dependencyClosure(pkg, packages = PACKAGES, { optional = true } = {}) {
  const index = byName(packages);
  const out = new Set();
  const visit = (p) => {
    for (const d of [...(p.deps ?? []), ...(optional ? (p.optionalPeers ?? []) : [])]) {
      if (out.has(d) || d === pkg.name) continue;
      out.add(d);
      const next = index.get(d);
      if (next) visit(next);
    }
  };
  visit(pkg);
  return out;
}

/** Same-package families `name` composes, transitively (excluding itself). */
export function composedFamilies(pkg, name) {
  const out = new Set();
  const visit = (n) => {
    for (const c of pkg.families.find((f) => f.name === n)?.composes ?? []) if (c !== name && !out.has(c)) (out.add(c), visit(c));
  };
  visit(name);
  return out;
}

const jsPath = (source) => source.replace(/\.tsx?$/, '.js');

/** The family of a file of `pkg` (path relative to `dist/`), or null for package-shared code. */
export function familyOfFile(pkg, rel) {
  if (pkg.families.length === 1) return pkg.families[0].name;
  for (const f of pkg.families) {
    const files = [f.entry, ...Object.values(f.subpaths ?? {})].map(jsPath);
    if (files.includes(rel) || rel.startsWith(`${f.name}/`)) return f.name;
  }
  return null;
}

/** Package name of a `node_modules` path (`.../node_modules/@scope/x/y.js` -> `@scope/x`). */
const nodeModulesPackage = (id) => {
  const rest = id.slice(id.lastIndexOf('node_modules/') + 'node_modules/'.length);
  return packageName(rest);
};

const allowsThirdParty = (pkg, name) => (pkg.thirdParty ?? []).some((t) => (t instanceof RegExp ? t.test(name) : t === name));

/**
 * Owner of one bundled module id (relative to the repository root):
 * `{ type: 'virtual' | 'peer' }`, `{ type: 'module', pkg, family }` (family
 * null for package-shared code), `{ type: 'third-party', name }` or
 * `{ type: 'unknown' }`.
 */
export function ownerOf(id, packages = PACKAGES) {
  // Bundler runtime helpers (`\0...`) and the generated consumer entry.
  if (id.startsWith('\0') || id.includes('node_modules/.cache/salmon-bundle-size/')) return { type: 'virtual' };
  const clean = id.replace(/^\0+/, '').replace(/\?.*$/, '');
  if (PEERS.some((p) => clean === p || clean.startsWith(`${p}/`) || clean.includes(`node_modules/${p}/`))) return { type: 'peer' };
  if (clean.includes('node_modules/')) {
    const name = nodeModulesPackage(clean);
    const pkg = packages.find((p) => p.name === name);
    if (!pkg) return { type: 'third-party', name };
    // A workspace package resolved through its node_modules link.
    const rel = clean.slice(clean.lastIndexOf(`node_modules/${name}/`) + `node_modules/${name}/`.length);
    return rel.startsWith('dist/') ? { type: 'module', pkg: pkg.name, family: familyOfFile(pkg, rel.slice(5)) } : { type: 'unknown' };
  }
  const pkg = packages.find((p) => clean.startsWith(`${p.dir}/`));
  if (!pkg) return { type: 'unknown' };
  const rel = clean.slice(pkg.dir.length + 1);
  if (!rel.startsWith('dist/')) return { type: 'unknown' };
  return { type: 'module', pkg: pkg.name, family: familyOfFile(pkg, rel.slice(5)) };
}

/** Every JavaScript entry of every family: `{ pkg, family, specifier }`. */
export function familyEntries(packages = PACKAGES) {
  return packages.flatMap((pkg) =>
    pkg.families.flatMap((family) => {
      const base = family.root ? pkg.name : `${pkg.name}/${family.name}`;
      return [base, ...Object.keys(family.subpaths ?? {}).map((s) => `${base}${s.slice(1)}`)].map((specifier) => ({ pkg, family, specifier }));
    }),
  );
}

/**
 * Violations of one family entry's bundled modules. `modules` and
 * `initialModules` are ids relative to the repository root (`initialModules`
 * the subset in the entry's initial chunks).
 */
export function moduleViolations({ entry, pkg, family, modules, initialModules = modules, packages = PACKAGES }) {
  const composed = composedFamilies(pkg, family.name);
  const reachable = dependencyClosure(pkg, packages);
  const required = dependencyClosure(pkg, packages, { optional: false });
  const initial = new Set(initialModules);
  const out = [];
  for (const id of modules) {
    const o = ownerOf(id, packages);
    if (o.type === 'virtual' || o.type === 'peer') continue;
    let reason = null;
    if (o.type === 'module' && o.pkg === pkg.name) {
      if (o.family !== null && o.family !== family.name && !composed.has(o.family)) reason = `family "${o.family}" is not composed by "${family.name}" (manifest \`composes\`)`;
    } else if (o.type === 'module') {
      if (!reachable.has(o.pkg)) reason = `package ${o.pkg} is not a dependency of ${pkg.name} (manifest \`deps\` / \`optionalPeers\`)`;
      else if (!required.has(o.pkg) && initial.has(id) && !(family.peers ?? []).includes(o.pkg))
        reason = `optional peer ${o.pkg} is in the initial chunks of ${entry}; load it lazily or list it in the family's \`peers\``;
    } else if (o.type === 'third-party') {
      if (!allowsThirdParty(pkg, o.name)) reason = `third-party package ${o.name} is not in the ${pkg.name} \`thirdParty\` allow-list`;
    } else reason = 'module belongs to no manifest package, peer or allowed third-party package';
    if (reason) out.push({ kind: 'module', entry, target: id, reason });
  }
  return out;
}

/** Families of `pkg` that a set of bundled module ids reaches (other than `family`). */
export function reachedFamilies(pkg, family, modules, packages = PACKAGES) {
  const out = new Set();
  for (const id of modules) {
    const o = ownerOf(id, packages);
    if (o.type === 'module' && o.pkg === pkg.name && o.family && o.family !== family.name) out.add(o.family);
  }
  return out;
}

/**
 * Violations of the `@salmonui/*` import specifiers of one source file of
 * `pkg`. `manifestJson` is the package's package.json; `exportsOf(name)`
 * returns another package's `exports` map.
 */
export function importEdgeViolations({ file, specs, pkg, manifestJson, exportsOf, packages = PACKAGES }) {
  const index = byName(packages);
  const out = [];
  const deps = manifestJson.dependencies ?? {};
  const peers = manifestJson.peerDependencies ?? {};
  const peerMeta = manifestJson.peerDependenciesMeta ?? {};
  for (const spec of new Set(specs)) {
    const fail = (reason) => out.push({ kind: 'import', entry: file, target: spec, reason });
    if (spec.startsWith('node:')) {
      if (pkg.platform !== 'node') fail(`${pkg.name} is not a platform "node" package; only those import Node builtins`);
      continue;
    }
    if (pkg.react === 'none' && /^react(-dom)?(\/|$)/.test(spec)) {
      fail(`${pkg.name} has \`react: 'none'\` in the manifest`);
      continue;
    }
    if (!spec.startsWith('@salmonui/')) continue;
    const name = packageName(spec);
    const sub = `.${spec.slice(name.length)}`;
    const target = index.get(name);
    if (!target) {
      fail(`${name} is not a package of the manifest`);
      continue;
    }
    if (name === pkg.name) {
      // A package may import its own public subpaths (the React layer of
      // data-grid over its separately compiled engine).
      if (!(sub in (exportsOf(name) ?? {}))) fail(`${name} does not export \`${sub}\`; import its own private modules relatively`);
      continue;
    }
    if ((pkg.deps ?? []).includes(name)) {
      if (!(name in deps)) fail(`${name} is a manifest dependency of ${pkg.name} but missing from its package.json "dependencies"`);
    } else if ((pkg.optionalPeers ?? []).includes(name)) {
      if (!(name in peers) || peerMeta[name]?.optional !== true) fail(`${name} is a manifest optional peer of ${pkg.name} but not an optional "peerDependencies" entry of its package.json`);
    } else {
      fail(`${name} is not in the manifest \`deps\` or \`optionalPeers\` of ${pkg.name}`);
      continue;
    }
    const exportsField = exportsOf(name) ?? {};
    if (sub === './internal' || sub.startsWith('./internal/')) {
      if (!target.internal) fail(`${name} does not expose \`./internal/*\` (manifest \`internal\`)`);
      else if (!('./internal/*' in exportsField)) fail(`${name} package.json has no \`./internal/*\` export`);
      continue;
    }
    if (!(sub in exportsField)) fail(`${name} does not export \`${sub}\``);
  }
  return out;
}

/** Specifiers of private subpaths (`@salmonui/<pkg>/internal...`) in a text. */
export const internalSpecifiers = (text) => [...text.matchAll(/@salmonui\/[a-z0-9-]+\/internal\b[\w./*-]*/g)].map((m) => m[0]);

/** Directories and files whose text must never import a private subpath. */
export const PUBLIC_SURFACES = ['examples', 'docs/site', 'README.md', ...PACKAGES.map((p) => `${p.dir}/README.md`)];
const SKIP_DIRS = new Set(['node_modules', '.next', '.next-export', 'out', 'dist', 'generated', 'test-results', 'playwright-report']);
const TEXT_FILE = /\.(m?[jt]sx?|mdx?|json|css|html)$/;

/** Text files of the public surfaces (paths relative to the repository root). */
export function publicSurfaceFiles(base = root) {
  const out = [];
  const walk = (rel) => {
    const abs = join(base, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(child);
      } else if (TEXT_FILE.test(e.name)) out.push(child);
    }
  };
  for (const s of PUBLIC_SURFACES) {
    if (s.endsWith('.md')) {
      if (existsSync(join(base, s))) out.push(s);
    } else walk(s);
  }
  return out;
}

/** Owner prefix table: `{ pkg, module, prefix }` for every manifest `classes` entry. */
export function classOwners(packages = PACKAGES) {
  return packages.flatMap((p) => Object.entries(p.classes ?? {}).flatMap(([module, prefixes]) => prefixes.map((prefix) => ({ pkg: p.name, module, prefix }))));
}

/** The stylesheet module owning a `.salmon-*` class (longest matching prefix), or null. */
export function classOwner(cls, owners) {
  const name = cls.replace(/^\./, '');
  let best = null;
  for (const o of owners) {
    const hit = name === o.prefix || name.startsWith(`${o.prefix}-`) || name.startsWith(`${o.prefix}_`);
    if (hit && (!best || o.prefix.length > best.prefix.length)) best = o;
  }
  return best;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * `.salmon-*` classes of one family stylesheet that belong to a module it
 * may not use: allowed are the family's own `styles` modules, every core
 * module and every module of the packages its package may depend on.
 */
export function cssSelectorViolations({ entry, pkg, styles, css, packages = PACKAGES }) {
  const owners = classOwners(packages);
  const reachable = dependencyClosure(pkg, packages);
  const classes = new Set([...stripComments(css).matchAll(/\.salmon-[a-z0-9_-]*[a-z0-9]/g)].map((m) => m[0]));
  const out = [];
  for (const cls of [...classes].sort()) {
    const o = classOwner(cls, owners);
    if (o && ((o.pkg === pkg.name && styles.includes(o.module)) || o.pkg === '@salmonui/core' || reachable.has(o.pkg))) continue;
    out.push({
      kind: 'css-selector',
      entry,
      target: cls,
      reason: o
        ? o.pkg === pkg.name
          ? `class of styles/${o.module}.css, which this stylesheet does not carry (manifest \`styles\`)`
          : `class of ${o.pkg} (styles/${o.module}.css), which ${pkg.name} does not depend on`
        : 'class matches no manifest `classes` prefix',
    });
  }
  return out;
}

/**
 * Composition violations of one family stylesheet: `files` are the
 * `{ pkg, file }` modules css-composition.mjs computes for it, `expected`
 * their layered text (`layeredStyles()`) and `css` the published file. A
 * module of a package `pkg` may not depend on, or one that `coreBase` (the modules of
 * `@salmonui/core/styles.css`) ships, fails; so does a published file that
 * is not exactly the computed modules.
 */
export function cssCompositionViolations({ entry, pkg, files, css, expected, coreBase = coreBaseFiles(), packages = PACKAGES }) {
  const reachable = dependencyClosure(pkg, packages);
  const out = [];
  for (const f of files) {
    const target = `${f.pkg}:${f.file}`;
    if (f.pkg !== pkg.name && !reachable.has(f.pkg)) out.push({ kind: 'css-foreign', entry, target, reason: `module of ${f.pkg}, which ${pkg.name} does not depend on` });
    else if (coreBase.some((b) => b.pkg === f.pkg && b.file === f.file)) out.push({ kind: 'css-core-base', entry, target, reason: 'module of @salmonui/core/styles.css; the application imports that stylesheet once' });
  }
  if (css !== expected) out.push({ kind: 'css-composition', entry, target: entry, reason: `is not the modules css-composition.mjs computes (${files.map((f) => `${f.pkg}:${f.file}`).join(', ')}); run \`npm run build\`` });
  return out;
}

const same = (a, b) => a.kind === b.kind && a.entry === b.entry && a.target === b.target;

/** Splits violations into new and known ones and finds stale known entries. */
export function classify(violations, known = KNOWN_VIOLATIONS) {
  return {
    fresh: violations.filter((v) => !known.some((k) => same(k, v))),
    known: violations.filter((v) => known.some((k) => same(k, v))),
    stale: known.filter((k) => !violations.some((v) => same(k, v))),
  };
}

/** Directories whose `.css` files (recursively) must not use `:dir()`. */
export const DIR_PSEUDO_ROOTS = [...PACKAGES.flatMap((p) => [`${p.dir}/styles`, `${p.dir}/dist`]), 'docs/site/app'];

/** `file:line` of every `:dir(` in the given stylesheets, comments included. */
export function dirPseudoViolations(files) {
  const out = [];
  for (const { file, css } of files) {
    css.split('\n').forEach((line, i) => {
      if (/:dir\(/i.test(line)) out.push(`${file}:${i + 1}`);
    });
  }
  return out;
}

/** The `.css` files under a directory, recursively (none when it does not exist). */
export function cssFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.css'))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

/** Errors of the manifest fields this check reads (unknown composed families, unknown style modules). */
export function manifestErrors(packages = PACKAGES, styleExists = () => true) {
  const errors = [];
  for (const p of packages) {
    const names = new Set(p.families.map((f) => f.name));
    for (const f of p.families) {
      for (const c of f.composes ?? []) if (!names.has(c)) errors.push(`${p.name} family "${f.name}" composes unknown family "${c}"`);
      for (const peer of f.peers ?? []) if (!(p.optionalPeers ?? []).includes(peer)) errors.push(`${p.name} family "${f.name}" lists peer ${peer}, which is not a package optional peer`);
    }
    for (const module of Object.keys(p.classes ?? {})) if (!styleExists(p, module)) errors.push(`${p.name} \`classes\` names styles/${module}.css, which does not exist`);
  }
  return errors;
}

/** The "Packages and composition" Markdown table generated from the manifest (`--table`). */
export function compositionTable(packages = PACKAGES) {
  const rows = packages.map((p) => {
    const families = p.families.length
      ? p.families
          .map((f) => {
            const subs = Object.keys(f.subpaths ?? {}).map((s) => `\`${s.slice(1)}\``);
            const label = f.root ? `${f.name} (root)` : f.name;
            return subs.length ? `${label} (+ ${subs.join(', ')})` : label;
          })
          .join(', ')
      : '-';
    const composes = p.families.filter((f) => f.composes?.length).map((f) => `${f.name} -> ${f.composes.join(', ')}`).join('; ') || '-';
    const deps = (p.deps ?? []).map(short).join(', ') || '-';
    const optional = (p.optionalPeers ?? []).map(short).join(', ') || '-';
    return `| \`${p.name}\` | ${families} | ${composes} | ${deps} | ${optional} |`;
  });
  return ['| Package | Families (subpaths) | Same-package composition | Dependencies | Optional peers |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}

const listSources = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && /\.(m?[jt]sx?)$/.test(e.name))
        .map((e) => join(e.parentPath, e.name))
    : [];

async function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--table')) {
    console.log(compositionTable());
    return;
  }
  const r = reporter('isolation');
  for (const p of PACKAGES) if (!existsSync(join(root, p.dir, 'dist'))) return void (console.error(`isolation: ${p.dir}/dist is missing; run \`npm run build\` first.`), process.exit(1));
  const { measureBundle } = await import('./bundle-size.mjs');
  for (const e of manifestErrors(PACKAGES, (p, m) => existsSync(join(root, p.dir, 'styles', `${m}.css`)))) r.fail(`manifest: ${e}`);
  const violations = [];
  const jsonOf = new Map(PACKAGES.map((p) => [p.name, readJson(join(root, p.dir, 'package.json'))]));

  // Import edges of every package's sources.
  for (const pkg of PACKAGES) {
    for (const file of listSources(join(root, pkg.dir, 'src'))) {
      const { static: stat, dynamic } = importsOf(readFileSync(file, 'utf8'));
      violations.push(...importEdgeViolations({ file: relative(root, file), specs: [...stat, ...dynamic], pkg, manifestJson: jsonOf.get(pkg.name), exportsOf: (n) => jsonOf.get(n)?.exports }));
    }
  }

  // Private subpaths on the public surfaces.
  for (const file of publicSurfaceFiles()) {
    for (const spec of new Set(internalSpecifiers(readFileSync(join(root, file), 'utf8')))) {
      violations.push({ kind: 'internal-import', entry: file, target: spec, reason: '`internal/*` subpaths are private to @salmonui packages (never in examples, the docs site or READMEs)' });
    }
  }

  // Module graphs of every family entry.
  const usedComposes = new Set();
  for (const { pkg, family, specifier } of familyEntries()) {
    const m = await measureBundle({ name: `isolation ${specifier}`, source: `export * as e0 from '${specifier}';\n`, external: PEERS });
    const rel = (id) => (id.startsWith(root) ? relative(root, id) : id);
    const modules = m.modules.map(rel);
    const initialModules = m.chunkList.filter((c) => c.initial).flatMap((c) => c.modules.map((x) => rel(x.id)));
    violations.push(...moduleViolations({ entry: specifier, pkg, family, modules, initialModules }));
    for (const f of reachedFamilies(pkg, family, modules)) usedComposes.add(`${pkg.name} ${family.name}->${f}`);
  }
  rmSync(join(root, 'node_modules/.cache/salmon-bundle-size'), { recursive: true, force: true });
  r.note(`bundled ${familyEntries().length} family entries of ${PACKAGES.filter((p) => p.families.length).length} packages`);
  for (const pkg of PACKAGES) {
    for (const f of pkg.families) {
      for (const c of f.composes ?? []) if (!usedComposes.has(`${pkg.name} ${f.name}->${c}`)) r.note(`${pkg.name}: family "${f.name}" composes "${c}" but bundles no "${c}" module (a CSS-only or type-only edge, or drop it)`);
    }
  }

  // Family stylesheets.
  for (const pkg of PACKAGES) {
    const sheets = [
      ...pkg.families.filter((f) => f.styles.length).map((f) => ({ name: `${f.name}.css`, styles: f.styles, files: stylesheetFiles(f.name) })),
      // Package-wide extra stylesheets (charts `viz-*.css`) may style every family of the package.
      ...Object.keys(pkg.css ?? {}).map((sub) => ({ name: sub.slice(2), styles: Object.keys(pkg.classes ?? {}) })),
    ];
    for (const sheet of sheets) {
      const file = join(root, pkg.dir, 'dist', sheet.name);
      const entry = `${pkg.dir}/dist/${sheet.name}`;
      if (!existsSync(file)) {
        r.fail(`${entry}: stylesheet does not exist`);
        continue;
      }
      const css = readFileSync(file, 'utf8');
      violations.push(...cssSelectorViolations({ entry, pkg, styles: sheet.styles, css }));
      if (sheet.files) violations.push(...cssCompositionViolations({ entry, pkg, files: sheet.files, css, expected: layeredStyles(sheet.files) }));
    }
  }

  const sheets = DIR_PSEUDO_ROOTS.flatMap((d) => cssFilesUnder(join(root, d))).map((file) => ({ file: relative(root, file), css: readFileSync(file, 'utf8') }));
  for (const at of dirPseudoViolations(sheets)) r.fail(`${at}: uses the :dir() pseudo-class; mirror through logical properties, the --salmon-dir sign or a [dir] attribute selector`);

  const { fresh, known, stale } = classify(violations);
  if (json) console.log(JSON.stringify({ fresh, known, stale }, null, 2));
  for (const v of known) r.note(`known violation (${v.kind}) ${v.entry}: ${v.target}; ${KNOWN_VIOLATIONS.find((k) => same(k, v)).todo}`);
  for (const k of stale) console.warn(`warning: stale KNOWN_VIOLATIONS entry (${k.kind}) ${k.entry}: ${k.target} no longer occurs; delete it`);
  for (const v of fresh) r.fail(`${v.kind} ${v.entry}: ${v.target}: ${v.reason}`);
  r.done();
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await main();
