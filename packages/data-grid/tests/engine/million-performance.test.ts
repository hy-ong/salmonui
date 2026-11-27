// `million` fixture gate:
// 1,000,000 local rows x 20 columns. Engine creation plus the first viewport
// read must stay O(rows) for ids only and O(visible cells) for values.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { createDataGridEngine, createLocalDataSource, type ColumnDef } from '@salmonui/data-grid/engine';

type Row = Record<string, string | number | boolean | Date> & { readonly id: string };

const ROWS = 1_000_000;
const COLUMNS = 20;
/** Budget for engine creation + first viewport read of `million` (Node, ref-desktop). */
const CREATE_BUDGET_MS = 500;
const VIEWPORT_BUDGET_MS = 10;
const gc = (globalThis as { gc?: () => void }).gc;

/**
 * Deterministic `million` fixture: the `large` column mix scaled to 20
 * columns (8 string, 6 number, 4 date, 2 boolean; the same pools and seed
 * as `wideFixture` and the vite-spa `createFixture(rows, 20)`).
 */
function millionFixture(rowCount: number): { rows: Row[]; columns: ColumnDef<Row>[] } {
  let state = 1;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const words = Array.from({ length: 256 }, (_, i) => `word-${i}`);
  const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));
  const kinds: string[] = [];
  for (let c = 0; c < COLUMNS; c++) {
    const slot = c % 10;
    kinds.push(slot < 4 ? 's' : slot < 7 ? 'n' : slot < 9 ? 'd' : 'b');
  }
  const keys = kinds.map((k, c) => `${k}${c}`);
  const rows: Row[] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, string | number | boolean | Date> = { id: `r${r}` };
    for (let c = 0; c < COLUMNS; c++) {
      const kind = kinds[c];
      row[keys[c] as string] = kind === 's' ? (words[next() & 255] as string) : kind === 'n' ? next() % 100000 : kind === 'd' ? (dates[next() % 365] as Date) : (next() & 1) === 1;
    }
    rows[r] = row as Row;
  }
  const columns: ColumnDef<Row>[] = [
    { field: 'id', primaryKey: true, width: 90, pinned: 'start' },
    ...keys.map((field, c): ColumnDef<Row> => {
      const kind = kinds[c];
      if (kind === 'n') return { field, type: 'number', format: 'N0', width: 140 };
      if (kind === 'd') return { field, type: 'date', format: 'yMMMd', width: 150 };
      if (kind === 'b') return { field, type: 'boolean', width: 110 };
      return { field, type: 'string', width: 160 };
    }),
  ];
  return { rows, columns };
}

describe('1M x 20 local `million` fixture', () => {
  const { rows, columns } = millionFixture(ROWS);

  it('creates the engine over 1M local rows and reads the first viewport within budget', () => {
    // Warm-up: steady-state JIT, not first parse.
    createDataGridEngine<Row>({ getRowId: (r) => r.id, columns, dataSource: rows.slice(0, 1000), dev: false }).dispose();
    gc?.();
    const samples: { create: number; viewport: number }[] = [];
    let cells = 0;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      // The React `DataGrid` wraps `data` arrays in a local source; measure that path.
      const engine = createDataGridEngine<Row>({ getRowId: (r) => r.id, columns, dataSource: createLocalDataSource<Row>(rows, { getRowId: (r) => r.id }), dev: false, instrument: true });
      const snapshot = engine.getSnapshot();
      const t1 = performance.now();
      const vp = snapshot.viewport;
      const visible = [...snapshot.columns.left, ...snapshot.columns.center.slice(vp.columns.start, vp.columns.end)];
      cells = 0;
      for (let i = vp.rows.start; i < vp.rows.end; i++) {
        const rowId = engine.getRowIdAt(i) as string;
        for (const col of visible) if (engine.getCellSnapshot(rowId, col.columnId)) cells++;
      }
      const t2 = performance.now();
      assert.equal(snapshot.rows.count, ROWS);
      assert.equal(engine.getInstrumentation()?.cellSnapshots, cells, 'only visible cells are read');
      samples.push({ create: t1 - t0, viewport: t2 - t1 });
      engine.dispose();
      gc?.();
    }
    const create = Math.min(...samples.map((s) => s.create));
    const viewport = Math.min(...samples.map((s) => s.viewport));
    console.log(`[perf] million rows=${ROWS} cols=${COLUMNS} create=${samples.map((s) => s.create.toFixed(1)).join('/')}ms viewport=${samples.map((s) => s.viewport.toFixed(2)).join('/')}ms cells=${cells}`);
    assertBudget(create, CREATE_BUDGET_MS, 'million engine creation', { strict: true });
    assertBudget(viewport, VIEWPORT_BUDGET_MS, 'million first viewport read', { strict: true });
  });
});
