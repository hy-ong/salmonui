'use client';

import { useRef, useState } from 'react';
import type { RowId } from '@salmonui/core/data';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridPersistState, type DataGridState } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Ticket {
  readonly id: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly assignee: string;
  readonly points: number;
  /** Initial expansion read through `tree.expandedField`. */
  readonly open: boolean;
}

// Flat rows. With the checkbox, T-9 names a parent that does not exist (an orphan) and T-10 / T-11 point at each
// other (a cycle): both end up as roots instead of disappearing.
const tickets: Ticket[] = [
  { id: 'T-1', parentId: null, title: 'Checkout redesign', assignee: 'Ana', points: 13, open: true },
  { id: 'T-2', parentId: 'T-1', title: 'Payment step', assignee: 'Ben', points: 5, open: false },
  { id: 'T-3', parentId: 'T-2', title: 'Card form validation', assignee: 'Ben', points: 3, open: false },
  { id: 'T-4', parentId: 'T-2', title: 'Wallet buttons', assignee: 'Chen', points: 2, open: false },
  { id: 'T-5', parentId: 'T-1', title: 'Order summary', assignee: 'Dara', points: 3, open: false },
  { id: 'T-6', parentId: null, title: 'Search speed-up', assignee: 'Eli', points: 8, open: false },
  { id: 'T-7', parentId: 'T-6', title: 'Index warm-up', assignee: 'Eli', points: 5, open: false },
  { id: 'T-8', parentId: 'T-6', title: 'Result cache', assignee: 'Fay', points: 3, open: false },
];

// Added from the checkbox: the grid then logs one development warning for each problem.
const broken: Ticket[] = [
  { id: 'T-9', parentId: 'T-404', title: 'Orphan: parent was deleted', assignee: 'Gus', points: 1, open: false },
  { id: 'T-10', parentId: 'T-11', title: 'Cycle: blocks T-11', assignee: 'Hal', points: 2, open: false },
  { id: 'T-11', parentId: 'T-10', title: 'Cycle: blocks T-10', assignee: 'Hal', points: 2, open: false },
];

const withProblems: Ticket[] = [...tickets, ...broken];

const PARENTS = ['T-1', 'T-2', 'T-6'] as const;
const OVERRIDES = [
  { value: 'default', label: 'from data' },
  { value: 'true', label: 'expanded' },
  { value: 'false', label: 'collapsed' },
];

const fieldsetStyle = { margin: '0 0 var(--salmon-space-4)', padding: 'var(--salmon-space-2) var(--salmon-space-3) var(--salmon-space-3)', border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)' } as const;

const columns: DataGridColumn<Ticket>[] = [
  { field: 'title', header: 'Ticket', width: 280 },
  { field: 'id', header: 'ID', primaryKey: true, width: 90 },
  { field: 'assignee', header: 'Assignee', width: 120 },
  { field: 'points', header: 'Points', type: 'number', align: 'end', width: 90 },
];

// Saved to localStorage under `salmon-data-grid:docs-tree-state` after every change, the tree
// expansion included, and restored after mount. Constant: the prop is read on mount.
const persistState: DataGridPersistState = { version: 1 };

export default function TreeStateDemo() {
  const api = useRef<DataGridApi<Ticket> | null>(null);
  const [overrides, setOverrides] = useState<Readonly<Record<RowId, boolean>>>({});
  const [withGrouping, setWithGrouping] = useState(false);
  const [withBroken, setWithBroken] = useState(false);
  const [saved, setSaved] = useState<DataGridState | null>(null);
  const [log, push] = useEventLog();
  const setOverride = (rowId: RowId, value: boolean | null) =>
    setOverrides((current) => {
      const next = { ...current };
      if (value === null) delete next[rowId];
      else next[rowId] = value;
      return next;
    });
  return (
    <>
      <fieldset className="demo-toolbar" style={fieldsetStyle}>
        <legend>tree.expandedRows (reactive overrides)</legend>
        {PARENTS.map((rowId) => (
          <label key={rowId}>
            {rowId}{' '}
            <Select aria-label={rowId} data={OVERRIDES} value={rowId in overrides ? String(overrides[rowId]) : 'default'} onValueChange={(value) => value != null && setOverride(rowId, value === 'default' ? null : value === 'true')} />
          </label>
        ))}
      </fieldset>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            const state = api.current?.getState() ?? null;
            setSaved(state);
            push(`getState(): tree.expandedRows ${JSON.stringify(state?.tree?.expandedRows ?? {})}`);
          }}
        >
          Save state
        </Button>
        <Button
          variant="outline"
          disabled={saved === null}
          onClick={() => {
            if (!saved) return;
            const result = api.current?.restoreState(saved);
            push(`restoreState(): ${result?.status ?? 'no grid'}`);
          }}
        >
          Restore state
        </Button>
        <Checkbox checked={withBroken} onCheckedChange={(checked) => setWithBroken(checked)}>
          Add an orphan and a cycle
        </Checkbox>
        <Checkbox checked={withGrouping} onCheckedChange={(checked) => setWithGrouping(checked)}>
          Also pass grouping by Assignee
        </Checkbox>
      </div>
      <DataGrid<Ticket>
        // A new grid when the grouping prop changes: `tree` and `grouping` are read when the grid is created.
        key={withGrouping ? 'grouped' : 'plain'}
        ref={api}
        id="docs-tree-state"
        aria-label="Tickets"
        data={withBroken ? withProblems : tickets}
        columns={columns}
        getRowId={(row) => row.id}
        // Initial expansion from the `open` field, overridden per row by `expandedRows`.
        tree={{ parentIdField: 'parentId', expandedField: 'open', expandedRows: overrides }}
        {...(withGrouping ? { grouping: { groupBy: ['assignee'] } } : {})}
        persistState={persistState}
        sorting
        selection={{ multiple: true }}
        height={400}
        onTreeToggle={(event) => push(`onTreeToggle ${String(event.rowId)} ${event.expanded ? 'expanded' : 'collapsed'} (${event.source})`)}
        // Shared Data Grid events keep their meaning in tree mode.
        onSortChange={(event) => push(`onSortChange ${JSON.stringify(event.sortBy)}`)}
        onSelectionChange={(event) => push(`onSelectionChange ${api.current?.getSelectedRowIds().join(', ') ?? ''} (${event.source})`)}
      />
      <p className="demo-status">
        T-1 starts expanded because its <code>open</code> field is true. Toggle rows, sort, then reload the page: the expansion comes back from storage. With grouping passed too, the grid stays a tree (tree wins; development builds warn).
      </p>
      <EventLog entries={log} />
    </>
  );
}
