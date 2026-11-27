// Editing and clipboard gates on the `large` fixture (100k x 100), core
// side of the interaction budgets (inline
// edit start, single-cell commit, 1,000-cell batch commit, 1,000-cell paste).
// Same method as grouping-performance.test.ts: one warm-up, median of 5, gc
// between runs, one retry on a failing timing. A sort on n0, a `contains`
// filter on s0 and a 40-column search stay active so commits must take the
// incremental pipeline path.
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import {
  createFilterModule,
  createFocusModule,
  createDataGridEngine,
  createSearchModule,
  createSelectionModule,
  createSortModule,
  type DataGridCommand,
  type DataGridModule,
} from '@salmonui/data-grid/engine';
import { createClipboardModule } from '@salmonui/data-grid/engine/clipboard';
import { createEditApi, createEditModule } from '@salmonui/data-grid/engine/edit';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns: baseColumns } = wideFixture(ROWS);
// The fixture has no id column; added records need one (primary key).
const columns = [{ field: 'id', primaryKey: true, width: 160 }, ...baseColumns];

const SEARCH_COLUMNS = Array.from({ length: 40 }, (_, i) => `s${i}`);
// fill, copy: the 1,000-cell paste budget (50 ms); fillLarge (10,000 x 10 =
// 100,000 cells) and copyLarge (100,000 x 10 = 1,000,000 cells) are the
// "autofill over 10,000 rows" and "copy a 100,000 x 10 range" budgets.
// rowCommit: the single-cell commit budget applied to a row-mode save.
const BUDGET = { start: 16, commit: 4, rowCommit: 4, addRecord: 4, deleteRecord: 4, batch: 100, paste: 50, fill: 50, copy: 50, fillLarge: 500, copyLarge: 750, undo: 4 } as const;

type Modules = readonly DataGridModule<WideRow, any, any, string>[];

function makeEngine(mode: 'row' | 'cell' | 'batch', extra: { undo?: boolean } = {}) {
  const engine = createDataGridEngine<WideRow, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows.slice(),
    dev: false,
    instrument: true,
    modules: [
      createSearchModule<WideRow>(),
      createFilterModule<WideRow>(),
      createSortModule<WideRow>(),
      createSelectionModule<WideRow>(),
      createFocusModule<WideRow>(),
      createEditModule<WideRow>(),
      createClipboardModule<WideRow>(),
    ],
    edit: { mode, allowEditing: true, ...extra },
    selection: { mode: 'both', type: 'multiple' },
  });
  const setup: DataGridCommand[] = [
    { type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'asc' }] },
    { type: 'filter.byColumn', columnId: 's0', operator: 'contains', value: 'word' },
    { type: 'search.set', text: 'word', columnIds: SEARCH_COLUMNS },
  ];
  for (const c of setup) engine.dispatch(c);
  engine.getSnapshot();
  return { engine, api: createEditApi(engine) };
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
}

function measure(setup: () => () => void, runs = RUNS): number {
  setup()();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const body = setup();
    gc?.();
    const t = performance.now();
    body();
    times.push(performance.now() - t);
  }
  return median(times);
}

function gate(scenario: string, budget: number, run: () => number): void {
  let ms = run();
  if (ms > budget) {
    console.log(`[perf] ${scenario}: retrying once (${ms.toFixed(3)}ms)`);
    ms = run();
  }
  console.log(`[perf] ${scenario}: median=${ms.toFixed(3)}ms budget=${budget}ms load=${os.loadavg()[0]?.toFixed(2)}`);
  assertBudget(ms, budget, scenario);
}

