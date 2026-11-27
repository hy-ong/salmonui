'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn, type DataGridTreeFilterMode } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';

interface Employee {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly role: string;
  readonly city: string;
}

// Flat self-referential rows: `parentId` names the manager's row id (`getRowId` via the primary key).
const cities = ['Lyon', 'Oslo', 'Porto', 'Kyoto'];
const roles = ['Engineer', 'Designer', 'Analyst', 'Support'];
const firstNames = ['Ada', 'Bo', 'Cy', 'Dee', 'Eve', 'Finn', 'Gil', 'Hana', 'Ira', 'Jo', 'Kai', 'Liv'];

function createStaff(): Employee[] {
  const rows: Employee[] = [{ id: 'e0', parentId: null, name: 'Mara Quist', role: 'CEO', city: 'Oslo' }];
  let n = 1;
  for (let d = 0; d < 4; d++) {
    const director = `e${n++}`;
    rows.push({ id: director, parentId: 'e0', name: `${firstNames[d * 3]} Director`, role: 'Director', city: cities[d]! });
    for (let m = 0; m < 3; m++) {
      const manager = `e${n++}`;
      rows.push({ id: manager, parentId: director, name: `${firstNames[(d * 3 + m) % 12]} Lead ${d}${m}`, role: 'Manager', city: cities[(d + m) % 4]! });
      for (let r = 0; r < 5; r++) {
        const i = n++;
        rows.push({ id: `e${i}`, parentId: manager, name: `${firstNames[i % 12]} ${String.fromCharCode(65 + (i % 26))}.`, role: roles[(i + r) % 4]!, city: cities[(i * 7) % 4]! });
      }
    }
  }
  return rows;
}

const staff = createStaff();

const columns: DataGridColumn<Employee>[] = [
  { field: 'name', header: 'Name', width: 280 },
  { field: 'id', header: 'ID', primaryKey: true, width: 90 },
  { field: 'role', header: 'Role', width: 130 },
  { field: 'city', header: 'City', width: 120 },
];

const modes: readonly DataGridTreeFilterMode[] = ['ancestors', 'descendants', 'both', 'none'];
const MODES = modes.map((mode) => ({ value: mode, label: mode }));
const PAGE_BY = [
  { value: 'all', label: 'all (visible rows)' },
  { value: 'root', label: 'root (root rows with their subtrees)' },
];

export default function TreeFlatFilterDemo() {
  const [filterMode, setFilterMode] = useState<DataGridTreeFilterMode>('ancestors');
  const [pageBy, setPageBy] = useState<'all' | 'root'>('all');
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Filter mode{' '}
          <Select aria-label="Filter mode" data={MODES} value={filterMode} onValueChange={(value) => value != null && setFilterMode(value as DataGridTreeFilterMode)} />
        </label>
        <label>
          Page by{' '}
          <Select aria-label="Page by" data={PAGE_BY} value={pageBy} onValueChange={(value) => value != null && setPageBy(value as 'all' | 'root')} />
        </label>
      </div>
      <DataGrid<Employee>
        // pageBy is read with the paging setup, so a switch mounts a new grid.
        key={pageBy}
        aria-label="Organization chart"
        data={staff}
        columns={columns}
        tree={{ parentIdField: 'parentId', filterMode, pageBy, defaultExpanded: 2 }}
        filtering={{ ui: 'row' }}
        sorting
        paging={{ pageSize: 15 }}
        height={460}
      />
      <p className="demo-status">
        Type Lyon in the City filter: ancestors keeps each match with its managers, descendants keeps matches with their reports, none lists matches only. Rows kept only as context are dimmed.
      </p>
    </>
  );
}
