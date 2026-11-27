// deps:check: the dependency matrix, the dependency policy, license
// attribution and a default DataGrid import with no XLSX or PDF writer.
// Requires `npm run build`. The dependency matrix is the package manifest
// (`packages.manifest.mjs`); no package list is kept here.
//
// 1. Every manifest package's package.json matches the manifest both ways:
//    `dependencies` hold exactly its @salmonui `deps`, exact-pinned to the
//    target package's own version; `peerDependencies` hold exactly react /
//    react-dom per its `react` field plus its `optionalPeers` (exact-pinned,
//    optional in `peerDependenciesMeta`); third-party runtime dependencies
//    come only from its `thirdParty` allow-list and are exact-pinned.
// 2. Bare imports in built `dist` JS are declared and allowed; an @salmonui
//    import names an exported subpath of that package, and `/internal/*`
//    only of a package the manifest marks `internal`. `node:*` builtins are
//    allowed only in a `platform: 'node'` package (@salmonui/mcp), which
//    must also have no React peer, no @salmonui or third-party dependency
//    and an `engines.node` range; its `bin` targets are entries too.
// 3. Banned UI library packages (the BANNED deny-list) and CSS-in-JS
//    runtimes appear nowhere in the published runtime graph; the
//    repository-wide ban list is also enforced on every
//    workspace manifest and the root lockfile (examples and tooling included).
// 4. Licenses of the published runtime graph are on the allow-list, and every
//    third-party package of a dependency-exception package (rich-text,
//    pdf-viewer) is listed in THIRD_PARTY_LICENSES.md with its NOTICE text.
// 5. The default `DataGrid` bundle contains only workspace code, no export
//    writer and no pivot engine.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureBundle } from './bundle-size.mjs';
import { examplePackages, expandExportPattern, exportTargets, exportsSubpath, importGraph, listFiles, packageName, readJson, reporter, requireBuild, root, workspacePackages } from './lib.mjs';
import { PACKAGES } from './packages.manifest.mjs';

const r = reporter('deps:check');
requireBuild('deps:check');

