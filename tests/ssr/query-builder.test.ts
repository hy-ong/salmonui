// test:ssr for `@salmonui/query-builder` and its server-safe
// converters: the entries evaluate and render in Node with every DOM-like
// global removed; output is deterministic (path ids, no random or host
// values), so hydration matches.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { QueryBuilder } = await import('@salmonui/query-builder');
const { toSql } = await import('@salmonui/query-builder/sql');
const { toMongo } = await import('@salmonui/query-builder/mongo');

const fields = [{ field: 'name', label: 'Name' }, { field: 'age', label: 'Age', type: 'number' as const }, { field: 'joined', label: 'Joined', type: 'date' as const }, { field: 'ok', label: 'OK', type: 'boolean' as const }];
const value = { logic: 'and' as const, filters: [{ field: 'name', operator: 'contains', value: 'a' }, { logic: 'or' as const, not: true, filters: [{ field: 'age', operator: 'between', value: [1, 2] }, { field: 'joined', operator: 'equal', value: '2026-01-02' }, { field: 'ok', operator: 'equal', value: true }] }] };

describe('QueryBuilder SSR without DOM globals', () => {
  it('renders the tree deterministically in StrictMode', () => {
    const el = createElement(StrictMode, null, createElement(QueryBuilder, { fields, defaultValue: value, notCondition: true, reorderable: true, buttons: { clone: true, lock: true }, name: 'q' }));
    const a = renderToString(el);
    assert.equal(a, renderToString(el));
    assert.match(a, /data-node-id="q\.1\.2"/);
    assert.match(a, /<input type="hidden" name="q"/);
  });

  it('summary and readOnly render on the server', () => {
    assert.match(renderToString(createElement(QueryBuilder, { fields, defaultValue: value, summary: true })), /Name contains a AND NOT/);
    assert.doesNotMatch(renderToString(createElement(QueryBuilder, { fields, defaultValue: value, readOnly: true })), /data-action="addCondition"/);
  });

  it('the converters run without DOM globals', () => {
    assert.equal(toSql(value).sql, "name LIKE ? ESCAPE '!' AND NOT (age BETWEEN ? AND ? OR joined = ? OR ok = ?)");
    assert.ok('$and' in toMongo(value));
  });
});
