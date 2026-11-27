'use client';

import { useState } from 'react';
import { compileValidationRules, NO_ERRORS } from '@salmonui/core/validation';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Form, type FieldValidation } from '@salmonui/inputs/form';
import { TextField } from '@salmonui/inputs/text-field';

interface Product {
  readonly id: number;
  readonly sku: string;
  readonly name: string;
}

// One rule object, used by a form field and by a Data Grid column.
const SKU_RULES = { required: true, pattern: ['^[A-Z]{3}-\\d{3}$', 'Use three capitals, a dash and three digits (ABC-123).'] } as const satisfies FieldValidation;

const products: Product[] = [
  { id: 1, sku: 'TEA-101', name: 'Green tea' },
  { id: 2, sku: 'COF-202', name: 'Espresso beans' },
  { id: 3, sku: 'MUG-303', name: 'Travel mug' },
];

const columns: DataGridColumn<Product>[] = [
  { field: 'id', header: 'Id', primaryKey: true, width: 70 },
  { field: 'sku', header: 'SKU', width: 140, validation: SKU_RULES },
  { field: 'name', header: 'Name', width: 180 },
];

const RUNS = 200_000;

/** Times the compiled built-in rules the way a field runs them on each keystroke. */
function benchmark(value: string): string {
  const validator = compileValidationRules(SKU_RULES);
  let shared = 0;
  const start = performance.now();
  for (let i = 0; i < RUNS; i++) if (validator.validate(value, null) === NO_ERRORS) shared++;
  const ms = performance.now() - start;
  const perCall = (ms * 1000) / RUNS;
  return `${RUNS.toLocaleString('en-US')} checks of ${JSON.stringify(value)}: ${perCall.toFixed(3)} µs each; ${shared.toLocaleString('en-US')} returned the shared empty NO_ERRORS array (no allocation)`;
}

// the same rules and the same compiled validator in a
// Form field and a Data Grid column, and the per-keystroke cost of the rules.
export default function FormSharedRulesDemo() {
  const [results, setResults] = useState<readonly string[]>([]);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Form aria-label="New product" style={{ maxInlineSize: 320 }} onSubmit={(event) => event.preventDefault()}>
        <TextField name="sku" label="SKU" validation={SKU_RULES} validateOn="change" defaultValue="tea-1" description="Same rules as the grid's SKU column" />
      </Form>
      <DataGrid<Product> aria-label="Products with SKU rules" data={products} columns={columns} resizeMode="auto" height="auto" virtualization={false} locale="en-US" editing={{ mode: 'row', confirmDiscard: false, guardUnsaved: false }} />
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <Button type="button" variant="outline" onClick={() => setResults([benchmark('ABC-123'), benchmark('abc')])}>
          Time the rules
        </Button>
      </div>
      <pre className="demo-log" style={{ marginBlockStart: 0 }} aria-label="Rule timing">
        {results.length === 0 ? '(press "Time the rules")' : results.join('\n')}
      </pre>
    </div>
  );
}
