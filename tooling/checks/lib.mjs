// Shared helpers for the dependency-free tooling checks.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { PACKAGES } from './packages.manifest.mjs';

export const root = new URL('../../', import.meta.url).pathname;

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Published workspace packages (`packages/*`). */
export function workspacePackages() {
  const dir = join(root, 'packages');
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, 'package.json')))
    .map((name) => ({ dir: join(dir, name), rel: `packages/${name}`, pkg: readJson(join(dir, name, 'package.json')) }));
}

/**
 * Manifest packages (packages.manifest.mjs) whose directory has a
 * package.json, in manifest order: `{ manifest, dir, rel, pkg }`. Directories
 * that are not in the manifest (stale build output) are ignored.
 */
export function manifestPackages() {
  return PACKAGES.filter((m) => existsSync(join(root, m.dir, 'package.json'))).map((m) => ({
    manifest: m,
    dir: join(root, m.dir),
    rel: m.dir,
    pkg: readJson(join(root, m.dir, 'package.json')),
  }));
}

/**
 * Built file of a bare `@salmonui/*` specifier (a manifest package), through
 * that package's `exports` map (`import`, then `default`; `*` patterns
 * included). Returns null for other specifiers or unexported subpaths.
 */
export function resolveWorkspaceSpecifier(spec, conditions = ['import', 'default']) {
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  const m = PACKAGES.find((p) => p.name === name);
  if (!m) return null;
  const manifest = join(root, m.dir, 'package.json');
  if (!existsSync(manifest)) return null;
  const exportsField = readJson(manifest).exports ?? {};
  const subpath = spec === name ? '.' : `.${spec.slice(name.length)}`;
  let value = exportsField[subpath];
  let star = null;
  if (value === undefined) {
    for (const [key, v] of Object.entries(exportsField)) {
      const at = key.indexOf('*');
      if (at < 0) continue;
      const [pre, post] = [key.slice(0, at), key.slice(at + 1)];
      if (subpath.startsWith(pre) && subpath.endsWith(post) && subpath.length >= pre.length + post.length) {
        value = v;
        star = subpath.slice(pre.length, subpath.length - post.length);
        break;
      }
    }
  }
  const pick = (v) => {
    if (typeof v === 'string') return v;
    if (!v || typeof v !== 'object') return null;
    for (const [key, inner] of Object.entries(v)) if (conditions.includes(key)) return pick(inner);
    return null;
  };
  const target = pick(value);
  if (!target || target.endsWith('.d.ts')) return null;
  const file = join(root, m.dir, star === null ? target : target.replace('*', star));
  return existsSync(file) ? file : null;
}

/** Private example apps (`examples/*`). */
export function examplePackages() {
  const dir = join(root, 'examples');
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, 'package.json')))
    .map((name) => ({ dir: join(dir, name), rel: `examples/${name}`, pkg: readJson(join(dir, name, 'package.json')) }));
}

/** Flattens an `exports` map to `{ subpath, condition, target }` entries. */
export function exportTargets(exportsField) {
  const out = [];
  const walk = (subpath, value, condition) => {
    if (typeof value === 'string') out.push({ subpath, condition, target: value });
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(subpath, v, k);
  };
  for (const [subpath, value] of Object.entries(exportsField ?? {})) walk(subpath, value, 'default');
  return out;
}

/**
 * Package-relative files (`dist/internal/a/b.js`) that a `*` export target
 * (`./dist/internal/*.js`) matches among `files`, with the matched part
 * (`a/b`). Node lets `*` match any string, `/` included.
 */
