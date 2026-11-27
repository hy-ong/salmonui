'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';

type Value = string | number | boolean | Date | null;
type TreeRow = Record<string, Value> & { readonly id: string; readonly parentId: string | null };

/** The benchmark fixtures of the tree budgets (rows per level, roots first). */
const FIXTURES = {
  hierarchy: { label: 'hierarchy: 50,000 rows, depth 4', levels: [20, 180, 1800, 48000] },
  'tree-large': { label: 'tree-large: 1,000,000 rows, depth 6', levels: [10, 90, 900, 9000, 90000, 900000] },
} as const;
type FixtureName = keyof typeof FIXTURES;
const FIXTURE_ITEMS = (Object.keys(FIXTURES) as FixtureName[]).map((name) => ({ value: name, label: FIXTURES[name].label }));

const KINDS = ['s', 's', 's', 's', 'n', 'n', 'n', 'd', 'd', 'b'] as const;
const KEYS = KINDS.map((kind, c) => `${kind}${c}`);

/**
 * The fixture generator of the benchmark (one LCG, seed 1; 10 columns of the
 * `large` mix; each row's parent drawn from the level above). App work: never timed.
 */
function createTree(levels: readonly number[]): TreeRow[] {
  let state = 1;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const words = Array.from({ length: 256 }, (_, i) => `word-${i.toString(36)}-${(i * 7919) % 1000}`);
  const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));
  const rows: TreeRow[] = new Array(levels.reduce((a, b) => a + b, 0));
  let r = 0;
  let prevStart = 0;
  let prevSize = 0;
  for (const size of levels) {
    const start = r;
    for (let i = 0; i < size; i++, r++) {
      const row: Record<string, Value> = { id: `t${r}`, parentId: prevSize === 0 ? null : `t${prevStart + (next() % prevSize)}` };
      KINDS.forEach((kind, c) => {
        const key = KEYS[c] as string;
        if (kind === 's') row[key] = words[next() & 255] as string;
        else if (kind === 'n') row[key] = next() % 100000;
        else if (kind === 'd') row[key] = dates[next() % 365] as Date;
        else row[key] = ((next() >>> 16) & 1) === 1;
      });
      rows[r] = row as TreeRow;
    }
    prevStart = start;
    prevSize = size;
  }
  return rows;
}

const columns: DataGridColumn<TreeRow>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 100 },
  ...KEYS.map((field, c): DataGridColumn<TreeRow> => {
    const kind = KINDS[c];
    if (kind === 'n') return { field, header: `Number ${c}`, type: 'number', format: 'N0', align: 'end', width: 120 };
    if (kind === 'd') return { field, header: `Date ${c}`, type: 'date', format: 'yMMMd', width: 130 };
    if (kind === 'b') return { field, header: `Flag ${c}`, type: 'boolean', align: 'center', width: 90 };
    return { field, header: `Text ${c}`, type: 'string', width: c === 0 ? 260 : 150 };
  }),
];

/**
 * A small preview of the same generator (36 rows, depth 3), shown until a run
 * swaps in the generated fixture. Deterministic and immutable, so the server
 * and the client render the same markup.
 */
const PREVIEW: readonly TreeRow[] = createTree([3, 9, 24]);

// Tree column s0, every parent expanded, checkbox cascade (its state is the row selection).
const TREE = { parentIdField: 'parentId', column: 's0', filterMode: 'ancestors', checkbox: { cascade: true } } as const;

/**
 * Tree mode budgets, each defined on one fixture; `limit` applies to that fixture only.
 */
interface Budget {
  readonly text: string;
  readonly fixture: FixtureName;
  readonly limit?: number;
}
const BUDGETS = {
  create: { text: 'creation ≤ 500 ms (tree-large; index build alone ≤ 25 ms on hierarchy)', fixture: 'tree-large', limit: 500 },
  all: { text: '≤ 60 ms (hierarchy)', fixture: 'hierarchy', limit: 60 },
  branch: { text: '≤ 16 ms (hierarchy)', fixture: 'hierarchy', limit: 16 },
  cascade: { text: '≤ 16 ms (100,000 descendants, tree-large root)', fixture: 'tree-large', limit: 16 },
  sortCold: { text: '≤ 1.86 × the same sort on a flat grid (tree-large; flat side not run here)', fixture: 'tree-large' },
  sortWarm: { text: '≤ 180 ms warm (1.2 × flat, tree-large)', fixture: 'tree-large', limit: 180 },
  filterCold: { text: '≤ 1.86 × the same filter on a flat grid (tree-large; flat side not run here)', fixture: 'tree-large' },
  filterWarm: { text: '≤ 120 ms warm (1.2 × flat, tree-large)', fixture: 'tree-large', limit: 120 },
  move: { text: '≤ 16 ms to painted (hierarchy and tree-large)', fixture: 'tree-large', limit: 16 },
} satisfies Record<string, Budget>;
type BudgetKey = keyof typeof BUDGETS;

