'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Item {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly children?: readonly Item[];
}

const files: Item[] = [
  {
    id: 'src',
    name: 'src',
    size: 0,
    children: [
      { id: 'src/app', name: 'app', size: 0, children: [{ id: 'src/app/page.tsx', name: 'page.tsx', size: 4 }, { id: 'src/app/layout.tsx', name: 'layout.tsx', size: 2 }] },
      { id: 'src/lib', name: 'lib', size: 0, children: [{ id: 'src/lib/api.ts', name: 'api.ts', size: 7 }, { id: 'src/lib/format.ts', name: 'format.ts', size: 3 }, { id: 'src/lib/theme.ts', name: 'theme.ts', size: 1 }] },
      { id: 'src/index.ts', name: 'index.ts', size: 1 },
    ],
  },
  { id: 'docs', name: 'docs', size: 0, children: [{ id: 'docs/guide.md', name: 'guide.md', size: 12 }, { id: 'docs/api.md', name: 'api.md', size: 9 }] },
  { id: 'package.json', name: 'package.json', size: 1 },
];

const columns: DataGridColumn<Item>[] = [
  { field: 'name', header: 'Name', width: 280 },
  { field: 'id', header: 'Path', primaryKey: true, width: 200 },
  { field: 'size', header: 'KB', type: 'number', align: 'end', width: 90 },
];

type Cascade = 'self' | 'cascade' | 'filtered';

const CASCADE_MODES = [
  { value: 'self', label: 'self (cascade: false)' },
  { value: 'cascade', label: 'hierarchy (cascade: true)' },
  { value: 'filtered', label: "filtered hierarchy (cascade: 'filtered')" },
];

export default function TreeCheckboxDemo() {
  const api = useRef<DataGridApi<Item> | null>(null);
  const [log, push] = useEventLog();
  const [mode, setMode] = useState<Cascade>('cascade');
  const [checked, setChecked] = useState<readonly string[]>([]);
  const cascade = mode === 'self' ? false : mode === 'cascade' ? true : 'filtered';
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Checkbox mode{' '}
          <Select aria-label="Checkbox mode" data={CASCADE_MODES} value={mode} onValueChange={(value) => value != null && setMode(value as Cascade)} />
        </label>
        <Button variant="outline" type="button" onClick={() => api.current?.selectRows(['docs'])}>
          Select docs
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.clearSelection()}>
          Clear
        </Button>
      </div>
      <DataGrid<Item>
        // The cascade mode is read when the tree is set up, so a switch mounts a new grid.
        key={mode}
        ref={api}
        aria-label="Project files"
        data={files}
        columns={columns}
        tree={{ checkbox: { cascade } }}
        selection={{ multiple: true }}
        filtering={{ ui: 'row' }}
        height={400}
        onSelectionChange={(event) => {
          setChecked(event.rowIds.map(String));
          push(`${event.target ?? event.source}: +${event.added.length} −${event.removed.length}, ${event.rowIds.length} selected`);
        }}
      />
      <p className="demo-status" aria-live="polite">
        Checked: {checked.length === 0 ? 'none' : checked.join(', ')}
      </p>
      <EventLog entries={log} />
    </>
  );
}
