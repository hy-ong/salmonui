// @salmonui/core runtime boundary: the neutral
// subpaths (the manifest's `neutral` list) import neither React nor the DOM in
// their built import graph, so the engines and server code can use them;
// `/server` is server-safe (no hooks, browser globals, CSS or client modules);
// the package has no runtime dependency and React is an optional peer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { loadManifest } from './export-surface.ts';

const core = (await loadManifest()).find((p) => p.name === '@salmonui/core');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
const DOM = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'Element', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'requestAnimationFrame', 'getComputedStyle', 'matchMedia', 'XMLHttpRequest'];

const stripStrings = (text: string) =>
  text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ').replace(/`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');

/** The built runtime graph of a specifier: module URLs, and the packages it imports outside @salmonui/core. */
function graph(specifier: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (url: string): void => {
    if (files.has(url)) return;
    files.add(url);
    for (const m of readFileSync(new URL(url), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = (m[1] ?? m[2]) as string;
      if (spec.startsWith('.')) visit(new URL(spec, url).href);
      // `#dates` and the core self-references resolve the same from this test (inside the package).
      else if (spec.startsWith('#') || spec.startsWith('@salmonui/core/')) visit(import.meta.resolve(spec));
      else packages.add(spec);
    }
  };
  visit(import.meta.resolve(specifier));
  return { files: [...files], packages: [...packages] };
}

describe('@salmonui/core boundary', () => {
  it('the manifest lists the neutral subpaths', () => {
    assert.deepEqual(core?.neutral, ['./format', './validation', './data', './virtual', './dates', './export-model', './locale/zh-TW']);
  });

  for (const sub of core?.neutral ?? []) {
    const specifier = `@salmonui/core${sub.slice(1)}`;
    it(`${specifier} imports no package and references no DOM global`, () => {
      const { files, packages } = graph(specifier);
      assert.deepEqual(packages, [], `${specifier} imports ${packages.join(', ')}`);
      const pattern = new RegExp(`(?<![.\\w$])(${DOM.join('|')})(?![\\w$])(?!\\s*:)`, 'g');
      for (const file of files) {
        const code = stripStrings(readFileSync(new URL(file), 'utf8'));
        assert.deepEqual([...code.matchAll(pattern)].map((m) => m[1]), [], file);
        assert.doesNotMatch(readFileSync(new URL(file), 'utf8'), /^['"]use client['"]/, file);
      }
    });
  }

  it('@salmonui/core/server imports only server-safe modules', () => {
    const { files, packages } = graph('@salmonui/core/server');
    assert.deepEqual(packages.filter((p) => p !== 'react' && p !== 'react/jsx-runtime'), []);
    for (const file of files) {
      const code = stripStrings(readFileSync(new URL(file), 'utf8'));
      assert.doesNotMatch(code, /\b(window|document|navigator|ResizeObserver|localStorage|matchMedia)\b/, file);
      assert.doesNotMatch(code, /\buse(State|Effect|LayoutEffect|SyncExternalStore|Context|Ref|Memo|Callback)\b|\buse\(/, file);
      assert.doesNotMatch(code, /react-dom\/client|\.css['"]/, file);
      assert.doesNotMatch(readFileSync(new URL(file), 'utf8'), /^['"]use client['"]/, `${file} must not be a client module`);
    }
  });

  it('declares no runtime dependency; react and react-dom are optional peers', () => {
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.peerDependenciesMeta?.['react']?.optional, true);
    assert.equal(pkg.peerDependenciesMeta?.['react-dom']?.optional, true);
  });
});
