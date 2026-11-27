// pack:check: the published shape of every package. Requires `npm run build`.
//
// Per published package:
// - `npm pack --dry-run --json` contents are only dist/, README.md, LICENSE,
//   package.json; README.md and LICENSE are present;
// - every `exports` target is in the tarball;
// - every dist file is reachable from the exports map (JS and .d.ts import
//   graphs, their source maps, exported CSS);
// - manifest rules: ESM only, `sideEffects` false or CSS only, `files`
//   whitelist, `types` + `import` on every JS subpath, no wildcard subpaths
//   except `./internal/*` -> `./dist/internal/*.{d.ts,js}` on the packages
//   `packages.manifest.mjs` marks `internal` (private to @salmonui packages,
//   not semver), whose pattern must match files in the tarball;
// - `bin` matches the manifest `bin` (`./dist/<entry>.js`), each target is in
//   the tarball, starts with a `#!/usr/bin/env node` line and counts as an
//   entry for reachability;
// - the manifest `data` files (`dist/index.json` of @salmonui/mcp) are in the
//   tarball and count as reachable without a source map;
// - every subpath resolves under Node ESM and a deep `dist/` import does not;
// - no published file carries planning text: tracking IDs, work-package
//   labels, other vendors' names (`no-planning-tokens.mjs`).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { checkNoPlanningTokens } from './no-planning-tokens.mjs';
import { expandExportPattern, exportTargets, importGraph, importsOf, listFiles, reporter, requireBuild, root, workspacePackages } from './lib.mjs';
import { PACKAGES } from './packages.manifest.mjs';

const r = reporter('pack:check');
requireBuild('pack:check');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ALLOWED_TOP = new Set(['package.json', 'README.md', 'LICENSE']);
// The one wildcard export, allowed only on packages the manifest marks `internal`.
const INTERNAL_SUBPATH = './internal/*';
const INTERNAL_EXPORT = { types: './dist/internal/*.d.ts', import: './dist/internal/*.js' };
const internalPackages = new Set(PACKAGES.filter((m) => m.internal).map((m) => m.name));

/** `.d.ts` import graph: `./x.js` specifiers map to `./x.d.ts`. */
function dtsGraph(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const { static: stat, dynamic } = importsOf(readFileSync(file, 'utf8'));
    const typeImports = [...readFileSync(file, 'utf8').matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    for (const spec of [...stat, ...dynamic, ...typeImports]) {
      if (!spec.startsWith('.')) continue;
      const base = join(dirname(file), spec).replace(/\.js$/, '');
      for (const candidate of [`${base}.d.ts`, join(base, 'index.d.ts')]) if (existsSync(candidate)) visit(candidate);
    }
  };
  visit(entry);
  return seen;
}

