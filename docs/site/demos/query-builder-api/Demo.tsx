'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { QueryBuilder, type QueryBuilderApi, type QueryBuilderButtons, type QueryField, type QueryGroup, type QueryGroupHeaderContext } from '@salmonui/query-builder';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

const fields: QueryField[] = [
  { field: 'customer', label: 'Customer' },
  { field: 'country', label: 'Country', values: ['Brazil', 'Japan', 'Kenya', 'Malaysia', 'Norway'] },
  { field: 'amount', label: 'Amount', type: 'number' },
  { field: 'placed', label: 'Placed', type: 'date' },
  { field: 'shipped', label: 'Shipped', type: 'boolean' },
];

const PRESET: QueryGroup = {
  logic: 'or',
  filters: [
    { field: 'country', operator: 'equal', value: 'Japan' },
    { logic: 'and', filters: [{ field: 'amount', operator: 'greaterThan', value: 500 }, { field: 'shipped', operator: 'equal', value: false }] },
  ],
};

type ButtonKey = keyof QueryBuilderButtons;
const BUTTONS: readonly ButtonKey[] = ['deleteRule', 'addGroup', 'deleteGroup', 'clone', 'lock'];

const MAX_GROUPS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const FIELD_SORTS = [
  { value: 'given', label: 'as given' },
  { value: 'asc', label: 'asc' },
  { value: 'desc', label: 'desc' },
];

// A group header with the default controls, the nesting depth and the actions.
function header(ctx: QueryGroupHeaderContext) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {ctx.controls}
      <small style={{ opacity: 0.75 }}>{ctx.isRoot ? 'Root group' : `Nested group, depth ${ctx.depth}`}</small>
      {ctx.actions}
    </div>
  );
}

export default function QueryBuilderApiDemo() {
  const api = useRef<QueryBuilderApi>(null);
  const buttonsLabel = useId();
  const [value, setValue] = useState<QueryGroup>({
    logic: 'and',
    filters: [
      { field: 'customer', operator: 'contains', value: 'Ltd' },
      { field: 'amount', operator: 'greaterThan', value: 100 },
    ],
  });
  const [buttons, setButtons] = useState<Record<ButtonKey, boolean>>({ deleteRule: true, addGroup: true, deleteGroup: true, clone: false, lock: false });
  const [maxGroups, setMaxGroups] = useState(3);
  const [addRuleToNewGroups, setAddRuleToNewGroups] = useState(true);
  const [autoSelectField, setAutoSelectField] = useState(false);
  const [autoSelectOperator, setAutoSelectOperator] = useState(true);
  const [fieldSort, setFieldSort] = useState<'asc' | 'desc' | null>(null);
  const [matchCase, setMatchCase] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [customHeader, setCustomHeader] = useState(true);
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  const [result, setResult] = useState('');
  const [log, push] = useEventLog(10);

  const check = (label: string, checked: boolean, set: (v: boolean) => void) => (
    <Checkbox key={label} checked={checked} onCheckedChange={(next) => set(next)}>
      {label}
    </Checkbox>
  );
  const show = (label: string, data: unknown) => setResult(`${label}: ${JSON.stringify(data)}`);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }} role="group" aria-labelledby={buttonsLabel}>
        <span id={buttonsLabel}>Buttons:</span>
        {BUTTONS.map((key) => check(key, buttons[key], (v) => setButtons((b) => ({ ...b, [key]: v }))))}
      </div>
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <label>
          maxGroups
          <Select aria-label="maxGroups" data={MAX_GROUPS} value={String(maxGroups)} onValueChange={(next) => next != null && setMaxGroups(Number(next))} />
        </label>
        <label>
          fieldSort
          <Select aria-label="fieldSort" data={FIELD_SORTS} value={fieldSort ?? 'given'} onValueChange={(next) => next != null && setFieldSort(next === 'given' ? null : (next as 'asc' | 'desc'))} />
        </label>
        {check('addRuleToNewGroups', addRuleToNewGroups, setAddRuleToNewGroups)}
        {check('autoSelectField', autoSelectField, setAutoSelectField)}
        {check('autoSelectOperator', autoSelectOperator, setAutoSelectOperator)}
        {check('matchCase', matchCase, setMatchCase)}
        {check('readOnly', readOnly, setReadOnly)}
        {check('Depth in group headers', customHeader, setCustomHeader)}
        {check('Confirm removals', confirmRemovals, setConfirmRemovals)}
      </div>
      <QueryBuilder
        ref={api}
        aria-label="Orders"
        fields={fields}
        value={value}
        onValueChange={(next, d) => {
          setValue(next);
          push(`onValueChange ${d.action} ${d.nodeId ?? ''} (${d.source})`);
        }}
        onBeforeChange={(event) => {
          const removal = event.action === 'removeCondition' || event.action === 'removeGroup';
          if (confirmRemovals && removal) event.preventDefault();
          push(`onBeforeChange ${event.action} ${event.nodeId ?? ''}${confirmRemovals && removal ? ': cancelled' : ''}`);
        }}
        validation
        buttons={buttons}
        maxGroups={maxGroups}
        addRuleToNewGroups={addRuleToNewGroups}
        autoSelectField={autoSelectField}
        autoSelectOperator={autoSelectOperator}
        fieldSort={fieldSort}
        matchCase={matchCase}
        readOnly={readOnly}
        {...(customHeader ? { renderGroupHeader: header } : {})}
      />
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <Button type="button" variant="outline" onClick={() => show('addRules', api.current?.addRules([{ field: 'country', operator: 'equal', value: 'Kenya' }]))}>
          api.addRules
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            show(
              'addGroups',
              api.current?.addGroups([{ logic: 'or', filters: [{ field: 'amount', operator: 'lessThan', value: 10 }, { field: 'amount', operator: 'greaterThan', value: 1000 }] }]),
            )
          }
        >
          api.addGroups
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const last = api.current?.getValue().filters.at(-1);
            if (last?.id) api.current?.remove(last.id);
            show('remove', last?.id ?? null);
          }}
        >
          api.remove(last)
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const first = api.current?.getValue().filters[0];
            show('getNode', first?.id ? api.current?.getNode(first.id) : null);
          }}
        >
          api.getNode(first)
        </Button>
        <Button type="button" variant="outline" onClick={() => api.current?.setValue(PRESET)}>
          api.setValue(preset)
        </Button>
        <Button type="button" variant="outline" onClick={() => api.current?.reset()}>
          api.reset()
        </Button>
        <Button type="button" variant="outline" onClick={() => show('getValidValue', api.current?.getValidValue())}>
          api.getValidValue()
        </Button>
        <Button type="button" variant="outline" onClick={() => show('validate', api.current?.validate())}>
          api.validate()
        </Button>
      </div>
      {result ? <output style={{ overflowWrap: 'anywhere' }}>{result}</output> : null}
      <pre className="demo-log" style={{ maxBlockSize: 200, marginBlockStart: 0 }} tabIndex={0} aria-label="Current value">
        {JSON.stringify(value, null, 1)}
      </pre>
      <EventLog entries={log} label="Query builder events" />
    </div>
  );
}
