// Acceptance: @salmonui/data has no runtime dependencies, no `react` import,
// no import of other packages (data-grid-core types are duplicated structurally),
// and no DOM global access. Platform APIs (fetch, AbortController, timers)
// are read lazily from globalThis, never at module scope.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SRC = new URL('../src/', import.meta.url).pathname;
const FORBIDDEN_GLOBALS = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'indexedDB',
  'HTMLElement', 'Element', 'Node', 'Event', 'EventTarget', 'MutationObserver', 'ResizeObserver',
  'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'matchMedia', 'DOMParser', 'XMLHttpRequest', 'self', 'screen', 'devicePixelRatio', 'EventSource', 'WebSocket',
  'URL', 'URLSearchParams', 'Headers', 'Request', 'Response', 'FormData', 'Blob',
];
/** May only appear as `globalThis` property reads inside functions. */
const LAZY_GLOBALS = ['fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'queueMicrotask'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

describe('data runtime boundary', () => {
  const files = sourceFiles(SRC);

  it('finds the source files', () => {
    assert.ok(files.length > 8);
  });

  it('imports only its own modules', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
      for (const spec of specifiers) assert.ok(spec.startsWith('./'), `${file} imports "${spec}"`);
      assert.doesNotMatch(text, /\brequire\s*\(/, `${file} uses require()`);
    }
  });

  it('never references DOM globals', () => {
    const pattern = new RegExp(`(?<![.\\w$])(${FORBIDDEN_GLOBALS.join('|')})(?![\\w$])(?!\\s*[:?])`, 'g');
    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      const hits = [...code.matchAll(pattern)].map((m) => m[1]);
      assert.deepEqual(hits, [], `${file} references ${hits.join(', ')}`);
    }
  });

  it('reads fetch, AbortController, and timers only through globalThis', () => {
    // Calls, not method definitions (`setTimeout(cb, ms) {` / `setTimeout(...): T;`).
    const pattern = new RegExp(`(?<![.\\w$'"])(${LAZY_GLOBALS.join('|')})\\s*\\((?![^()]*(?:\\([^()]*\\)[^()]*)*\\)\\s*[{:])|new\\s+(${LAZY_GLOBALS.join('|')})\\b`, 'g');
    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      const hits = [...code.matchAll(pattern)].map((m) => m[0]);
      assert.deepEqual(hits, [], `${file} calls ${hits.join(', ')} directly`);
    }
  });

  it('imports cleanly with no platform globals present', async () => {
    const saved = { fetch: globalThis.fetch, AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout };
    const g = globalThis as Record<string, unknown>;
    try {
      g['fetch'] = undefined;
      g['AbortController'] = undefined;
      const mod = await import('@salmonui/data');
      const server = (await import('@salmonui/data/server')).createJsonQueryHandler([{ id: 1 }], { key: 'id' });
      const source = mod.createJsonDataSource({ transport: server.transport(), key: 'id', fields: ['id'], scheduler: mod.createManualScheduler() });
      const result = await source.read({
        version: 1,
        query: { search: null, filters: [], sorting: [], grouping: [], aggregates: [], paging: null, expansion: { groups: {}, tree: {}, detail: {}, defaultGroupExpanded: true } },
        signal: mod.createAbortController().signal,
      });
      assert.deepEqual(result.rows, [[1]]);
    } finally {
      Object.assign(g, saved);
    }
  });

  it('declares no runtime dependencies and compiles without DOM types', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) assert.equal(pkg[field], undefined, `package.json declares ${field}`);
    assert.equal(pkg['sideEffects'], false);
    assert.equal(pkg['type'], 'module');
    const tsconfig = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8')) as { compilerOptions: { lib: string[]; types: string[] } };
    assert.deepEqual(tsconfig.compilerOptions.lib, ['ES2023']);
    assert.deepEqual(tsconfig.compilerOptions.types, []);
  });

  it('exports map entries resolve', async () => {
    for (const entry of ['@salmonui/data', '@salmonui/data/json', '@salmonui/data/local', '@salmonui/data/stream', '@salmonui/data/storage', '@salmonui/data/views', '@salmonui/data/lookup', '@salmonui/data/server']) {
      const mod = (await import(entry)) as Record<string, unknown>;
      assert.ok(Object.keys(mod).length > 0, entry);
    }
  });
});