const LICENSES = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', '0BSD']);
// Banned in every manifest and lockfile of the repository: other component
// vendors and the libraries Salmon UI does not build on.
const BANNED = [
  [/^@syncfusion\//, 'Syncfusion'],
  [/^(antd|@ant-design\/.+)$/, 'Ant Design'],
  [/^(rc-.+|@rc-component\/.+)$/, 'rc-*'],
  [/tailwind/i, 'Tailwind'],
  [/^@tanstack\//, 'TanStack'],
  [/^(ag-grid.*|@ag-grid-.+\/.+)$/, 'AG Grid'],
  [/^(@mui\/.+|@material-ui\/.+)$/, 'MUI'],
];
// Additionally banned in the published runtime graph.
const RUNTIME_BANNED = [
  ...BANNED,
  [/^(@emotion\/.+|styled-components|styled-jsx|@stitches\/.+|goober|jss|@linaria\/.+|@vanilla-extract\/.+|@pandacss\/.+)$/, 'CSS-in-JS runtime'],
];
const banned = (name, list) => list.find(([re]) => re.test(name))?.[1];

const REACT = ['react', 'react-dom'];
const REACT_RANGE = '>=19';
/**
 * Loading rules of the dependency-exception packages on top of the manifest.
 * `lazyOnly`: every third-party module loads with dynamic `import()`.
 * `lazyThirdParty`: third-party packages an entry reaches only through
 * dynamic `import()`, never statically. `entryOnly`: third-party packages
 * that only the listed entries may reach at all (Yjs stays behind `/collab`).
 */
const LOADING = {
  '@salmonui/rich-text': {
    lazyThirdParty: { '.': [/^prosemirror-/] },
    entryOnly: { yjs: ['./collab'], 'y-prosemirror': ['./collab'], 'y-protocols': ['./collab'], lib0: ['./collab'] },
  },
  // pdf.js, always loaded with dynamic import() (the engine chunk and the module worker).
  '@salmonui/pdf-viewer': { lazyOnly: true },
};
const allowsThirdParty = (m, dep) => m.thirdParty.some((a) => (typeof a === 'string' ? a === dep : a.test(dep)));
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const lock = readJson(join(root, 'package-lock.json'));
const lockPackages = lock.packages ?? {};
const workspace = workspacePackages();
const byName = new Map(workspace.map((p) => [p.pkg.name, p]));
const manifestNames = new Set(PACKAGES.map((m) => m.name));
for (const p of workspace) if (!manifestNames.has(p.pkg.name)) r.note(`${p.rel}: ${p.pkg.name} is not in packages.manifest.mjs; skipped`);
const packages = [];
for (const m of PACKAGES) {
  const p = byName.get(m.name);
  if (!p) r.fail(`${m.name}: no package.json with this name under packages/ (packages.manifest.mjs dir ${m.dir})`);
  else {
    r.check(p.rel === m.dir, `${m.name}: lives in ${p.rel}, the manifest says ${m.dir}`);
    packages.push({ ...p, m });
  }
}
const versions = new Set(packages.map((p) => p.pkg.version));
r.check(versions.size === 1, `packages must share one fixed version, found ${[...versions].join(', ')}`);

/** Resolves an installed dependency in the lockfile the way Node would from `fromKey`. */
function lockEntry(name, fromKey) {
  let base = fromKey;
  for (;;) {
    const key = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (lockPackages[key]) return { key, entry: lockPackages[key] };
    if (!base) return null;
    const idx = base.lastIndexOf('/node_modules/');
    base = idx === -1 ? '' : base.slice(0, idx);
  }
}

/** Transitive third-party runtime closure of a published package (from the lockfile). */
function runtimeClosure(p) {
  const seen = new Map();
  const visit = (deps, fromKey, via) => {
    for (const name of Object.keys(deps ?? {})) {
      if (name.startsWith('@salmonui/')) continue;
      const found = lockEntry(name, fromKey);
      if (!found) {
        r.fail(`${p.pkg.name}: runtime dependency ${name} (via ${via}) is not in package-lock.json`);
        continue;
      }
      if (seen.has(found.key)) continue;
      seen.set(found.key, { key: found.key, name, license: found.entry.license, version: found.entry.version, via });
      visit({ ...found.entry.dependencies, ...found.entry.optionalDependencies }, found.key, `${via} > ${name}`);
    }
  };
  visit({ ...p.pkg.dependencies, ...p.pkg.optionalDependencies }, p.rel, p.pkg.name);
  return [...seen.values()];
}

/** The exact version an @salmonui dependency must be pinned to: the target workspace package's own version. */
const pinOf = (dep) => byName.get(dep)?.pkg.version;

for (const p of packages) {
  const { m } = p;
  const { name } = p.pkg;
  const loading = LOADING[name] ?? {};
  r.check(!p.pkg.private, `${name} must not be private`);
  r.check(LICENSES.has(p.pkg.license), `${name}: license "${p.pkg.license}" is not on the allow-list`);
  r.check(!p.pkg.optionalDependencies && !p.pkg.bundleDependencies && !p.pkg.bundledDependencies, `${name}: optional or bundled dependencies are not allowed`);

  // 1. package.json against the manifest.
  const depsField = p.pkg.dependencies ?? {};
  const deps = Object.keys(depsField);
  const ownDeps = deps.filter((d) => d.startsWith('@salmonui/'));
  const thirdParty = deps.filter((d) => !d.startsWith('@salmonui/'));
  for (const dep of ownDeps) if (!m.deps.includes(dep)) r.fail(`${name} depends on ${dep}; packages.manifest.mjs does not list it in deps`);
  for (const dep of m.deps) if (!ownDeps.includes(dep)) r.fail(`${name}: packages.manifest.mjs lists ${dep} in deps, but package.json "dependencies" does not declare it`);
  for (const dep of ownDeps) {
    if (!byName.has(dep)) r.fail(`${name} depends on ${dep}, which is not a workspace package`);
    else r.check(depsField[dep] === pinOf(dep), `${name} must pin ${dep} exactly to its version ${pinOf(dep)}, found ${depsField[dep]}`);
  }
  for (const dep of thirdParty) {
    if (!m.thirdParty.length) r.fail(`${name} declares third-party runtime dependency ${dep}; only the dependency-exception packages may`);
    else if (!allowsThirdParty(m, dep)) r.fail(`${name} declares ${dep}, which is not on its thirdParty allow-list (packages.manifest.mjs)`);
    // One reviewed version, no ranges.
    r.check(/^\d+\.\d+\.\d+$/.test(depsField[dep]), `${name}: third-party dependency ${dep} must be exact-pinned, found "${depsField[dep]}"`);
  }

  const peers = p.pkg.peerDependencies ?? {};
  const meta = p.pkg.peerDependenciesMeta ?? {};
  const reactPeers = m.react === 'none' ? [] : REACT;
  const expectedPeers = [...reactPeers, ...m.optionalPeers];
  const expectedOptional = [...(m.react === 'optional' ? REACT : []), ...m.optionalPeers];
  r.check(sameSet(Object.keys(peers), expectedPeers), `${name}: peerDependencies must be exactly ${JSON.stringify(expectedPeers)} (react: ${m.react}, optionalPeers), found ${JSON.stringify(Object.keys(peers))}`);
  for (const dep of reactPeers) if (dep in peers) r.check(peers[dep] === REACT_RANGE, `${name}: peer ${dep} must be "${REACT_RANGE}", found "${peers[dep]}"`);
  for (const dep of m.optionalPeers) {
    if (!(dep in peers)) continue;
    if (!byName.has(dep)) r.fail(`${name}: optional peer ${dep} is not a workspace package`);
    else r.check(peers[dep] === pinOf(dep), `${name} must pin optional peer ${dep} exactly to its version ${pinOf(dep)}, found ${peers[dep]}`);
    r.check(!(dep in depsField), `${name}: ${dep} is an optional peer and must not also be in "dependencies"`);
  }
  const optionalMeta = Object.keys(meta).filter((k) => meta[k]?.optional === true);
  r.check(sameSet(Object.keys(meta), optionalMeta), `${name}: peerDependenciesMeta entries must be { "optional": true }, found ${JSON.stringify(meta)}`);
  r.check(sameSet(optionalMeta, expectedOptional), `${name}: optional peers (peerDependenciesMeta) must be exactly ${JSON.stringify(expectedOptional)}, found ${JSON.stringify(optionalMeta)}`);

  const nodeOnly = m.platform === 'node';
  if (nodeOnly) {
    r.check(m.react === 'none' && !m.deps.length && !m.optionalPeers.length && !m.thirdParty.length, `${name}: a platform "node" package has no React peer and no runtime dependency (packages.manifest.mjs)`);
    r.check(typeof p.pkg.engines?.node === 'string', `${name}: a platform "node" package declares "engines.node"`);
  }

  // 2. Imports in built output.
  const allowedImports = new Set([...m.deps, ...m.optionalPeers, ...reactPeers, ...thirdParty.filter((d) => allowsThirdParty(m, d))]);
  // `./internal/*` entries are checked module by module (other packages import them).
  const distFiles = listFiles(join(p.dir, 'dist')).map((f) => `dist/${f}`);
  const entries = exportTargets(p.pkg.exports)
    .filter((t) => t.condition === 'import' && t.target.endsWith('.js'))
    .flatMap((t) => (t.target.includes('*') ? expandExportPattern(t.target, distFiles).map((x) => ({ ...t, subpath: t.subpath.replace('*', x.match), target: x.file })) : [t]));
  const bins = typeof p.pkg.bin === 'string' ? [p.pkg.bin] : Object.values(p.pkg.bin ?? {});
  for (const target of bins) entries.push({ subpath: `bin ${target}`, condition: 'import', target });
  for (const t of entries) {
    const file = join(p.dir, t.target);
    if (!existsSync(file)) continue; // pack:check reports missing targets
    const graph = importGraph(file);
    for (const dep of graph.packages) {
      const pkgName = packageName(dep.spec);
      if (pkgName.startsWith('@salmonui/')) {
        const target = byName.get(pkgName);
        const subpath = dep.spec === pkgName ? '.' : `./${dep.spec.slice(pkgName.length + 1)}`;
        if (target && !exportsSubpath(target.pkg.exports, subpath)) r.fail(`${name}: ${dep.from} imports "${dep.spec}", which ${pkgName} does not export`);
        if (subpath.startsWith('./internal/') && !PACKAGES.find((x) => x.name === pkgName)?.internal) {
          r.fail(`${name}: ${dep.from} imports "${dep.spec}"; ${pkgName} is not marked internal in packages.manifest.mjs`);
        }
      }
      // A package may import its own public subpaths (Node self-reference through `exports`).
      if (pkgName === name) continue;
      if (dep.spec.startsWith('node:')) {
        if (!nodeOnly) r.fail(`${name}: ${dep.from} imports the Node builtin "${dep.spec}"; only a platform "node" package may (packages.manifest.mjs)`);
        continue;
      }
      if (!allowedImports.has(pkgName)) r.fail(`${name}: ${dep.from} imports "${dep.spec}", not allowed by packages.manifest.mjs (deps, optionalPeers, react, thirdParty)`);
      else if (!deps.includes(pkgName) && !(pkgName in peers)) r.fail(`${name}: ${dep.from} imports "${dep.spec}", which is not declared`);
      if (loading.lazyOnly && !pkgName.startsWith('@salmonui/') && !(pkgName in peers) && dep.kind !== 'dynamic') {
        r.fail(`${name}: ${dep.from} statically imports third-party "${dep.spec}"; load it with dynamic import()`);
      }
      const owners = loading.entryOnly?.[pkgName];
      if (owners && !owners.includes(t.subpath)) r.fail(`${name}: entry ${t.subpath} reaches "${dep.spec}" (via ${dep.from}); only ${owners.join(', ')} may`);
    }
    // Static graph only: what the entry loads before any dynamic import().
    const lazy = loading.lazyThirdParty?.[t.subpath];
    if (lazy) {
      for (const dep of importGraph(file, { followDynamic: false }).packages) {
        if (dep.kind === 'static' && lazy.some((re) => re.test(packageName(dep.spec)))) {
          r.fail(`${name}: entry ${t.subpath} statically reaches "${dep.spec}" (via ${dep.from}); the engine loads with dynamic import() only`);
        }
      }
    }
  }

  // 3 + 4. Published runtime graph.
  const closure = runtimeClosure(p);
  for (const dep of closure) {
    const why = banned(dep.name, RUNTIME_BANNED);
    if (why) r.fail(`${name}: runtime graph contains ${dep.name} (${why}) via ${dep.via}`);
    if (!LICENSES.has(dep.license)) r.fail(`${name}: ${dep.name}@${dep.version} has license "${dep.license ?? 'unknown'}" (allowed: ${[...LICENSES].join(', ')})`);
  }
  if (thirdParty.length) {
    const listFile = join(root, 'THIRD_PARTY_LICENSES.md');
    const list = existsSync(listFile) ? readFileSync(listFile, 'utf8') : '';
    for (const dep of closure) if (!list.includes(dep.name)) r.fail(`${name}: ${dep.name} is not listed in THIRD_PARTY_LICENSES.md`);
    // NOTICE files (Apache-2.0 section 4(d)):
    // a runtime dependency that ships one has its text reproduced verbatim
    // (whitespace-normalized) in THIRD_PARTY_LICENSES.md.
    const flat = (s) => s.replace(/\s+/g, ' ').trim();
    for (const dep of closure) {
      const dir = join(root, dep.key);
      const notices = existsSync(dir) ? readdirSync(dir).filter((f) => /^notice(\.(md|txt))?$/i.test(f)) : [];
      for (const f of notices) {
        const text = flat(readFileSync(join(dir, f), 'utf8'));
        if (text && !flat(list).includes(text)) r.fail(`${name}: ${dep.name}@${dep.version} ships ${f}; reproduce it verbatim under "Notices" in THIRD_PARTY_LICENSES.md`);
        else r.note(`${name}: ${dep.name}@${dep.version} ${f} reproduced in THIRD_PARTY_LICENSES.md`);
      }
    }
    const readme = existsSync(join(p.dir, 'README.md')) ? readFileSync(join(p.dir, 'README.md'), 'utf8') : '';
    for (const dep of thirdParty) r.check(readme.includes(dep), `${name}: README.md must list ${dep} and its license`);
  }
}

// 3. Repository-wide ban list: manifests and the lockfile.
const manifests = [{ rel: 'package.json', pkg: readJson(join(root, 'package.json')) }, ...workspace, ...examplePackages()];
for (const mf of manifests) {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(mf.pkg[field] ?? {})) {
      const why = banned(dep, BANNED);
      if (why) r.fail(`${mf.rel} ${field} contains ${dep} (${why})`);
    }
  }
}
for (const key of Object.keys(lockPackages)) {
  if (!key.includes('node_modules/')) continue;
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const why = banned(name, BANNED);
  if (why) r.fail(`package-lock.json installs ${name} (${why}) at ${key}`);
}

