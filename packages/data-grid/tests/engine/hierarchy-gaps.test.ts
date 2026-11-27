// Hierarchy export depth cap: `hierarchyExportDetail` nests child
// grids up to `maxDepth` levels below the root (default 7, the Excel outline
// limit). Levels deeper than the cap are dropped (the grid at the cap gets
// no detail hook), never clamped onto the last level.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, type ChildGridConfig } from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { createExportModel, createExportModule, hierarchyExportDetail, type ExportDetailRow, type ExportModel } from '@salmonui/data-grid/engine/export';
import { createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';

interface Node {
  readonly id: string;
  readonly parent: string;
  readonly level: number;
}

/** One node per level: n0 (root) > n1 > ... > n{levels}. */
const nodes: Node[] = Array.from({ length: 13 }, (_, level) => ({ id: `n${level}`, parent: level ? `n${level - 1}` : '', level }));

/** A child grid chain `levels` deep (every level reads the same node list). */
function chain(levels: number): ChildGridConfig {
  let config: ChildGridConfig | undefined;
  for (let i = 0; i < levels; i++) {
    config = {
      parentField: 'id',
      childField: 'parent',
      data: nodes,
      columns: [{ field: 'id', primaryKey: true }, { field: 'level' }],
      ...(config ? { childGrid: config } : {}),
    };
  }
  return config as ChildGridConfig;
}

function root(levels: number) {
  return createDataGridEngine({
    id: 'tree',
    getRowId: (r: Node) => r.id,
    columns: [{ field: 'id', primaryKey: true }, { field: 'level' }],
    dataSource: [nodes[0] as Node],
    modules: [createDetailModule<Node>(), createHierarchyModule<Node>(), createExportModule<Node>()],
    hierarchy: { childGrid: chain(levels) },
  });
}

function details<Row>(model: ExportModel<Row>): ExportDetailRow<Row>[] {
  return [...model.rows()].filter((r): r is ExportDetailRow<Row> => r.kind === 'detail');
}

/** The data row levels of every nested model, root first, following the first detail block. */
function levels(model: ExportModel<unknown>): number[][] {
  const out: number[][] = [];
  let at: ExportModel<unknown> | undefined = model;
  while (at) {
    out.push([...at.rows()].flatMap((r) => (r.kind === 'data' ? [(r.row as Node).level] : [])));
    at = details(at)[0]?.detail.model as ExportModel<unknown> | undefined;
  }
  return out;
}

function exported(levelsDeep: number, maxDepth?: number): ExportModel<unknown> {
  const engine = root(levelsDeep);
  const detail = hierarchyExportDetail(engine, 'all', undefined, maxDepth === undefined ? {} : { maxDepth });
  assert.ok(detail);
  return createExportModel(engine, { hierarchy: 'all', detail }) as unknown as ExportModel<unknown>;
}

describe('hierarchy export depth cap', () => {
  it('a 10-level child grid chain exports the root plus 7 child levels; deeper levels are dropped, not clamped', () => {
    const model = exported(10);
    const got = levels(model);
    // Root (level 0) and child levels 1..7: each model holds exactly its own level.
    assert.deepEqual(got, [[0], [1], [2], [3], [4], [5], [6], [7]]);
    // The level-7 model has no detail block: levels 8..10 are dropped, not merged into level 7.
    let deepest = model;
    for (let i = 0; i < 7; i++) deepest = details(deepest)[0]?.detail.model as ExportModel<unknown>;
    assert.equal(details(deepest).length, 0);
    assert.equal(deepest.dataRowCount, 1);
  });

  it('a chain at the cap (7 child levels) exports every level', () => {
    assert.deepEqual(levels(exported(7)), [[0], [1], [2], [3], [4], [5], [6], [7]]);
    assert.deepEqual(levels(exported(3)), [[0], [1], [2], [3]]);
  });

  it('maxDepth lowers the cap; maxDepth 0 returns no hierarchy hook', () => {
    assert.deepEqual(levels(exported(10, 2)), [[0], [1], [2]]);
    const engine = root(10);
    assert.equal(hierarchyExportDetail(engine, 'all', undefined, { maxDepth: 0 }), undefined);
    const user = () => null;
    assert.equal(hierarchyExportDetail(engine, 'all', user, { maxDepth: 0 }), user);
  });
});
