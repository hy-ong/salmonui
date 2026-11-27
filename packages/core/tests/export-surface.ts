// Shared export-surface check for every @salmonui package: the `exports` map of the package matches what the package
// manifest declares (families, their subpaths and stylesheets, extra and engine
// entries, `./internal/*`), every target file is built, the @salmonui
// dependencies are the manifest ones, and every JavaScript entry exports the
// names its docs claim. Each package's `tests/exports.test.ts` calls it with its
// claims table, one row per JavaScript entry.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = new URL('../../../', import.meta.url).pathname;

interface Family {
  name: string;
  styles: string[];
  root?: boolean;
  subpaths?: Record<string, string>;
}

export interface ManifestPackage {
  name: string;
  dir: string;
  deps: string[];
  optionalPeers: string[];
  react: 'required' | 'optional' | 'none';
  families: Family[];
  extra: Record<string, string>;
  engine?: Record<string, string>;
  css?: Record<string, string[]>;
  neutral?: string[];
  internal?: boolean;
}

type ExportTarget = string | { types?: string; import?: string; default?: string };

interface PackageJson {
  name: string;
  exports: Record<string, ExportTarget>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

// A non-literal specifier keeps the untyped .mjs manifest out of the type graph.
const manifestUrl = new URL('tooling/checks/packages.manifest.mjs', `file://${ROOT}`).href;

/** The manifest rows of every published package. */
export async function loadManifest(): Promise<ManifestPackage[]> {
  return ((await import(manifestUrl)) as { PACKAGES: ManifestPackage[] }).PACKAGES;
}

/** The public `exports` keys a manifest row implies. */
export function expectedExportKeys(pkg: ManifestPackage): string[] {
  const keys = new Set(['./package.json']);
  for (const fam of pkg.families) {
    const base = fam.root ? '.' : `./${fam.name}`;
    keys.add(base);
    for (const sub of Object.keys(fam.subpaths ?? {})) keys.add(fam.root ? sub : `${base}${sub.slice(1)}`);
    if (!fam.root && fam.styles.length > 0) keys.add(`${base}/styles.css`);
  }
  if (pkg.families.length > 0) keys.add('./styles.css');
  for (const key of Object.keys(pkg.extra)) keys.add(key);
  for (const key of Object.keys(pkg.css ?? {})) keys.add(key);
  for (const key of Object.keys(pkg.engine ?? {})) keys.add(key === '.' ? './engine' : `./engine${key.slice(1)}`);
  if (pkg.internal) keys.add('./internal/*');
  return [...keys].sort();
}

const isJsEntry = (key: string): boolean => key !== './package.json' && !key.endsWith('.css') && !key.includes('*');
const specifierOf = (name: string, key: string): string => (key === '.' ? name : `${name}${key.slice(1)}`);

export interface ExportSurfaceOptions {
  /**
   * Entries the manifest does not enumerate (a package that predates the
   * manifest's entry lists). They are added to the expected keys.
   */
  unlistedEntries?: string[];
}

/**
 * Registers the export-surface suite of `name`. `claims` maps every public
 * JavaScript entry (`.`, `./menu`, `./engine/sort`) to the runtime names its
 * docs say it exports; an entry with only types claims `[]`.
 */
export function describeExportSurface(name: string, claims: Record<string, readonly string[]>, options: ExportSurfaceOptions = {}): void {
  describe(`${name} export surface`, async () => {
    const pkg = (await loadManifest()).find((p) => p.name === name);
    assert.ok(pkg, `${name} is in the package manifest`);
    const dir = join(ROOT, pkg.dir);
    const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;

    it('the exports map is exactly the manifest families, subpaths, stylesheets and entries', () => {
      assert.equal(json.name, name);
      const expected = [...new Set([...expectedExportKeys(pkg), ...(options.unlistedEntries ?? [])])].sort();
      assert.deepEqual(Object.keys(json.exports).sort(), expected);
    });

    it('every export target is built, and every stylesheet is non-empty', () => {
      for (const [key, target] of Object.entries(json.exports)) {
        if (key.includes('*') || key === './package.json') continue;
        const files = typeof target === 'string' ? [target] : Object.values(target);
        for (const file of files) {
          const path = join(dir, file as string);
          assert.ok(existsSync(path), `${key} -> ${file as string} exists`);
          if (key.endsWith('.css')) assert.ok(statSync(path).size > 0, `${key} is not empty`);
        }
      }
    });

    it('depends on exactly the manifest @salmonui packages, optional ones as optional peers', () => {
      const scoped = (deps: Record<string, string> | undefined) => Object.keys(deps ?? {}).filter((d) => d.startsWith('@salmonui/')).sort();
      assert.deepEqual(scoped(json.dependencies), [...pkg.deps].sort());
      assert.deepEqual(scoped(json.peerDependencies), [...pkg.optionalPeers].sort());
      for (const peer of pkg.optionalPeers) assert.equal(json.peerDependenciesMeta?.[peer]?.optional, true, `${peer} is an optional peer`);
      const react = json.peerDependencies?.['react'];
      if (pkg.react === 'none') assert.equal(react, undefined, 'no react peer');
      else {
        assert.equal(react, '>=19');
        assert.equal(json.peerDependenciesMeta?.['react']?.optional === true, pkg.react === 'optional');
      }
    });

    it('the claims table covers every JavaScript entry', () => {
      assert.deepEqual(Object.keys(claims).sort(), Object.keys(json.exports).filter(isJsEntry).sort());
    });

    for (const [key, names] of Object.entries(claims)) {
      it(`${specifierOf(name, key)} exports ${names.length ? names.join(', ') : 'types only'}`, async () => {
        const mod = (await import(specifierOf(name, key))) as Record<string, unknown>;
        for (const n of names) assert.notEqual(mod[n], undefined, `${specifierOf(name, key)} exports ${n}`);
        assert.equal(mod['default'], undefined, 'no default export');
      });
    }
  });
}