interface Timing {
  readonly row: string;
  readonly action: string;
  readonly ms: number;
  readonly budget: BudgetKey;
}

const TABLE = { inlineSize: '100%', minInlineSize: 640, marginBlockStart: 'var(--salmon-space-4)', borderCollapse: 'collapse', fontSize: 'var(--salmon-font-size-sm)' } as const;
const TD = { padding: 'var(--salmon-space-1) var(--salmon-space-3)', borderBlockEnd: '1px solid var(--salmon-border-subtle)', textAlign: 'start', verticalAlign: 'top' } as const;
const TH = { ...TD, borderBlockEnd: '1px solid var(--salmon-border-default)' } as const;

const fmt = (n: number) => n.toLocaleString('en-US');
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Two frames, so the previous step's render is painted before the next one starts. */
const settle = async () => {
  await nextFrame();
  await nextFrame();
};

function verdict(t: Timing, fixture: FixtureName): string {
  const budget: Budget = BUDGETS[t.budget];
  if (budget.limit === undefined) return 'reference only';
  if (budget.fixture !== fixture && t.budget !== 'move') return 'not the budget fixture';
  return t.ms <= budget.limit ? 'within budget' : 'over budget';
}

/** Generates a budget-sized tree, then times the tree operations through the public DataGrid API next to their budgets. */
export default function TreePerformanceDemo() {
  const id = useId();
  const [fixture, setFixture] = useState<FixtureName>('hierarchy');
  const [grid, setGrid] = useState<{ readonly rows: TreeRow[]; readonly fixture: FixtureName; readonly key: number } | null>(null);
  const [timings, setTimings] = useState<Timing[]>([]);
  const [status, setStatus] = useState('Showing a 36-row preview. Pick a fixture and press "Generate and measure"; nothing is timed until you do.');
  const [running, setRunning] = useState(false);
  // Resolves the run's wait for the mounted grid (written by the click handler, read by onReady).
  const ready = useRef<((api: DataGridApi<TreeRow>) => void) | null>(null);

  const run = async () => {
    setRunning(true);
    setTimings([]);
    const name = fixture;
    const levels = FIXTURES[name].levels;
    const total = levels.reduce((a, b) => a + b, 0);
    const rowLabel = fmt(total);
    const results: Timing[] = [];
    const record = (action: string, ms: number, budget: BudgetKey) => {
      results.push({ row: rowLabel, action, ms, budget });
      setTimings([...results]);
    };
    try {
      setStatus(`Generating ${rowLabel} rows…`);
      await settle();
      const g0 = performance.now();
      const rows = createTree(levels);
      const generation = performance.now() - g0;

      setStatus('Creating the grid…');
      const mounted = new Promise<DataGridApi<TreeRow>>((resolve) => {
        ready.current = resolve;
      });
      const c0 = performance.now();
      setGrid((prev) => ({ rows, fixture: name, key: (prev?.key ?? 0) + 1 }));
      const api = await mounted;
      record('Create the grid (engine, tree index, first render)', performance.now() - c0, 'create');
      await settle();

      // Engine time: the API call plus the snapshot read that computes the view (render excluded).
      const engine = (label: string, budget: BudgetKey, call: () => void) => {
        const t0 = performance.now();
        call();
        void api.engine.getSnapshot().rows.count;
        record(label, performance.now() - t0, budget);
      };
      // To painted: the call at the start of a frame, ended by a task after that frame's rendering.
      const painted = (label: string, budget: BudgetKey, call: () => void) =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            const t0 = performance.now();
            call();
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              record(label, performance.now() - t0, budget);
              resolve();
            };
            channel.port2.postMessage(0);
          });
        });

      setStatus('Measuring…');
      engine('Collapse all', 'all', () => api.collapseAllTreeRows());
      await settle();
      engine('Expand all', 'all', () => api.expandAllTreeRows());
      await settle();
      engine('Collapse one branch (root t0)', 'branch', () => api.toggleTreeRow('t0', false));
      await settle();
      engine('Expand one branch (root t0)', 'branch', () => api.toggleTreeRow('t0', true));
      await settle();
      engine('Cascade-check root t0 (its whole subtree)', 'cascade', () => api.engine.dispatch({ type: 'tree.check', rowId: 't0', checked: true }));
      await settle();
      engine('Cascade-uncheck root t0', 'cascade', () => api.engine.dispatch({ type: 'tree.check', rowId: 't0', checked: false }));
      await settle();
      engine('Sort siblings by Number 4, cold (sort keys extracted)', 'sortCold', () => api.sortColumn('n4', 'asc'));
      await settle();
      engine('Sort siblings by Number 4 descending, warm', 'sortWarm', () => api.sortColumn('n4', 'desc'));
      await settle();
      engine('Sort siblings by Number 4 ascending, warm', 'sortWarm', () => api.sortColumn('n4', 'asc'));
      await settle();
      api.clearSorting();
      await settle();
      engine("Filter Text 1 contains 'word-1', ancestors kept (first run)", 'filterCold', () => api.filterColumn('s1', 'contains', 'word-1'));
      await settle();
      api.clearFiltering();
      await settle();
      engine("Filter Text 1 contains 'word-1', ancestors kept (warm)", 'filterWarm', () => api.filterColumn('s1', 'contains', 'word-1'));
      await settle();
      api.clearFiltering();
      await settle();

      // A rendered row with a previous sibling: indent it under that sibling, then outdent it back.
      const rendered = [...(api.element?.querySelectorAll<HTMLElement>('[role="row"][data-row-id]') ?? [])].map((el) => el.dataset['rowId'] ?? '');
      const target = rendered.find((rowId) => {
        const info = api.getTreeRow(rowId);
        return info !== null && info.depth >= 1 && info.posinset > 1;
      });
      if (target) {
        await painted(`Indent row ${target}`, 'move', () => api.indentRows(target));
        await settle();
        await painted(`Outdent row ${target}`, 'move', () => api.outdentRows(target));
        await settle();
      }
      setStatus(`Done: ${fmt(total)} rows on ${FIXTURES[name].label}. Row generation took ${generation.toFixed(0)} ms and is excluded from every timing.`);
    } finally {
      ready.current = null;
      setRunning(false);
    }
  };

  const shown = grid?.fixture ?? fixture;
  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Benchmark fixture">
        <label htmlFor={`${id}-fixture`}>Fixture</label>
        <Select id={`${id}-fixture`} aria-label="Fixture" data={FIXTURE_ITEMS} value={fixture} disabled={running} onValueChange={(value) => value != null && setFixture(value as FixtureName)} />
        <Button variant="outline" type="button" disabled={running} onClick={() => void run()}>
          Generate and measure
        </Button>
      </div>
      <p className="demo-status" role="status">
        {status}
      </p>
      <DataGrid<TreeRow>
        key={grid?.key ?? 0}
        aria-label={grid ? `Generated tree, ${fmt(grid.rows.length)} rows` : `Preview tree, ${PREVIEW.length} rows`}
        data={grid?.rows ?? PREVIEW}
        columns={columns}
        getRowId={(row) => row.id}
        tree={TREE}
        selection={{ multiple: true }}
        sorting
        filtering
        rowDrag
        height={360}
        rowHeight={32}
        timeZone="UTC"
        locale="en-US"
        onReady={(api) => ready.current?.(api)}
      />
      {timings.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
        <table className="demo-timings" aria-label="Measured tree times" style={TABLE}>
          <thead>
            <tr>
              <th scope="col" style={TH}>
                Action
              </th>
              <th scope="col" style={{ ...TH, textAlign: 'end' }}>
                Rows
              </th>
              <th scope="col" style={{ ...TH, textAlign: 'end' }}>
                Measured
              </th>
              <th scope="col" style={TH}>
                Budget
              </th>
              <th scope="col" style={TH}>
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {timings.map((t) => (
              <tr key={t.action}>
                <td style={TD}>{t.action}</td>
                <td style={{ ...TD, textAlign: 'end', whiteSpace: 'nowrap' }}>{t.row}</td>
                <td style={{ ...TD, textAlign: 'end', whiteSpace: 'nowrap' }} data-timing>
                  {t.ms.toFixed(1)} ms
                </td>
                <td style={TD}>{BUDGETS[t.budget].text}</td>
                <td style={TD}>{verdict(t, shown)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
    </div>
  );
}
