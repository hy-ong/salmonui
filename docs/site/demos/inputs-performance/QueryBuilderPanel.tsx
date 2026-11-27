'use client';

import { QueryBuilder, type QueryField } from '@salmonui/query-builder';

const fields: QueryField[] = [
  { field: 'country', label: 'Country' },
  { field: 'total', label: 'Order total', type: 'number' },
];

/** Loaded with a dynamic import: the QueryBuilder subpath arrives as its own chunk. */
export default function QueryBuilderPanel() {
  return <QueryBuilder aria-label="Orders filter" fields={fields} defaultValue={{ logic: 'and', filters: [{ field: 'country', operator: 'equal', value: 'Japan' }] }} />;
}
