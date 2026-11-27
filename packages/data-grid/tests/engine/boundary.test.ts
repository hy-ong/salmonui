// The framework-agnostic engine (`@salmonui/data-grid/engine`, src/engine) has no
// `react` import and no DOM global access. The compile-time guard is
// `lib: ["ES2023"]` + `types: []` in packages/data-grid/tsconfig.engine.json;
// this test is the source-level guard. Its only package imports are the
// neutral `@salmonui/core` subpaths (the manifest's `neutral` list) and, in
// `/engine/export-server` only, the `@salmonui/export` writers as types and
// lazy `import()` (an optional peer).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadManifest } from '../../../core/tests/export-surface.ts';

const SRC = new URL('../../src/engine/', import.meta.url).pathname;
const core = (await loadManifest()).find((p) => p.name === '@salmonui/core');
const NEUTRAL = (core?.neutral ?? []).map((sub) => `@salmonui/core${sub.slice(1)}`);
const WRITER = /^@salmonui\/export\/(xlsx|pdf)$/;
const FORBIDDEN_GLOBALS = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'HTMLElement', 'Element', 'Node', 'Event', 'EventTarget', 'MutationObserver', 'ResizeObserver',
  'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'matchMedia', 'DOMParser', 'XMLHttpRequest', 'self', 'screen', 'devicePixelRatio',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

/** Removes comments and string/template literal contents so only code identifiers remain. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

describe('@salmonui/data-grid/engine runtime boundary', () => {
  const files = sourceFiles(SRC);

  it('finds the source files and the neutral core subpaths', () => {
    assert.ok(files.length > 5);
    assert.ok(NEUTRAL.includes('@salmonui/core/format') && NEUTRAL.includes('@salmonui/core/export-model'));
  });

  it('imports only relative modules and the neutral @salmonui/core subpaths', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
      for (const m of text.matchAll(/(?:^|[;\n])\s*(?:import|export)(\s+type\b)?(?:[^;'"]*?\bfrom)?\s*['"]([^'"]+)['"]/g)) {
        const [, typeOnly, spec] = m as unknown as [string, string | undefined, string];
        if (spec.startsWith('./') || NEUTRAL.includes(spec)) continue;
        assert.ok(typeOnly && file.endsWith('/export-server.ts') && WRITER.test(spec), `${file} imports "${spec}"`);
      }
      for (const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1] as string;
        assert.ok(spec.startsWith('./') || (file.endsWith('/export-server.ts') && WRITER.test(spec)), `${file} lazily imports "${spec}"`);
      }
      assert.doesNotMatch(text, /\brequire\s*\(/, `${file} uses require()`);
    }
  });

  it('never references DOM globals', () => {
    const pattern = new RegExp(`(?<![.\\w$])(${FORBIDDEN_GLOBALS.join('|')})(?![\\w$])(?!\\s*:)`, 'g');
    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      const hits = [...code.matchAll(pattern)].map((m) => m[1]);
      assert.deepEqual(hits, [], `${file} references ${hits.join(', ')}`);
    }
  });

  it('the package declares @salmonui/core only, with @salmonui/export as an optional peer', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      type?: string;
      dependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@salmonui/core']);
    assert.equal(pkg.peerDependenciesMeta?.['@salmonui/export']?.optional, true);
    assert.equal(pkg.type, 'module');
  });

  it('compiles without the DOM lib and without ambient types', () => {
    const tsconfig = JSON.parse(readFileSync(new URL('../../tsconfig.engine.json', import.meta.url), 'utf8')) as {
      compilerOptions: { lib: string[]; types: string[]; rootDir: string };
    };
    assert.equal(tsconfig.compilerOptions.rootDir, 'src/engine');
    assert.deepEqual(tsconfig.compilerOptions.lib, ['ES2023']);
    assert.deepEqual(tsconfig.compilerOptions.types, []);
  });
});
