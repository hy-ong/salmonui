// Remote (lazy) group expansion state across block loads and re-reads:
// Salmon UI keys expansion by group path, so chunk loads ("Load more"), refreshes and query re-reads keep it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createGroupingModule, createSortModule, type ColumnDef, type GroupRowSnapshot } from '@salmonui/data-grid/engine';
import { createJsonDataSource, type JsonTransport, type WireReadRequest } from '@salmonui/data';
import { ORDER_FIELDS, orderServer, orders, type Order } from './helpers.ts';

const columns: ColumnDef<Order>[] = [
  { field: 'OrderID', type: 'number', primaryKey: true },
  { field: 'ShipCountry', type: 'string' },
  { field: 'ShipCity', type: 'string' },
  { field: 'Freight', type: 'number' },
];

async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

const FRANCE = '__g:[["ShipCountry","France"]]';
const GERMANY = '__g:[["ShipCountry","Germany"]]';
const BRAZIL = '__g:[["ShipCountry","Brazil"]]';
const LYON = '__g:[["ShipCountry","France"],["ShipCity","Lyon"]]';
const REIMS = '__g:[["ShipCountry","France"],["ShipCity","Reims"]]';

function setup(grouping: string[], lazyChunk: number) {
  const server = orderServer();
  const reads: WireReadRequest[] = [];
  const transport: JsonTransport = async (req) => {
    if ((req as { type?: string }).type !== 'write') reads.push(req as WireReadRequest);
    return JSON.parse(JSON.stringify(server.handle(req)));
  };
  const source = createJsonDataSource<Order>({ transport, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object' });
  const engine = createDataGridEngine({
    getRowId: (r: Order) => String(r.OrderID),
    columns,
    dataSource: source,
    modules: [createSortModule<Order>(), createGroupingModule<Order>()],
    grouping: { lazy: true, lazyChunk },
    defaultQuery: { grouping: grouping.map((columnId) => ({ columnId })) },
  });
  const grouping_ = (engine as unknown as { grouping: { getGroup(id: string): GroupRowSnapshot | undefined } }).grouping;
  const ids = (): string[] => Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i) as string);
  const childrenOf = (group: string): string[] => {
    const all = ids();
    const at = all.indexOf(group);
    if (at < 0) return [];
    const out: string[] = [];
    for (let i = at + 1; i < all.length && !(all[i] as string).startsWith('__g:'); i++) out.push(all[i] as string);
    return out;
  };
  return { engine, reads, group: (id: string) => grouping_.getGroup(id), ids, childrenOf };
}

describe('remote lazy group expansion across block loads and re-reads', () => {
  it('chunk loads of one group keep the expanded and collapsed state of the other groups', async () => {
    const all = orders();
    const { engine, group, childrenOf } = setup(['ShipCountry'], 5);
    await idle();
    // Expand France and Germany; expand then collapse Brazil (an explicit collapse).
    engine.dispatch({ type: 'grouping.toggle', group: FRANCE, expanded: true });
    engine.dispatch({ type: 'grouping.toggle', group: GERMANY, expanded: true });
    engine.dispatch({ type: 'grouping.toggle', group: BRAZIL, expanded: true });
    await idle();
    assert.equal(childrenOf(BRAZIL).length, 5);
    engine.dispatch({ type: 'grouping.toggle', group: BRAZIL, expanded: false });
    await idle();
    assert.equal(childrenOf(FRANCE).length, 5);
    assert.equal(childrenOf(GERMANY).length, 5);
    assert.deepEqual(childrenOf(BRAZIL), []);
    // Block loads of France (5 rows per chunk) until every row is loaded.
    const france = all.filter((o) => o.ShipCountry === 'France').length;
    let blocks = 0;
    while (group(FRANCE)?.hasMore && blocks < 100) {
      engine.dispatch({ type: 'grouping.loadMore', group: FRANCE });
      await idle();
      blocks++;
      // Every block load keeps the other groups as they were.
      assert.equal(group(GERMANY)?.expanded, true, `Germany after block ${blocks}`);
      assert.equal(childrenOf(GERMANY).length, 5, `Germany rows after block ${blocks}`);
      assert.equal(group(BRAZIL)?.expanded, false, `Brazil after block ${blocks}`);
      assert.deepEqual(childrenOf(BRAZIL), []);
      assert.equal(group(FRANCE)?.expanded, true);
    }
    assert.ok(blocks >= 2, 'several block loads');
    assert.equal(childrenOf(FRANCE).length, france);
    engine.dispose();
  });

  it('a refresh, a sort and a filter-free re-read reload every level and keep nested expansion by group path', async () => {
    const all = orders();
    const { engine, reads, group, ids, childrenOf } = setup(['ShipCountry', 'ShipCity'], 50);
    await idle();
    engine.dispatch({ type: 'grouping.toggle', group: FRANCE, expanded: true });
    await idle();
    engine.dispatch({ type: 'grouping.toggle', group: LYON, expanded: true });
    engine.dispatch({ type: 'grouping.toggle', group: GERMANY, expanded: true });
    await idle();
    const lyonRows = Math.min(50, all.filter((o) => o.ShipCity === 'Lyon').length);
    assert.equal(childrenOf(LYON).length, lyonRows);
    assert.ok(ids().includes(REIMS));
    assert.deepEqual(childrenOf(REIMS), [], 'Reims stays collapsed');
    const expect = () => {
      assert.equal(group(FRANCE)?.expanded, true);
      assert.equal(group(LYON)?.expanded, true);
      assert.equal(group(GERMANY)?.expanded, true);
      assert.equal(group(REIMS)?.expanded, false);
      assert.equal(childrenOf(LYON).length, lyonRows, 'Lyon rows reloaded');
      assert.deepEqual(childrenOf(REIMS), []);
      assert.ok(ids().includes('__g:[["ShipCountry","Germany"],["ShipCity","Münster"]]'), 'Germany children reloaded');
    };
    expect();
    // Re-read 1: refresh reloads the root and every expanded level from the server.
    let before = reads.length;
    engine.refresh();
    await idle();
    assert.ok(reads.length - before >= 3, `root + expanded levels re-read (${reads.length - before})`);
    expect();
    // Re-read 2: a sort change re-queries every level; expansion follows the group path, not the position.
    before = reads.length;
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'Freight', direction: 'desc' }] });
    await idle();
    assert.ok(reads.length > before);
    expect();
    const lyon = childrenOf(LYON).map((id) => engine.getRow(id) as unknown as Order);
    for (let i = 1; i < lyon.length; i++) assert.ok((lyon[i - 1] as Order).Freight >= (lyon[i] as Order).Freight, 'children re-read in the new order');
    // Collapse survives re-reads too.
    engine.dispatch({ type: 'grouping.toggle', group: LYON, expanded: false });
    await idle();
    engine.refresh();
    await idle();
    assert.equal(group(LYON)?.expanded, false);
    assert.deepEqual(childrenOf(LYON), []);
    assert.equal(group(FRANCE)?.expanded, true);
    engine.dispose();
  });
});
