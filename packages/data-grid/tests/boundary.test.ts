// @salmonui/data-grid/server is server-safe (no react-dom/client,
// no browser globals, no CSS, no hooks in its import graph); the package's only
// runtime dependency is @salmonui/core (@salmonui/export is an optional peer);
// the stylesheet has no content-visibility and no transitions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const dist = new URL('../dist/', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function graph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
      const spec = (m[1] ?? m[2]) as string;
      if (spec.startsWith('.')) visit(resolve(dirname(file), spec));
      else packages.add(spec);
    }
  };
  visit(join(dist, entry));
  return { files: [...files], packages: [...packages] };
}

const stripStrings = (text: string) => text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ').replace(/`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');
// Packages the server helpers may import: the neutral core subpaths and the engine.
const SERVER_SAFE = /^@salmonui\/(core\/(format|validation|data|virtual|dates)|data-grid\/engine(\/[\w-]+)?)$/;

describe('server boundary', () => {
  it('@salmonui/data-grid/server imports only server-safe modules', () => {
    const { files, packages } = graph('server.js');
    assert.deepEqual(packages.filter((p) => p !== 'react/jsx-runtime' && !SERVER_SAFE.test(p)).sort(), []);
    assert.ok(files.length > 1, 'the graph reaches the range helper');
    for (const file of files) {
      const code = stripStrings(readFileSync(file, 'utf8'));
      assert.doesNotMatch(code, /\b(window|document|navigator|ResizeObserver|localStorage|matchMedia)\b/, file);
      assert.doesNotMatch(code, /\buse(State|Effect|LayoutEffect|SyncExternalStore|Context|Ref|Memo|Callback)\b|\buse\(/, file);
      assert.doesNotMatch(code, /react-dom\/client|\.css['"]/, file);
      assert.doesNotMatch(readFileSync(file, 'utf8'), /^['"]use client['"]/, `${file} must not be a client module`);
    }
  });

  it('the root entry never re-exports ./server', () => {
    const root = readFileSync(join(dist, 'data-grid.js'), 'utf8');
    assert.doesNotMatch(stripStrings(root).replace(/from\s*""/g, ''), /server/);
    assert.doesNotMatch(root, /from\s*['"][^'"]*server/);
  });

  it('declares only @salmonui/core as a runtime dependency, react peers and @salmonui/export as an optional peer', () => {
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@salmonui/core']);
    assert.deepEqual(pkg.peerDependencies, { react: '>=19', 'react-dom': '>=19', '@salmonui/export': pkg.version });
    assert.deepEqual(pkg.peerDependenciesMeta, { '@salmonui/export': { optional: true } });
  });

  it('grid entry modules carry the use client directive', () => {
    for (const file of ['data-grid/DataGrid.js', 'data-grid/Body.js', 'data-grid/Row.js', 'data-grid/Cell.js', 'data-grid/Header.js']) {
      assert.match(readFileSync(join(dist, file), 'utf8'), /^['"]use client['"]/, file);
    }
  });

  it('CSS: no content-visibility, no Tailwind, no transitions on rows or cells', () => {
    const css = readFileSync(join(dist, 'data-grid.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /content-visibility\s*:/);
    assert.doesNotMatch(css, /@tailwind|@apply/);
    // The one exception: the skeleton row shimmer, a transform-only keyframe on a pseudo-element of
    // placeholder rows. The stylesheet carries the keyframes rule (the core shimmer module, shared with Skeleton).
    const shimmer = /@keyframes salmon-data-grid-shimmer\s*\{\s*to\s*\{\s*transform:[^;{}]*;?\s*\}\s*\}/;
    assert.match(css, shimmer);
    assert.equal(css.match(/@keyframes/g)?.length, 1);
    assert.equal(css.match(/animation/g)?.length, 1);
    assert.match(css, /\.salmon-data-grid-skeleton-bar::after\s*\{[^}]*animation: salmon-data-grid-shimmer /);
    assert.doesNotMatch(css.replace(/animation: salmon-data-grid-shimmer [^;]*;/, ''), /transition|animation/);
    assert.match(css, /contain: strict/);
    assert.equal(pkg.exports['./styles.css'], './dist/data-grid.css');
    assert.ok(css.includes('.salmon-data-grid-viewport'));
  });
});
