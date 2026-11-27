'use client';

import { useMemo, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { filterRows, QueryBuilder, type Json, type QueryField, type QueryGroup, type QueryOperator } from '@salmonui/query-builder';
import { fromMongo, toMongo, type MongoFilter, type MongoOperatorContext } from '@salmonui/query-builder/mongo';
import { fromSql, toSql, type SqlOperatorContext } from '@salmonui/query-builder/sql';
import { TextArea, TextField } from '@salmonui/inputs/text-field';

const fields: QueryField[] = [
  { field: 'product', label: 'Product' },
  { field: 'price', label: 'Price', type: 'number' },
  { field: 'qty', label: 'Pack size', type: 'number' },
  { field: 'stock', label: 'In stock', type: 'boolean' },
];

// A custom operator: offered on number fields, evaluated by filterRows, serialized by the converter hooks.
const operators: QueryOperator[] = [
  {
    name: 'multipleOf',
    label: 'Multiple of',
    types: ['number'],
    evaluate: (cell, value) => typeof cell === 'number' && typeof value === 'number' && value !== 0 && cell % value === 0,
  },
];
const sqlHooks = { multipleOf: (c: SqlOperatorContext) => `MOD(${c.field}, ${c.param(c.value ?? 1)}) = 0` };
const mongoHooks = { multipleOf: (c: MongoOperatorContext): MongoFilter => ({ [c.field]: { $mod: [c.value, 0] } }) };

const rows = [
  { product: 'Desk lamp', price: 39, qty: 1, stock: true },
  { product: "Chef's knife", price: 84, qty: 1, stock: false },
  { product: 'Candles', price: 12, qty: 6, stock: true },
  { product: 'Tea lights', price: 9, qty: 24, stock: true },
  { product: 'Glasses', price: 28, qty: 4, stock: false },
];

const message = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export default function QueryBuilderSqlDemo() {
  const [value, setValue] = useState<QueryGroup>({
    logic: 'and',
    filters: [
      { field: 'qty', operator: 'multipleOf', value: 6 },
      { field: 'stock', operator: 'equal', value: true },
    ],
  });
  const [sqlText, setSqlText] = useState(`"price" > ? AND ("product" LIKE ? ESCAPE '!' OR "stock" = ?)`);
  const [paramsText, setParamsText] = useState('[10, "%lamp%", false]');
  const [named, setNamed] = useState(false);
  const [mongoText, setMongoText] = useState('{ "$or": [{ "price": { "$lt": 20 } }, { "product": { "$regex": "^Chef" } }] }');
  const [status, setStatus] = useState('');

  const out = useMemo(() => {
    try {
      return { sql: toSql(value, { inline: true, operators: sqlHooks }).sql, mongo: JSON.stringify(toMongo(value, { operators: mongoHooks })) };
    } catch {
      return null;
    }
  }, [value]);
  const matches = useMemo(() => filterRows(rows, value, fields, { operators }), [value]);

  const loadSql = () => {
    try {
      const params = paramsText.trim() ? (JSON.parse(paramsText) as Json[] | Record<string, Json>) : undefined;
      setValue(fromSql(sqlText, { named, ...(params === undefined ? {} : { params }) }));
      setStatus('Loaded from SQL');
    } catch (error) {
      setStatus(message(error));
    }
  };
  const loadMongo = () => {
    try {
      setValue(fromMongo(JSON.parse(mongoText) as MongoFilter));
      setStatus('Loaded from MongoDB');
    } catch (error) {
      setStatus(message(error));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <QueryBuilder aria-label="Products" fields={fields} operators={operators} value={value} onValueChange={setValue} />
      <output>Matches: {matches.map((r) => r.product).join(', ') || 'none'}</output>
      <pre className="demo-log" style={{ marginBlockStart: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{out ? `toSql (inline): ${out.sql || '(empty)'}\ntoMongo: ${out.mongo}` : 'Complete every condition to convert.'}</pre>
      <div style={{ display: 'grid', gap: 6 }}>
        <TextArea label="SQL WHERE expression" rows={2} value={sqlText} onValueChange={setSqlText} />
        <TextField label="Parameters (JSON array, or an object for named parameters)" value={paramsText} onValueChange={setParamsText} />
        <div className="demo-toolbar">
          <Checkbox checked={named} onCheckedChange={(checked) => setNamed(checked)}>
            Named parameters
          </Checkbox>
          <Button type="button" variant="outline" onClick={loadSql}>
            Load SQL
          </Button>
        </div>
        <TextArea label="MongoDB filter (JSON)" rows={2} value={mongoText} onValueChange={setMongoText} />
        <div className="demo-toolbar">
          <Button type="button" variant="outline" onClick={loadMongo}>
            Load MongoDB
          </Button>
        </div>
        <output aria-live="polite">{status}</output>
      </div>
    </div>
  );
}
