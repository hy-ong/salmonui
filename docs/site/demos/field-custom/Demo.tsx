'use client';

import { useState } from 'react';
import { Field, FieldError } from '@salmonui/inputs/form';

// A native select wrapped in Field: label, description, rules and a manually placed error.
export default function FieldCustomDemo() {
  const [plan, setPlan] = useState('');
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <Field name="plan" label="Plan" description="You can change it later" value={plan} validation={{ required: [true, 'Pick a plan'] }} validateOn="change" errorPlacement="manual">
        {(field) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select {...field.inputProps} value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="">Choose…</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
            <FieldError />
          </div>
        )}
      </Field>
    </div>
  );
}
