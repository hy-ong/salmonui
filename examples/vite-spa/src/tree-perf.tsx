// Tree mode benchmark page (tests/browser/tree-perf.spec.ts): the shared `tree-large` fixture
// (tooling/bench/fixtures/tree-large.ts, 1,000,000 rows, depth 6, flat
// `parentId`, 10 columns of the `large` mix) in a fully expanded
// `<DataGrid tree={{ parentIdField: 'parentId' }}>`, with the measurement
// viewport of every browser budget (grid height 600 px, row height 36 px).
// A harness page, not an example: it is outside the budgeted index.html.
//
//   ?levels=20,180,1800,48000   rows per level (default: tree-large)
//   &drag                       rowDrag on (`moveRows(..., { position: 'into' })`)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { createTreeFixture, TREE_LARGE_COLUMNS, TREE_LARGE_LEVELS, type TreeFixtureRow } from '../../../tooling/bench/fixtures/tree-large.ts';

declare global {
  interface Window {
    __gridApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __fixtureMs?: number;
  }
}

const params = new URLSearchParams(location.search);
const levels = params.get('levels')?.split(',').map(Number) ?? TREE_LARGE_LEVELS;

const t0 = performance.now();
const { rows, keys, kinds } = createTreeFixture(levels, TREE_LARGE_COLUMNS);
window.__fixtureMs = performance.now() - t0;

const columns: DataGridColumn<TreeFixtureRow>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 90, pinned: 'start' },
  ...keys.map((field, c): DataGridColumn<TreeFixtureRow> => {
    const kind = kinds[c];
    if (kind === 'n') return { field, header: `Number ${c}`, type: 'number', format: 'N0', align: 'end', width: 140 };
    if (kind === 'd') return { field, header: `Date ${c}`, type: 'date', format: 'yMMMd', width: 150 };
    if (kind === 'b') return { field, header: `Flag ${c}`, type: 'boolean', displayAsCheckbox: true, align: 'center', width: 110 };
    // The tree column (s0) is wider for six indentation levels.
    return { field, header: `Text ${c}`, type: 'string', width: c === 0 ? 260 : 160, overflow: 'ellipsisWithTooltip' };
  }),
];

const tree = { parentIdField: 'parentId', column: 's0' } as const;

const mountStart = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <DataGrid<TreeFixtureRow>
      aria-label="Tree benchmark"
      data={rows}
      columns={columns}
      height={600}
      timeZone="UTC"
      tree={tree}
      {...(params.has('drag') ? { rowDrag: true } : {})}
      onReady={(api) => {
        window.__gridApi = api;
      }}
    />
  </StrictMode>,
);
// First painted viewport: the frame after the commit that rendered it (main.tsx method).
requestAnimationFrame(() => {
  setTimeout(() => {
    window.__mountMs = performance.now() - mountStart;
  }, 0);
});
