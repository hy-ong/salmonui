// Engine edge cuts: files on the
// default path never reach feature code through a shared helper. The graph is
// the runtime one the build emits: with `verbatimModuleSyntax`, only
// `import type` / `export type` statements are erased, so every other
// `import` / `export ... from` statement is an edge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const SRC = new URL('../../src/engine/', import.meta.url);

function runtimeImports(file: string): string[] {
  const text = readFileSync(new URL(file, SRC), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|[;\n])\s*(import|export)(\s+type\b)?[^;'"]*?(?:\bfrom\s*)?['"]\.\/([^'"]+)\.js['"]/g)) {
    if (m[2]) continue;
    out.push(`${m[3]}.ts`);
  }
  return out;
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const dep of runtimeImports(file)) visit(dep);
  };
  visit(entry);
  return seen;
}

function assertExcludes(entry: string, forbidden: readonly string[]): void {
  const reached = closure(entry);
  const hits = forbidden.filter((f) => reached.has(f));
  assert.deepEqual(hits, [], `${entry} reaches ${hits.join(', ')}`);
}

describe('@salmonui/data-grid/engine edge cuts', () => {
  it('parses runtime edges and skips type-only ones', () => {
    const edges = runtimeImports('aggregates.ts');
    assert.ok(edges.includes('aggregate-need.ts'));
    assert.ok(edges.includes('view-helpers.ts'));
    assert.ok(!edges.includes('detail-view.ts'), 'aggregates imports PlainView as a type only');
    assert.ok(!edges.includes('group-view.ts'), 'aggregates imports GroupView as a type only');
  });

  it('the sort module does not reach aggregates, the group tree, or the detail view', () => {
    assertExcludes('sort.ts', ['aggregates.ts', 'group-tree.ts', 'group-view.ts', 'detail-view.ts']);
  });

  it('the structural view helpers are class-free', () => {
    assert.deepEqual([...closure('view-helpers.ts')], ['view-helpers.ts']);
    assertExcludes('grouping.ts', ['detail-view.ts']);
    assertExcludes('aggregates.ts', ['detail-view.ts']);
    assertExcludes('export-model.ts', ['detail-view.ts']);
  });

  it('tree mode stays out of the root entry and of the modules with tree hooks', () => {
    const tree = ['tree.ts', 'tree-index.ts', 'tree-view.ts', 'tree-cascade.ts', 'tree-state.ts'];
    assert.deepEqual([...closure('tree-of.ts')], ['tree-of.ts'], 'treeOf (used by row drag and editing) is class-free');
    assertExcludes('index.ts', tree);
    for (const file of ['row-drag-drop.ts', 'edit.ts', 'view-helpers.ts', 'state-api.ts', 'selection.ts']) assertExcludes(file, tree);
    assert.ok(closure('tree.ts').has('tree-index.ts') && closure('tree.ts').has('tree-view.ts') && closure('tree.ts').has('tree-cascade.ts'));
  });

  it('the state API does not reach the storage binding', () => {
    assertExcludes('state-api.ts', ['persistence-binding.ts']);
    const facade = runtimeImports('persistence.ts');
    assert.ok(facade.includes('state-api.ts') && facade.includes('persistence-binding.ts'));
  });
});