describe('editing and clipboard (100k x 100, sort + filter + search active)', () => {
  it('cell mode: edit start and single-cell commit', () => {
    const { engine, api } = makeEngine('cell');
    let i = 0;
    gate('edit.start one cell', BUDGET.start, () =>
      measure(() => {
        const rowId = engine.getRowIdAt(100 + i++) as string;
        return () => {
          api.startEdit(rowId, 'n1');
        };
      }),
    );
    api.cancelEdit();
    gate('edit.commit one cell', BUDGET.commit, () =>
      measure(() => {
        api.cancelEdit();
        const rowId = engine.getRowIdAt(200 + i++) as string;
        api.startEdit(rowId, 'n1');
        api.setEditValue(rowId, 'n1', -1 - i);
        return () => {
          assert.equal(api.saveCell().status, 'applied');
        };
      }),
    );
    const inst = engine.getInstrumentation()!;
    assert.ok((inst.stageUpdates['sort'] ?? 0) > 0, 'commits take the incremental sort path');
    engine.dispose();
  });

  it('row mode: add one record and delete one record', () => {
    // Writes emit a local patch (added rows appended, removed rows through the
    // id index): the engine never recomputes every row id.
    const { engine, api } = makeEngine('row');
    let i = 0;
    gate('edit addRecord + commit one row', BUDGET.addRecord, () =>
      measure(() => {
        api.cancelEdit();
        const id = `added-${i++}`;
        api.addRow({ id, n0: 50_000 + i, s0: 'word-1' });
        return () => {
          assert.equal(api.save().status, 'applied');
          engine.getSnapshot();
        };
      }),
    );

    assert.ok(engine.getRowIndex('added-1') >= 0, 'added rows are in the sorted, filtered model');
    gate('edit deleteRecords one row', BUDGET.deleteRecord, () =>
      measure(() => {
        const rowId = engine.getRowIdAt(300 + i++) as string;
        return () => {
          assert.equal(api.deleteRows(rowId).status, 'applied');
          engine.getSnapshot();
        };
      }),
    );
    const inst = engine.getInstrumentation()!;
    assert.ok((inst.stageUpdates['sort'] ?? 0) >= 10, 'adds and deletes take the incremental sort path');
    engine.dispose();
  });

  it('batch mode: save 1,000 dirty cells', () => {
    let round = 0;
    gate('edit.saveBatch 1,000 cells', BUDGET.batch, () =>
      measure(() => {
        const { engine, api } = makeEngine('batch');
        round++;
        engine.batch(() => {
          for (let r = 0; r < 100; r++) {
            const rowId = engine.getRowIdAt(r * 7) as string;
            for (let c = 1; c <= 10; c++) api.setEditValue(rowId, `n${c}`, -(round * 1000 + r * 10 + c));
          }
        });
        assert.equal((engine.getModuleState('edit') as { dirtyCellCount: number }).dirtyCellCount, 1000);
        return () => {
          assert.equal(api.save().status, 'applied');
        };
      }),
    );
  });

  it('undo on: undo of a single-cell commit; recording 1,000 batch cell edits', () => {
    const { engine, api } = makeEngine('cell', { undo: true });
    let i = 0;
    gate('edit.undo one-cell commit', BUDGET.undo, () =>
      measure(() => {
        const rowId = engine.getRowIdAt(200 + i++) as string;
        api.startEdit(rowId, 'n1');
        api.setEditValue(rowId, 'n1', -1 - i);
        assert.equal(api.saveCell().status, 'applied');
        return () => {
          assert.equal(api.undo().status, 'applied');
        };
      }),
    );
    engine.dispose();
    let round = 0;
    gate('1,000 batch cell edits recorded + saveBatch (undo on)', BUDGET.batch, () =>
      measure(() => {
        const { engine: batchEngine, api: batchApi } = makeEngine('batch', { undo: true });
        round++;
        return () => {
          batchEngine.batch(() => {
            for (let r = 0; r < 100; r++) {
              const rowId = batchEngine.getRowIdAt(r * 7) as string;
              for (let c = 1; c <= 10; c++) batchApi.setEditValue(rowId, `n${c}`, -(round * 1000 + r * 10 + c));
            }
          });
          assert.equal(batchApi.canUndo(), true);
          assert.equal(batchApi.save().status, 'applied');
        };
      }),
    );
  });

  it('paste a 1,000-cell TSV range into batch drafts', () => {
    const lines: string[] = [];
    for (let r = 0; r < 100; r++) {
      const cells: string[] = [];
      for (let c = 0; c < 10; c++) cells.push(String(-1 - r * 10 - c));
      lines.push(cells.join('\t'));
    }
    const text = lines.join('\n');
    gate('clipboard.paste 100 x 10', BUDGET.paste, () =>
      measure(() => {
        const { engine } = makeEngine('batch');
        const rowId = engine.getRowIdAt(50) as string;
        engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId, columnId: 'n1' } } as DataGridCommand);
        return () => {
          engine.dispatch({ type: 'clipboard.paste', text } as DataGridCommand);
          const last = (engine.getModuleState('clipboard') as { lastPaste?: { applied: number } }).lastPaste;
          assert.equal(last?.applied, 1000);
        };
      }),
    );
  });

  it('cell mode: paste a 1,000-cell TSV range (commit path)', () => {
    const lines: string[] = [];
    for (let r = 0; r < 100; r++) {
      const cells: string[] = [];
      for (let c = 0; c < 10; c++) cells.push(String(-1 - r * 10 - c));
      lines.push(cells.join('\t'));
    }
    const text = lines.join('\n');
    let round = 0;
    gate('clipboard.paste 100 x 10 (cell mode, committed)', BUDGET.paste, () =>
      measure(() => {
        const { engine } = makeEngine('cell');
        round++;
        const rowId = engine.getRowIdAt(50 + round) as string;
        engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId, columnId: 'n1' } } as DataGridCommand);
        return () => {
          engine.dispatch({ type: 'clipboard.paste', text } as DataGridCommand);
          const last = (engine.getModuleState('clipboard') as { lastPaste?: { applied: number } }).lastPaste;
          assert.equal(last?.applied, 1000);
          assert.equal((engine.getModuleState('edit') as { dirtyCellCount: number }).dirtyCellCount, 0, 'cell mode commits, no drafts');
          engine.getSnapshot();
        };
      }),
    );
  });

  it('autofill 1,000 cells (fill handle): cell mode commit and batch drafts', () => {
    for (const mode of ['cell', 'batch'] as const) {
      gate(`clipboard.fill 1 x 10 to 100 x 10 (${mode} mode)`, BUDGET.fill, () =>
        measure(() => {
          const { engine } = makeEngine(mode);
          const source = engine.getRowIdAt(40) as string;
          const target = engine.getRowIdAt(139) as string;
          engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: source, columnId: 'n1' }, focus: { rowId: source, columnId: 'n10' } } as DataGridCommand);
          return () => {
            engine.dispatch({ type: 'clipboard.fill', target: { rowId: target, columnId: 'n10' } } as DataGridCommand);
            const last = (engine.getModuleState('clipboard') as { lastPaste?: { applied: number } }).lastPaste;
            assert.equal(last?.applied, 990);
            engine.getSnapshot();
          };
        }),
      );
    }
  });

  it('autofill over 10,000 rows (fillSelection): 1 x 10 tiled to 10,000 x 10', () => {
    for (const mode of ['cell', 'batch'] as const) {
      gate(`clipboard.fill 1 x 10 to 10,000 x 10 (${mode} mode)`, BUDGET.fillLarge, () =>
        measure(() => {
          const { engine } = makeEngine(mode);
          const source = engine.getRowIdAt(40) as string;
          const target = engine.getRowIdAt(10_039) as string;
          engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: source, columnId: 'n1' }, focus: { rowId: source, columnId: 'n10' } } as DataGridCommand);
          return () => {
            engine.dispatch({ type: 'clipboard.fill', target: { rowId: target, columnId: 'n10' } } as DataGridCommand);
            const last = (engine.getModuleState('clipboard') as { lastPaste?: { applied: number } }).lastPaste;
            assert.equal(last?.applied, 99_990);
            engine.getSnapshot();
          };
        }, 3),
      );
    }
  });

  it('copy a 1,000-cell range and a 100,000 x 10 range', () => {
    const { engine } = makeEngine('batch');
    const clip = (engine as unknown as { clipboard: { copy(o?: object): { cells: number; text: string } } }).clipboard;
    // s35..s39 and n0..n4: 10 columns, strings and formatted numbers.
    const select = (r0: number, r1: number) =>
      engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: engine.getRowIdAt(r0) as string, columnId: 's35' }, focus: { rowId: engine.getRowIdAt(r1) as string, columnId: 'n4' } } as DataGridCommand);
    select(100, 199);
    gate('clipboard.copy 100 x 10', BUDGET.copy, () =>
      measure(() => () => {
        assert.equal(clip.copy().cells, 1000);
      }),
    );
    select(0, 99_999);
    gate('clipboard.copy 100,000 x 10', BUDGET.copyLarge, () =>
      measure(() => () => {
        assert.equal(clip.copy().cells, 1_000_000);
      }, 3),
    );
    engine.dispose();
  });

  it('row mode: commit an edited row (three changed cells)', () => {
    const { engine, api } = makeEngine('row');
    let i = 0;
    gate('edit.commit one row (row mode, 3 cells)', BUDGET.rowCommit, () =>
      measure(() => {
        api.cancelEdit();
        const rowId = engine.getRowIdAt(200 + i++) as string;
        api.startEdit(rowId, 'n1');
        api.setEditValue(rowId, 'n1', -1 - i);
        api.setEditValue(rowId, 'n2', -2 - i);
        api.setEditValue(rowId, 's1', 'word-row');
        return () => {
          assert.equal(api.save().status, 'applied');
          engine.getSnapshot();
        };
      }),
    );
    const inst = engine.getInstrumentation()!;
    assert.ok((inst.stageUpdates['sort'] ?? 0) > 0, 'row commits take the incremental sort path');
    engine.dispose();
  });
});
