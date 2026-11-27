'use client';

import { useState } from 'react';
import { FormRenderer, type FormSchema, type FormUiSchema } from '@salmonui/inputs/form-renderer';

const schema: FormSchema = {
  type: 'object',
  title: 'Create account',
  required: ['first', 'email', 'plan'],
  properties: {
    first: { type: 'string', title: 'First name', minLength: 2 },
    last: { type: 'string', title: 'Last name' },
    email: { type: 'string', title: 'Email', format: 'email' },
    password: { type: 'string', title: 'Password', minLength: 8 },
    age: { type: 'integer', title: 'Age', minimum: 18 },
    plan: { type: 'string', title: 'Plan', enum: ['free', 'pro'] },
    news: { type: 'boolean', title: 'Send me the newsletter', default: true },
    terms: { type: 'boolean', title: 'I accept the terms', const: true },
  },
};

const uiSchema: FormUiSchema = {
  layout: [['first', 'last'], 'email', ['password', 'age'], 'plan'],
  fields: { password: { widget: 'password' }, plan: { widget: 'radio', enumLabels: ['Free', 'Pro'] }, news: { widget: 'switch' } },
  submit: { label: 'Create account' },
};

// A schema-driven sign-up form; the last submit's data and validity are shown below it.
export default function FormRendererBasicsDemo() {
  const [result, setResult] = useState('Not submitted');
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 520 }}>
      <FormRenderer schema={schema} uiSchema={uiSchema} onSubmit={(data, { isValid }) => setResult(`${isValid ? 'Valid' : 'Invalid'}: ${JSON.stringify(data)}`)} />
      <output className="demo-log" style={{ display: 'block', marginBlockStart: 0, overflowWrap: 'anywhere' }}>{result}</output>
    </div>
  );
}
