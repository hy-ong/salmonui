'use client';

import { useState } from 'react';
import { QueryBuilder, type QueryField, type QueryGroup } from '@salmonui/query-builder';
import { toMongo } from '@salmonui/query-builder/mongo';
import { toSql } from '@salmonui/query-builder/sql';

const fields: QueryField[] = [
  { field: 'product', label: 'Product' },
  { field: 'price', label: 'Price', type: 'number' },
  { field: 'stock', label: 'In stock', type: 'boolean' },
];

function convert(value: QueryGroup) {
  try {
    return { sql: toSql(value, { dialect: 'postgres' }), mongo: toMongo(value) };
  } catch {
    return null;
  }
}

// The value as parameterized SQL (postgres placeholders) and a MongoDB filter.
export default function QueryBuilderConvertersDemo() {
  const [value, setValue] = useState<QueryGroup>({
    logic: 'or',
    filters: [
      { field: 'product', operator: 'startsWith', value: "Chef's" },
      { field: 'price', operator: 'between', value: [10, 20] },
    ],
  });
  const out = convert(value);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <QueryBuilder aria-label="Products" fields={fields} value={value} onValueChange={setValue} validation />
      <pre className="demo-log" style={{ marginBlockStart: 0, maxBlockSize: 'none' }} tabIndex={0} aria-label="SQL and MongoDB output">
        {out ? `${out.sql.sql}\n${JSON.stringify(out.sql.params)}\n\n${JSON.stringify(out.mongo, null, 2)}` : 'Complete every condition to convert.'}
      </pre>
    </div>
  );
}
