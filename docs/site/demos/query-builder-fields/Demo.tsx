'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import {
  operatorsFor,
  QueryBuilder,
  type QueryBuilderApi,
  type QueryBuilderEditorProps,
  type QueryBuilderLocaleText,
  type QueryField,
  type QueryGroup,
  type QueryRuleRenderContext,
  type QueryValueEditorContext,
} from '@salmonui/query-builder';
import { Rating } from '@salmonui/inputs/rating';
import { Select } from '@salmonui/dropdowns/select';

const PICKERS = [
  { value: 'list', label: 'list' },
  { value: 'tree', label: 'tree' },
];
const TYPES = ['string', 'number', 'date', 'boolean'].map((value) => ({ value, label: value }));

// A custom value editor: a Rating that writes the rule's value with ctx.setValue.
function ratingEditor(ctx: QueryValueEditorContext) {
  return (
    <span role="group" aria-label={ctx.label} style={{ display: 'inline-flex', alignItems: 'center', minBlockSize: 32 }}>
      <Rating min={1} value={typeof ctx.value === 'number' ? ctx.value : 1} disabled={ctx.disabled} onValueChange={(next) => ctx.setValue(next)} />
    </span>
  );
}

const fields: QueryField[] = [
  { field: 'product', label: 'Product', category: 'Item', operators: ['contains', 'startsWith', 'equal'] },
  { field: 'price', label: 'Price', type: 'number', category: 'Item', format: 'C2', step: 0.5, validation: { required: true, min: 0, max: 500 } },
  { field: 'rating', label: 'Rating', type: 'number', category: 'Item', operators: ['equal', 'greaterThanOrEqual'], defaultValue: 4, renderValueEditor: ratingEditor },
  { field: 'released', label: 'Released', type: 'date', category: 'Item', format: 'yMMMd' },
  {
    field: 'tier',
    label: 'Tier',
    category: 'Customer',
    values: [
      { value: 'bronze', label: 'Bronze' },
      { value: 'silver', label: 'Silver' },
      { value: 'gold', label: 'Gold' },
    ],
    defaultValue: 'gold',
  },
  { field: 'address', label: 'Address', category: 'Customer', fields: [{ field: 'city', label: 'City' }] },
];

const GERMAN: Partial<QueryBuilderLocaleText> = {
  and: 'Und',
  or: 'Oder',
  addCondition: 'Bedingung hinzufügen',
  addGroup: 'Gruppe hinzufügen',
  removeCondition: 'Bedingung entfernen',
  removeGroup: 'Gruppe entfernen',
  filterField: 'Feld',
  filterValue: 'Wert',
  selectField: 'Feld wählen',
  selectOperator: 'Operator wählen',
  groupLabel: '{connector}-Gruppe',
  ruleLabel: 'Bedingung {index}',
  incomplete: 'Bedingung vervollständigen',
  operatorContains: 'Enthält',
  operatorStartsWith: 'Beginnt mit',
  operatorEqual: 'Gleich',
  operatorLessThan: 'Kleiner als',
  operatorGreaterThan: 'Größer als',
  operatorGreaterThanOrEqual: 'Größer oder gleich',
};

// Forwarded to the built-in editors: a search box in the field list, wider value editors.
const EDITORS: QueryBuilderEditorProps = { field: { searchable: true, searchPlaceholder: 'Search fields' }, value: { style: { minInlineSize: '14rem' } } };

// A rule row with its position and its errors.
function ruleRow(ctx: QueryRuleRenderContext) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, alignItems: 'start', flex: '1 1 100%' }}>
      <span aria-hidden="true" style={{ minInlineSize: 20, lineHeight: '32px', fontWeight: 600 }}>
        {ctx.index + 1}.
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10em, 1fr))', gap: 8, alignItems: 'center' }}>
        {ctx.fieldPicker}
        {ctx.operatorPicker}
        {ctx.valueEditor}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minBlockSize: 32 }}>{ctx.actions}</div>
    </div>
  );
}

export default function QueryBuilderFieldsDemo() {
  const api = useRef<QueryBuilderApi>(null);
  const [value, setValue] = useState<QueryGroup>({
    logic: 'and',
    filters: [
      { field: 'product', operator: 'contains', value: 'lamp' },
      { field: 'price', operator: 'lessThan', value: 49.5 },
      { field: 'rating', operator: 'greaterThanOrEqual', value: 4 },
      { field: 'released', operator: 'greaterThan', value: '2025-01-01' },
      { field: 'tier', operator: 'equal', value: 'gold' },
    ],
  });
  const [picker, setPicker] = useState<'list' | 'tree'>('list');
  const [tuned, setTuned] = useState(false);
  const [german, setGerman] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);
  const [type, setType] = useState<'string' | 'number' | 'date' | 'boolean'>('number');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar">
        <label>
          Field picker
          <Select aria-label="Field picker" data={PICKERS} value={picker} onValueChange={(next) => next != null && setPicker(next as 'list' | 'tree')} />
        </label>
        <Checkbox checked={tuned} onCheckedChange={(checked) => setTuned(checked)}>
          Searchable fields, wide values
        </Checkbox>
        <Checkbox checked={german} onCheckedChange={(checked) => setGerman(checked)}>
          German labels
        </Checkbox>
        <Button type="button" variant="outline" onClick={() => setValid(api.current?.validate() ?? null)}>
          Validate
        </Button>
        <output>{valid === null ? '' : valid ? 'Valid' : 'Fix the marked conditions'}</output>
      </div>
      <QueryBuilder
        ref={api}
        aria-label="Products"
        fields={fields}
        value={value}
        onValueChange={setValue}
        validation
        fieldPicker={picker}
        {...(tuned ? { editorProps: EDITORS } : {})}
        {...(german ? { localeText: GERMAN } : {})}
        renderRule={ruleRow}
      />
      <QueryBuilder aria-label="Summary" fields={fields} value={value} onValueChange={setValue} summary />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Default operators of
          <Select aria-label="Default operators of" data={TYPES} value={type} onValueChange={(next) => next != null && setType(next as typeof type)} />
        </label>
        <span>
          fields (<code>operatorsFor</code>): <output>{operatorsFor(type).join(', ')}</output>
        </span>
      </div>
    </div>
  );
}
