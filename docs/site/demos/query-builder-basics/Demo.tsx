'use client';

import { useMemo, useState } from 'react';
import { filterRows, QueryBuilder, type QueryField, type QueryGroup } from '@salmonui/query-builder';

const fields: QueryField[] = [
  { field: 'name', label: 'Name', category: 'Employee' },
  { field: 'age', label: 'Age', type: 'number', category: 'Employee', step: 1, validation: { min: 18, max: 70 } },
  { field: 'hired', label: 'Hired', type: 'date', format: 'yMMMd' },
  { field: 'remote', label: 'Remote', type: 'boolean' },
  { field: 'team', label: 'Team', values: ['Design', 'Platform', 'Sales'] },
  { field: 'office', label: 'Office', category: 'Location', fields: [{ field: 'city', label: 'City' }] },
];

const rows = [
  { name: 'Ada', age: 36, hired: '2021-03-01', remote: true, team: 'Platform', office: { city: 'London' } },
  { name: 'Grace', age: 45, hired: '2019-07-15', remote: false, team: 'Design', office: { city: 'New York' } },
  { name: 'Linus', age: 29, hired: '2023-01-09', remote: true, team: 'Platform', office: { city: 'Helsinki' } },
  { name: 'Margaret', age: 52, hired: '2015-11-30', remote: false, team: 'Sales', office: { city: 'Boston' } },
];

// NOT groups, lock, clone and drag handles; the rows below are filtered with filterRows.
export default function QueryBuilderBasicsDemo() {
  const [value, setValue] = useState<QueryGroup>({
    logic: 'and',
    filters: [
      { field: 'team', operator: 'equal', value: 'Platform' },
      { logic: 'or', filters: [{ field: 'age', operator: 'greaterThan', value: 30 }, { field: 'remote', operator: 'equal', value: true }] },
    ],
  });
  const shown = useMemo(() => filterRows(rows, value, fields), [value]);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <QueryBuilder aria-label="Employees" fields={fields} value={value} onValueChange={setValue} notCondition reorderable buttons={{ clone: true, lock: true }} />
      <output>Matches: {shown.map((r) => r.name).join(', ') || 'none'}</output>
      <QueryBuilder aria-label="Summary" fields={fields} value={value} onValueChange={setValue} summary />
    </div>
  );
}
