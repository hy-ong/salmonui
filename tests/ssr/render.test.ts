// test:ssr: renders DataGrid through react-dom/server in Node with every
// DOM-like global removed and asserts deterministic, row-count-independent
// output; then checks the server output of the Vite SSR and Next.js App
// Router examples (built by `npm run test:ssr` before this file runs).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { assertBudget } from '../../tooling/bench/budget.mjs';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

// Imported after the globals are gone, so module evaluation runs without them.
const { createElement, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { DataGrid } = await import('@salmonui/data-grid');
const { ThemeProvider } = await import('@salmonui/core/theme');
const { ThemeStyle } = await import('@salmonui/core/server');

const root = new URL('../../', import.meta.url);
const count = (html: string, re: RegExp): number => [...html.matchAll(new RegExp(re.source, 'g'))].length;

interface Item {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly when: Date;
}
const items = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, amount: i * 1.5, when: new Date(Date.UTC(2025, i % 12, 1 + (i % 28))) }));
const columns = [
  { field: 'id', primaryKey: true, width: 90 },
  { field: 'name', width: 160 },
  { field: 'amount', type: 'number', format: 'N2', align: 'end', width: 120 },
  { field: 'when', type: 'date', format: 'yMd', width: 120 },
] as const;

function page(rows: number): string {
  const theme = { colors: { primary: '#0f766e' as const } };
  return renderToString(
    createElement(
      StrictMode,
      null,
      createElement(ThemeStyle, { theme }),
      createElement(
        ThemeProvider,
        { theme },
        createElement(DataGrid as (p: Record<string, unknown>) => ReturnType<typeof createElement>, {
          'aria-label': 'Items',
          data: items(rows),
          columns,
          height: 600,
          timeZone: 'UTC',
          locale: 'en-US',
        }),
      ),
    ),
  );
}

describe('DataGrid server render without DOM globals', () => {
  it('runs with no browser globals', () => {
    for (const name of BROWSER_GLOBALS) assert.equal(typeof g[name], 'undefined', name);
  });

  it('is deterministic across renders', () => {
    assert.equal(page(1_000), page(1_000));
  });

  it('renders the initial range only, independent of the row count', () => {
    const small = page(1_000);
    const large = page(100_000);
    const normalize = (html: string) => html.replace(/aria-rowcount="\d+"/g, '').replace(/height:\d+px/g, '');
    assert.equal(normalize(small), normalize(large));
    assert.ok(count(large, /role="row"/) <= 41, 'header + initial rows');
  });

  it('emits exactly one theme style block per theme scope', () => {
    assert.equal(count(page(10), /<style/), 1);
  });

  it('renders a themed page in under 50 ms (the 20 x 20 ref-node budget lives in packages/react/tests/ssr.test.ts) @perf', () => {
    page(1_000);
    const t0 = performance.now();
    page(1_000);
    const ms = performance.now() - t0;
    console.log(`[perf] ssr page render: ${ms.toFixed(2)}ms`);
    assertBudget(ms, 50, 'ssr page render', { strict: true });
  });
});

describe('example server output', () => {
  it('Vite SSR: entry-server renders deterministically with the initial range', async (t) => {
    const entry = new URL('examples/vite-ssr/dist/server/entry-server.js', root);
    if (!existsSync(entry)) return t.skip('examples/vite-ssr is not built (npm run test:ssr builds it)');
    const { render } = (await import(entry.href)) as { render(): string };
    const a = render();
    assert.equal(a, render());
    assert.match(a, /role="grid"/);
    assert.ok(count(a, /role="row"/) <= 41, `${count(a, /role="row"/)} rows`);
    assert.equal(count(a, /<style/), 1);
  });

  it('Next.js App Router: prerendered page has the grid, the initial range and one theme block', (t) => {
    const html = new URL('examples/next-app/.next/server/app/index.html', root);
    if (!existsSync(html)) return t.skip('examples/next-app is not built (npm run test:ssr builds it)');
    const text = readFileSync(html, 'utf8');
    assert.match(text, /role="grid"/);
    assert.ok(count(text, /role="row"/) <= 41, `${count(text, /role="row"/)} rows`);
    assert.equal(count(text, /<style[^>]*salmonui-theme/), 1);
  });
});
