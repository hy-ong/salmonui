// Package boundary:
// @salmonui/export has no DOM globals and no third-party imports; it imports
// only the neutral @salmonui/core subpaths (never @salmonui/data-grid or any
// component package); it has no root entry, so an import always names one
// writer; and no React component entry imports it statically (the Data Grid
// engine's `/engine/export-server` loads the writers lazily, an optional peer).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadManifest } from '../../core/tests/export-surface.ts';

const PACKAGES = new URL('../../', import.meta.url).pathname;
const SRC = join(PACKAGES, 'export/src');
const DOM = ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'requestAnimationFrame', 'XMLHttpRequest'];
const manifest = await loadManifest();
const NEUTRAL = (manifest.find((p) => p.name === '@salmonui/core')?.neutral ?? []).map((sub) => `@salmonui/core${sub.slice(1)}`);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
}
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** Static runtime specifiers: `import type` / `export type` statements are erased by the build. */
const staticSpecifiers = (text: string): string[] =>
  [...strip(text).matchAll(/(?:^|[;\n])\s*(?:import|export)(\s+type\b)?(?:[^;'"]*?\bfrom)?\s*['"]([^'"]+)['"]/g)].filter((m) => !m[1]).map((m) => m[2] as string);
/** Lazy `import()` specifiers. */
const lazySpecifiers = (text: string): string[] => [...strip(text).matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
const runtimeSpecifiers = (text: string): string[] => [...staticSpecifiers(text), ...lazySpecifiers(text)];

describe('@salmonui/export boundary', () => {
  it('imports only relative modules and the neutral @salmonui/core subpaths', () => {
    const specs = files(SRC).flatMap((file) => runtimeSpecifiers(readFileSync(file, 'utf8')).map((spec) => [file, spec] as const));
    assert.ok(specs.some(([, spec]) => spec === '@salmonui/core/export-model'), 'the writers build on the core export model');
    for (const [file, spec] of specs) assert.ok(spec.startsWith('./') || NEUTRAL.includes(spec), `${file} imports ${spec}`);
  });

  it('declares @salmonui/core as its only dependency and no peers', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGES, 'export/package.json'), 'utf8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@salmonui/core']);
    assert.equal(pkg.peerDependencies, undefined);
  });

  it('references no DOM globals', () => {
    const pattern = new RegExp(`(?<![.\\w$'"])(${DOM.join('|')})(?![\\w$])`, 'g');
    for (const file of files(SRC)) {
      assert.deepEqual([...strip(readFileSync(file, 'utf8')).matchAll(pattern)].map((m) => m[1]), [], file);
    }
  });

  it('has no root entry: every import names one writer', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGES, 'export/package.json'), 'utf8')) as { exports: Record<string, unknown> };
    assert.equal(pkg.exports['.'], undefined);
  });

  it('no other package imports it at runtime except the Data Grid export server, lazily', () => {
    for (const other of manifest.filter((p) => p.name !== '@salmonui/export')) {
      for (const file of files(join(PACKAGES, other.dir.replace(/^packages\//, ''), 'src'))) {
        const text = readFileSync(file, 'utf8');
        const writer = (s: string): boolean => s === '@salmonui/export' || s.startsWith('@salmonui/export/');
        assert.deepEqual(staticSpecifiers(text).filter(writer), [], `${file} imports @salmonui/export statically`);
        for (const spec of lazySpecifiers(text).filter(writer)) assert.ok(file.endsWith('/data-grid/src/engine/export-server.ts'), `${file} imports ${spec}`);
      }
    }
  });
});