export function expandExportPattern(target, files) {
  const [pre, post, ...rest] = target.replace(/^\.\//, '').split('*');
  if (post === undefined || rest.length) return [];
  return [...files]
    .filter((f) => f.length > pre.length + post.length && f.startsWith(pre) && f.endsWith(post))
    .map((f) => ({ file: f, match: f.slice(pre.length, f.length - post.length) }));
}

/** Whether `subpath` (`.`, `./chart`, `./internal/x`) is exported by an `exports` map, wildcard keys included. */
export function exportsSubpath(exportsField, subpath) {
  return Object.keys(exportsField ?? {}).some((key) => {
    if (!key.includes('*')) return key === subpath;
    const [pre, post] = key.split('*');
    return subpath.length > pre.length + post.length && subpath.startsWith(pre) && subpath.endsWith(post);
  });
}

/** Removes comments and string/template literal contents so only code identifiers remain. */
export function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

const STATIC_IMPORT = /(?:^|[\n;])\s*(?:import|export)\s*(?:type\s+)?(?:[\w*${}\s,]+?\s*from\s*)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// A relative module URL (`new Worker(new URL('./worker.js', import.meta.url))`, the bundler
// worker pattern of @salmonui/pdf-viewer): a dynamic edge to that module.
const MODULE_URL = /\bnew\s+URL\s*\(\s*['"](\.\.?\/[^'"]+\.m?js)['"]\s*,\s*import\.meta\.url\s*\)/g;

/** Static and dynamic import specifiers of one ES module (or `.d.ts`) file. */
export function importsOf(text) {
  const stat = [...text.matchAll(STATIC_IMPORT)].map((m) => m[1]);
  const dyn = [...text.matchAll(DYNAMIC_IMPORT), ...text.matchAll(MODULE_URL)].map((m) => m[1]);
  return { static: stat, dynamic: dyn };
}

const resolveRelative = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

/** Nearest `package.json` at or above a file's directory. */
function owningManifest(file) {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Targets of a private package import (`#name`, the `imports` field of the
 * importing file's package.json). With `conditions` the first matching key
 * wins (Node and bundler semantics, key order); with `null` every target of
 * the entry is returned, so a reachability walk covers every environment.
 */
export function privateImportTargets(from, spec, conditions = null) {
  const manifest = owningManifest(from);
  if (!manifest) return [];
  const entry = readJson(manifest).imports?.[spec];
  if (entry === undefined) return [];
  const out = [];
  const pick = (value) => {
    if (typeof value === 'string') return void out.push(resolve(dirname(manifest), value));
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (conditions === null) pick(v);
      else if (key === 'default' || conditions.includes(key)) return void pick(v);
    }
  };
  pick(entry);
  return [...new Set(out)];
}

/**
 * Relative import graph from an entry file. `packages` collects bare
 * specifiers with the importing file; `missing` collects unresolved
 * relative specifiers. Private `#` imports resolve through the owning
 * package.json `imports` field: with `conditions` (for example
 * `['browser', 'import']`) to the target a resolver would pick, otherwise to
 * every target. `privateEdges` records each `#` edge and its targets.
 */
//
// `resolvePackage(spec)` (optional) maps a bare specifier to a file to walk
// into (for example `resolveWorkspaceSpecifier`, to follow other @salmonui
// packages); such edges are recorded in `packageEdges` instead of `packages`.
// `via` maps each reached file to the file that first imported it
// (`importChain` turns it into a readable chain).
export function importGraph(entry, { followDynamic = true, conditions = null, stopAt = null, resolvePackage = null } = {}) {
  const files = new Set();
  const packages = [];
  const packageEdges = [];
  const missing = [];
  const privateEdges = [];
  const via = new Map();
  const visit = (file, parent = null) => {
    if (files.has(file)) return;
    files.add(file);
    if (parent) via.set(file, parent);
    if (!/\.(m?js|ts)$/.test(file)) return;
    const text = readFileSync(file, 'utf8');
    // `stopAt(file, text)`: keep the module in `files` but do not walk its imports (a "use client" island).
    if (stopAt && file !== entry && stopAt(file, text)) return;
    const { static: stat, dynamic } = importsOf(text);
    for (const [spec, kind] of [...stat.map((s) => [s, 'static']), ...dynamic.map((s) => [s, 'dynamic'])]) {
      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec);
        if (!target) missing.push({ from: relative(root, file), spec });
        else if (kind === 'static' || followDynamic) visit(target, file);
      } else if (spec.startsWith('#')) {
        const targets = privateImportTargets(file, spec, conditions).filter((t) => existsSync(t));
        if (!targets.length) missing.push({ from: relative(root, file), spec });
        privateEdges.push({ from: relative(root, file), spec, kind, targets: targets.map((t) => relative(root, t)) });
        if (kind === 'static' || followDynamic) for (const t of targets) visit(t, file);
      } else {
        const target = resolvePackage ? resolvePackage(spec) : null;
        if (target === null) packages.push({ spec, from: relative(root, file), kind });
        else {
          packageEdges.push({ spec, from: relative(root, file), kind, target: relative(root, target) });
          if (kind === 'static' || followDynamic) visit(target, file);
        }
      }
    }
  };
  visit(entry);
  return { files: [...files], packages, packageEdges, missing, privateEdges, via };
}

/** `entry -> ... -> file` through an `importGraph` result's `via` map, as root-relative paths. */
export function importChain(graph, file) {
  const abs = file.startsWith('/') ? file : join(root, file);
  const chain = [abs];
  for (let f = abs; graph.via.has(f); ) chain.unshift((f = graph.via.get(f)));
  return chain.map((f) => relative(root, f)).join(' -> ');
}

/** All files under a directory, relative to it. */
export function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

/** Package name of a bare specifier (`@scope/name/sub` -> `@scope/name`). */
export const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

/** Collects failures and prints a uniform result line. */
export function reporter(name) {
  const failures = [];
  const notes = [];
  return {
    fail: (msg) => failures.push(msg),
    note: (msg) => notes.push(msg),
    check: (ok, msg) => {
      if (!ok) failures.push(msg);
    },
    done() {
      for (const n of notes) console.log(`note: ${n}`);
      for (const f of failures) console.error(`error: ${f}`);
      if (failures.length) {
        console.error(`${name}: FAILED (${failures.length})`);
        process.exit(1);
      }
      console.log(`${name}: OK`);
    },
  };
}

export function requireBuild(name) {
  for (const p of workspacePackages()) {
    if (!existsSync(join(p.dir, 'dist'))) {
      console.error(`${name}: ${p.rel}/dist is missing; run \`npm run build\` first.`);
      process.exit(1);
    }
  }
}