// 5. Default DataGrid bundle: workspace code only (a bundle-metafile assertion).
const bundle = await measureBundle({
  name: 'deps-check-default-grid',
  source: "export * from '@salmonui/data-grid';\nimport '@salmonui/core/styles.css';\nimport '@salmonui/data-grid/styles.css';\n",
  external: ['react', 'react-dom'],
});
const foreign = bundle.modules.filter((id) => !id.startsWith('\0') && !id.includes('/node_modules/.cache/') && !id.startsWith(join(root, 'packages/')));
for (const id of foreign) r.fail(`default DataGrid bundle contains non-workspace module ${id}`);
for (const id of bundle.modules) if (id.startsWith(join(root, 'packages/export/'))) r.fail(`default DataGrid bundle contains export writer module ${id}`);
// The pivot engine (`@salmonui/pivot-table/engine`) never reaches a Data Grid bundle.
for (const id of bundle.modules) if (id.startsWith(join(root, 'packages/pivot-table/'))) r.fail(`default DataGrid bundle contains pivot module ${id}`);
r.check(bundle.modules.some((id) => id.startsWith(join(root, 'packages/data-grid/'))), 'default DataGrid bundle contains no packages/data-grid module; check the bundle entry');
r.note(`default DataGrid bundle: ${bundle.modules.length} modules, all from packages/`);

r.done();
