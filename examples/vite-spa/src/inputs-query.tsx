// QueryBuilder sections of examples/vite-spa/inputs.html
// (tests/browser/query-builder.spec.ts, query-builder-perf.spec.ts):
//   query       the full builder in a form (window.__qb is its API)
//   query-perf  a 200-rule controlled builder mounted on demand; rule renders
//               are counted in window.__qbRenders, the mount in __qbMountMs
import { useLayoutEffect, useRef, useState } from 'react';
import { QueryBuilder, type QueryBuilderApi, type QueryField, type QueryGroup, type QueryRuleRenderContext } from '@salmonui/query-builder';
import { toSql } from '@salmonui/query-builder/sql';
import { entries, log, Section } from './inputs-shared.tsx';
import '@salmonui/query-builder/styles.css';

declare global {
  interface Window {
    __qb?: QueryBuilderApi | null;
    __qbCancel?: string | null;
    __qbRenders?: Record<string, number>;
    __qbMountMs?: number;
    __qbT0?: number;
  }
}

const fields: QueryField[] = [
  { field: 'name', label: 'Name', category: 'Person', validation: { minLength: 2 } },
  { field: 'age', label: 'Age', type: 'number', category: 'Person', step: 5, validation: { max: 150 } },
  { field: 'joined', label: 'Joined', type: 'date' },
  { field: 'active', label: 'Active', type: 'boolean' },
  { field: 'tier', label: 'Tier', values: [{ value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }] },
  { field: 'address', label: 'Address', category: 'Place', fields: [{ field: 'city', label: 'City' }] },
];

const initial: QueryGroup = {
  logic: 'and',
  filters: [
    { id: 'r1', field: 'name', operator: 'contains', value: 'an' },
    { id: 'g1', logic: 'or', filters: [{ id: 'r2', field: 'age', operator: 'greaterThan', value: 30 }, { id: 'r3', field: 'address.city', operator: 'equal', value: 'Oslo' }] },
    { id: 'r4', field: 'tier', operator: 'equal', value: 'gold' },
  ],
};

const exposeApi = (api: QueryBuilderApi | null): void => {
  window.__qb = api;
};

/** Inline SQL of the value; incomplete rules have none. */
function sqlOf(value: QueryGroup): string {
  try {
    return toSql(value, { inline: true }).sql;
  } catch {
    return '(incomplete)';
  }
}

function Main() {
  const [value, setValue] = useState<QueryGroup>(initial);
  return (
    <form
      id="qb-form"
      onSubmit={(e) => {
        e.preventDefault();
        window.__inputForms!['qb'] = entries(e.currentTarget);
        log({ kind: 'qb-submit' });
      }}
    >
      <QueryBuilder
        id="qb"
        aria-label="Audience"
        fields={fields}
        value={value}
        notCondition
        reorderable
        validation
        maxGroups={3}
        matchCase
        buttons={{ clone: true, lock: true }}
        name="query"
        ref={exposeApi}
        onBeforeChange={(e) => {
          if (window.__qbCancel === e.action) e.preventDefault();
        }}
        onDragStart={(e) => log({ kind: 'qb-drag-start', nodeId: e.nodeId })}
        onDrop={(e) => log({ kind: 'qb-drop', nodeId: e.nodeId, groupId: e.targetGroupId, index: e.index, source: e.source })}
        onValueChange={(v, d) => {
          log({ kind: 'qb', action: d.action, nodeId: d.nodeId, source: d.source });
          setValue(v);
        }}
      />
      <output id="qb-sql">{sqlOf(value)}</output>
      <button type="submit" id="qb-submit">
        Submit
      </button>
      <button type="reset" id="qb-reset">
        Reset
      </button>
    </form>
  );
}

const PERF_FIELDS: QueryField[] = [{ field: 'name', label: 'Name' }, { field: 'age', label: 'Age', type: 'number' }];
const PERF_VALUE: QueryGroup = {
  logic: 'and',
  filters: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, field: i % 2 ? 'age' : 'name', operator: i % 2 ? 'greaterThan' : 'contains', value: i % 2 ? i : `n${i}` })),
};

function count(ctx: QueryRuleRenderContext) {
  const r = (window.__qbRenders ??= {});
  r[ctx.rule.id] = (r[ctx.rule.id] ?? 0) + 1;
  return (
    <>
      {ctx.fieldPicker}
      {ctx.operatorPicker}
      {ctx.valueEditor}
      {ctx.actions}
    </>
  );
}

function Perf() {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState(PERF_VALUE);
  return (
    <>
      <button
        type="button"
        id="qb-perf-mount"
        onClick={() => {
          window.__qbRenders = {};
          window.__qbT0 = performance.now();
          setShown((s) => !s);
        }}
      >
        Mount 200 rules
      </button>
      {shown ? <Mounted value={value} onChange={setValue} /> : null}
    </>
  );
}

function Mounted({ value, onChange }: { value: QueryGroup; onChange: (v: QueryGroup) => void }) {
  const done = useRef(false);
  useLayoutEffect(() => {
    if (done.current) return;
    done.current = true;
    window.__qbMountMs = performance.now() - (window.__qbT0 ?? 0);
  });
  return <QueryBuilder id="qb-perf" aria-label="Large query" fields={PERF_FIELDS} value={value} onValueChange={onChange} renderRule={count} />;
}

// `fieldPicker` switches between the tree and the list picker after mount.
function TreePicker() {
  const [picker, setPicker] = useState<'tree' | 'list'>('tree');
  return (
    <>
      <button type="button" id="qb-tree-switch" onClick={() => setPicker((p) => (p === 'tree' ? 'list' : 'tree'))}>
        {picker === 'tree' ? 'Use the list picker' : 'Use the tree picker'}
      </button>
      <QueryBuilder
        id="qb-tree"
        aria-label="Tree picker"
        fields={fields}
        fieldPicker={picker}
        defaultValue={{ logic: 'and', filters: [{ id: 't1', field: 'address.city', operator: 'equal', value: 'Oslo' }] }}
        onValueChange={(v) => log({ kind: 'qb-tree', fields: v.filters.map((f) => ('field' in f ? f.field : null)) })}
      />
    </>
  );
}

export function QuerySection() {
  return (
    <>
      <Section id="query" title="QueryBuilder">
        <Main />
        <QueryBuilder id="qb-summary" aria-label="Summary" fields={fields} defaultValue={initial} summary />
        <TreePicker />
      </Section>
      <Section id="query-perf" title="QueryBuilder 200 rules">
        <Perf />
      </Section>
    </>
  );
}