const manifestNames = new Set(PACKAGES.map((m) => m.name));
for (const p of workspacePackages()) {
  const { pkg } = p;
  const name = pkg.name;
  const m = PACKAGES.find((x) => x.name === name);
  if (!m) {
    r.note(`${p.rel}: ${name} is not in packages.manifest.mjs; skipped`);
    continue;
  }

  // Manifest.
  r.check(pkg.type === 'module', `${name}: "type" must be "module"`);
  const se = pkg.sideEffects;
  r.check(se === false || (Array.isArray(se) && se.every((g) => /\.css$/.test(g))), `${name}: "sideEffects" must be false or CSS globs only, found ${JSON.stringify(se)}`);
  r.check(JSON.stringify([...(pkg.files ?? [])].sort()) === JSON.stringify(['LICENSE', 'README.md', 'dist']), `${name}: "files" must be exactly ["dist", "README.md", "LICENSE"], found ${JSON.stringify(pkg.files)}`);
  r.check(!('main' in pkg) && !('module' in pkg) && !('browser' in pkg), `${name}: use "exports" only (no main/module/browser)`);
  r.check(pkg.exports && typeof pkg.exports === 'object', `${name}: missing "exports" map`);
  r.check(pkg.exports?.['./package.json'] === './package.json', `${name}: exports must include "./package.json"`);
  for (const [subpath, value] of Object.entries(pkg.exports ?? {})) {
    if (subpath.includes('*') || JSON.stringify(value).includes('*')) {
      if (!internalPackages.has(name)) r.fail(`${name}: wildcard export ${subpath} exposes deep imports (only packages marked internal in packages.manifest.mjs may export ${INTERNAL_SUBPATH})`);
      else r.check(subpath === INTERNAL_SUBPATH && JSON.stringify(value) === JSON.stringify(INTERNAL_EXPORT), `${name}: wildcard export ${subpath} must be exactly "${INTERNAL_SUBPATH}": ${JSON.stringify(INTERNAL_EXPORT)}`);
    }
    if (typeof value === 'string') {
      r.check(subpath === './package.json' || value.endsWith('.css'), `${name}: export ${subpath} must use { types, import } conditions`);
    } else {
      const keys = Object.keys(value);
      r.check(keys[0] === 'types' && keys.includes('import'), `${name}: export ${subpath} must list "types" first and "import" (found ${keys.join(', ')})`);
      r.check(!keys.includes('require'), `${name}: export ${subpath} has a "require" condition; packages are ESM only`);
    }
  }
  for (const f of ['README.md', 'LICENSE']) r.check(existsSync(join(p.dir, f)), `${name}: ${f} is missing`);
  // Executables: exactly the manifest `bin`, each `./dist/<entry>.js`.
  const expectedBin = Object.fromEntries(Object.entries(m.bin ?? {}).map(([cmd, src]) => [cmd, `./dist/${src.replace(/\.tsx?$/, '.js')}`]));
  const bin = typeof pkg.bin === 'string' ? { [name.split('/').pop()]: pkg.bin } : (pkg.bin ?? {});
  r.check(JSON.stringify(bin) === JSON.stringify(expectedBin), `${name}: "bin" must be ${JSON.stringify(expectedBin)} (packages.manifest.mjs \`bin\`), found ${JSON.stringify(pkg.bin ?? {})}`);

  // Tarball contents.
  let packed;
  try {
    packed = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts', '--workspace', name], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
  } catch (error) {
    r.fail(`${name}: npm pack --dry-run failed: ${error.stderr ?? error.message}`);
    continue;
  }
  const files = new Set(packed.files.map((f) => f.path));
  for (const f of files) {
    if (!ALLOWED_TOP.has(f) && !f.startsWith('dist/')) r.fail(`${name}: tarball contains ${f} (only dist/, README.md, LICENSE, package.json allowed)`);
    if (/\.tsbuildinfo$|(^|\/)tests?\//.test(f)) r.fail(`${name}: tarball contains build or test artifact ${f}`);
  }
  for (const f of ALLOWED_TOP) r.check(files.has(f), `${name}: tarball is missing ${f}`);

  // Dependency-exception packages: third-party
  // code is installed by npm, never vendored into the tarball, so its LICENSE and
  // NOTICE files travel with it; the README points to THIRD_PARTY_LICENSES.md,
  // where deps:check verifies every license and reproduced NOTICE.
  const thirdParty = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@salmonui/'));
  if (thirdParty.length) {
    for (const f of files) if (/(^|\/)node_modules\/|(^|\/)NOTICE/i.test(f)) r.fail(`${name}: tarball vendors third-party file ${f}`);
    const readme = existsSync(join(p.dir, 'README.md')) ? readFileSync(join(p.dir, 'README.md'), 'utf8') : '';
    r.check(readme.includes('THIRD_PARTY_LICENSES.md'), `${name}: README.md must point to THIRD_PARTY_LICENSES.md for its third-party licenses and notices`);
  }

  // Export targets present; a `*` target expands to the tarball files it matches.
  const targets = [];
  for (const t of exportTargets(pkg.exports)) {
    if (!t.target.includes('*')) {
      targets.push(t);
      r.check(files.has(posix.normalize(t.target)), `${name}: export ${t.subpath} (${t.condition}) -> ${t.target} is not in the tarball`);
      continue;
    }
    const matches = expandExportPattern(t.target, files);
    r.check(matches.length > 0, `${name}: wildcard export ${t.subpath} (${t.condition}) -> ${t.target} matches no file in the tarball`);
    for (const x of matches) targets.push({ ...t, subpath: t.subpath.replace('*', x.match), target: `./${x.file}`, pattern: t.subpath });
  }
  for (const [cmd, target] of Object.entries(bin)) {
    const file = posix.normalize(target);
    if (!files.has(file)) {
      r.fail(`${name}: bin ${cmd} -> ${target} is not in the tarball`);
      continue;
    }
    targets.push({ subpath: `bin ${cmd}`, condition: 'bin', target });
    const abs = join(p.dir, file);
    if (existsSync(abs)) r.check(readFileSync(abs, 'utf8').startsWith('#!/usr/bin/env node\n'), `${name}: bin ${cmd} (${target}) must start with "#!/usr/bin/env node"`);
  }
  // Bundled data files (read through `new URL(..., import.meta.url)`, no source map).
  const dataFiles = (m.data ?? []).map((f) => `dist/${f}`);
  for (const f of dataFiles) r.check(files.has(f), `${name}: data file ${f} is not in the tarball${name === '@salmonui/mcp' ? ' (run `npm run mcp:index` after the build)' : ''}`);
  if (internalPackages.has(name)) r.check(INTERNAL_SUBPATH in (pkg.exports ?? {}), `${name}: marked internal in packages.manifest.mjs but exports no ${INTERNAL_SUBPATH}`);

  // Private imports (`#name`): targets are in
  // the tarball, server and worker conditions come before `browser`, and
  // `default` is last.
  for (const [spec, value] of Object.entries(pkg.imports ?? {})) {
    r.check(spec.startsWith('#') && !spec.includes('*'), `${name}: private import ${spec} must be a "#" name without wildcards`);
    for (const t of exportTargets({ [spec]: value })) r.check(files.has(posix.normalize(t.target)), `${name}: import ${spec} (${t.condition}) -> ${t.target} is not in the tarball`);
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      r.check(keys[keys.length - 1] === 'default', `${name}: import ${spec} must end with "default" (found ${keys.join(', ')})`);
      const browser = keys.indexOf('browser');
      for (const k of ['workerd', 'worker', 'edge-light']) if (keys.includes(k) && browser !== -1) r.check(keys.indexOf(k) < browser, `${name}: import ${spec} lists "${k}" after "browser"; server and worker conditions must come first`);
    }
  }

  // Reachability of dist files from the exports map.
  const reachable = new Set();
  for (const t of targets) {
    const abs = join(p.dir, t.target);
    if (!existsSync(abs)) continue;
    if (t.target.endsWith('.js')) for (const f of importGraph(abs).files) reachable.add(f);
    else if (t.target.endsWith('.d.ts')) for (const f of dtsGraph(abs)) reachable.add(f);
    else reachable.add(abs);
  }
  for (const f of [...reachable]) {
    reachable.add(`${f}.map`);
    if (f.endsWith('.js')) {
      // A runtime module's declarations are reachable through its types.
      for (const d of dtsGraph(f.replace(/\.js$/, '.d.ts'))) reachable.add(d), reachable.add(`${d}.map`);
    }
    if (f.endsWith('.d.ts')) {
      // Type-only modules compile to an empty `.js` that nothing imports at
      // runtime; it ships alongside its declarations.
      const js = f.replace(/\.d\.ts$/, '.js');
      if (existsSync(js) && readFileSync(js, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/export\s*\{\s*\};?/, '').trim() === '') reachable.add(js), reachable.add(`${js}.map`);
    }
  }
  for (const f of dataFiles) reachable.add(join(p.dir, f));
  const unreachable = listFiles(join(p.dir, 'dist')).filter((f) => !reachable.has(join(p.dir, 'dist', f)));
  for (const f of unreachable) r.fail(`${name}: dist/${f} is not reachable from the exports map`);

  // Node ESM resolution: every subpath resolves (a wildcard through one file
  // it matches), deep imports do not.
  const subpaths = Object.keys(pkg.exports ?? {}).flatMap((s) => {
    if (!s.includes('*')) return [s === '.' ? name : `${name}/${s.slice(2)}`];
    const one = targets.find((t) => t.pattern === s && t.condition === 'import');
    return one ? [`${name}/${one.subpath.slice(2)}`] : [];
  });
  const deep = [`${name}/dist/index.js`, `${name}/src/index.ts`];
  const probe = `
const bad = [];
for (const s of ${JSON.stringify(subpaths)}) { try { import.meta.resolve(s); } catch (e) { bad.push('does not resolve: ' + s + ' (' + e.code + ')'); } }
for (const s of ${JSON.stringify(deep)}) { try { import.meta.resolve(s); bad.push('deep import resolves: ' + s); } catch {} }
if (bad.length) { console.error(bad.join('\\n')); process.exit(1); }
`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: root, encoding: 'utf8' });
  if (child.status !== 0) r.fail(`${name}: ${child.stderr.trim()}`);

  r.note(`${name}: ${files.size} files, ${(packed.size / 1024).toFixed(1)} KB packed, ${targets.length} export targets`);
}
checkNoPlanningTokens(r);
r.done();
