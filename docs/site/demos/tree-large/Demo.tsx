'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Node {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly budget: number;
}

const REGIONS = ['North', 'South', 'East', 'West', 'Central', 'Coast', 'Highlands', 'Islands'];

/**
 * A deterministic sales tree: 8 regions × 25 areas × 20 stores × 6 departments
 * = 24,000 departments, 28,208 rows in all. Flat rows with `parentId`.
 */
function createSalesTree(): Node[] {
  const rows: Node[] = [];
  REGIONS.forEach((region, r) => {
    const rId = `r${r}`;
    rows.push({ id: rId, parentId: null, name: `${region} region`, budget: 0 });
    for (let a = 0; a < 25; a++) {
      const aId = `${rId}-a${a}`;
      rows.push({ id: aId, parentId: rId, name: `${region} area ${a + 1}`, budget: 0 });
      for (let s = 0; s < 20; s++) {
        const sId = `${aId}-s${s}`;
        rows.push({ id: sId, parentId: aId, name: `Store ${r + 1}.${a + 1}.${s + 1}`, budget: 0 });
        for (let d = 0; d < 6; d++) rows.push({ id: `${sId}-d${d}`, parentId: sId, name: ['Grocery', 'Bakery', 'Produce', 'Dairy', 'Household', 'Pharmacy'][d] as string, budget: 1_000 + ((r * 7 + a * 13 + s * 17 + d * 31) % 90) * 100 });
      }
    }
  });
  // Parents start with the sum of their children (rows are in pre-order, so walk them backwards).
  const sums = new Map<string, number>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] as Node;
    const budget = sums.get(row.id) ?? row.budget;
    if (sums.has(row.id)) rows[i] = { ...row, budget };
    if (row.parentId !== null) sums.set(row.parentId, (sums.get(row.parentId) ?? 0) + budget);
  }
  return rows;
}

const nodes = createSalesTree();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month's sales derived from the budget (read-only, no stored field). */
const monthColumn = (year: number, m: number): DataGridColumn<Node> => ({
  id: `y${year}m${m + 1}`,
  header: MONTHS[m] as string,
  type: 'number',
  format: 'N0',
  align: 'end',
  width: 90,
  editable: false,
  valueGetter: (row) => (row.budget === 0 ? null : Math.round((row.budget / 12) * (0.8 + (((row.budget + m * 37 + year) % 41) / 100)))),
});

// 2 × 12 month columns under stacked year headers; the center zone virtualizes its columns.
const columns: DataGridColumn<Node>[] = [
  { field: 'name', header: 'Unit', width: 260, pinned: 'start' },
  { field: 'id', header: 'ID', primaryKey: true, width: 140, editable: false },
  { field: 'budget', header: 'Budget', type: 'number', format: 'C0', align: 'end', width: 120, validation: { min: 0 } },
  ...[2025, 2026].map((year): DataGridColumn<Node> => ({ id: `y${year}`, header: String(year), columns: MONTHS.map((_, m) => monthColumn(year, m)) })),
];

export default function TreeLargeDemo() {
  const api = useRef<DataGridApi<Node> | null>(null);
  const [log, push] = useEventLog();
  const time = (label: string, run: () => unknown) => {
    const start = performance.now();
    run();
    push(`${label}: ${(performance.now() - start).toFixed(1)} ms`);
  };
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => time('expand all (28,208 rows)', () => api.current?.expandAllTreeRows())}>
          Expand all
        </Button>
        <Button variant="outline" onClick={() => time('collapse all', () => api.current?.collapseAllTreeRows())}>
          Collapse all
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.expandTreeRows(['r7', 'r7-a24', 'r7-a24-s19']);
            api.current?.scrollToRow('r7-a24-s19-d5');
          }}
        >
          Reveal the last department
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToColumn('y2026m12')}>
          Scroll to Dec 2026
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const preview = api.current?.getBatchPreview();
            push(`pending: ${preview?.dirtyCellCount ?? 0} dirty cells; selected: ${api.current?.getSelectedRowIds().length ?? 0} rows`);
          }}
        >
          Read pending changes
        </Button>
      </div>
      <DataGrid<Node>
        ref={api}
        aria-label="Sales tree, 28,208 rows by 27 columns"
        data={nodes}
        columns={columns}
        getRowId={(row) => row.id}
        // Row virtualization is always on over the tree view; the checkbox cascade is one range command.
        tree={{ parentIdField: 'parentId', defaultExpanded: 1, checkbox: { cascade: true } }}
        virtualization={{ columns: true }}
        selection={{ multiple: true }}
        editing={{ mode: 'batch', confirmDiscard: false, guardUnsaved: false }}
        toolbar={['save', 'cancel', 'columnChooser']}
        columnMenu
        resizable
        reorderable
        sorting
        height={460}
        rowHeight={32}
        locale="en-US"
        currency="USD"
        onSave={(event) => push(`saved: ${event.changed.length} rows`)}
      />
      <p className="demo-status">
        Expand all, scroll, then edit Budget cells far apart: batch drafts survive scrolling out of view. Check a region to select its whole subtree. Resize, reorder, pin or hide columns through the header, column menu or chooser; the Unit column keeps its toggle.
      </p>
      <EventLog entries={log} />
    </>
  );
}
