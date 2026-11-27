'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { QueryBuilder, type QueryField, type QueryGroup, type QueryRule } from '@salmonui/query-builder';

const fields: QueryField[] = [
  { field: 'name', label: 'Name' },
  { field: 'age', label: 'Age', type: 'number' },
];

const NAMES = ['Ada', 'Grace', 'Linus', 'Hedy', 'Alan', 'Katherine', 'Edsger', 'Barbara', 'Dennis', 'Margaret'];

// 200 rules with stable ids (deterministic: SSR-safe).
const LARGE: QueryGroup = {
  logic: 'and',
  filters: Array.from({ length: 200 }, (_, i): QueryRule => ({
    id: `r${i}`,
    field: i % 2 ? 'age' : 'name',
    operator: i % 2 ? 'greaterThan' : 'contains',
    value: i % 2 ? 18 + (i % 50) : NAMES[(i / 2) % NAMES.length]!,
  })),
};

type Pending = { readonly kind: 'mount' | 'edit'; readonly start: number };

// mount and single-rule edit, click to commit, measured with performance.now().
export default function QueryBuilderLargeDemo() {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState<QueryGroup>(LARGE);
  const [result, setResult] = useState<{ mount?: number; edit?: number }>({});
  const pending = useRef<Pending | null>(null);

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const ms = performance.now() - p.start;
    setResult((r) => ({ ...r, [p.kind]: ms }));
  }, [shown, value]);

  const editRule = () => {
    pending.current = { kind: 'edit', start: performance.now() };
    setValue((v) => ({ ...v, filters: v.filters.map((f) => (f.id === 'r100' && !('filters' in f) ? { ...f, value: f.value === 'Ada' ? 'Grace' : 'Ada' } : f)) }));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            pending.current = shown ? null : { kind: 'mount', start: performance.now() };
            setShown((s) => !s);
          }}
        >
          {shown ? 'Unmount' : 'Mount 200 rules'}
        </Button>
        <Button type="button" variant="outline" disabled={!shown} onClick={editRule}>
          Edit rule 100
        </Button>
        <output aria-live="polite">
          {result.mount === undefined ? 'Not measured yet' : `Mount ${result.mount.toFixed(1)} ms (budget 50 ms)`}
          {result.edit === undefined ? '' : `; last edit ${result.edit.toFixed(1)} ms`}
        </output>
      </div>
      {shown ? (
        <div style={{ maxBlockSize: 420, overflow: 'auto' }}>
          <QueryBuilder aria-label="Large query" fields={fields} value={value} onValueChange={setValue} />
        </div>
      ) : null}
    </div>
  );
}
