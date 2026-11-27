'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Form } from '@salmonui/inputs/form';
import { TextField } from '@salmonui/inputs/text-field';

const taken = async (value: unknown): Promise<string | null> => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return value === 'admin' ? 'This user name is taken.' : null;
};

// Rules from the Data Grid vocabulary, native constraints, an equalTo rule,
// an async rule and the submit outcome.
export default function FormValidationDemo() {
  const [result, setResult] = useState('');
  return (
    <Form
      style={{ display: 'grid', gap: 12, maxWidth: 360 }}
      onSubmit={(event) => {
        event.preventDefault();
        setResult(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
      }}
      onValidate={({ valid }) => !valid && setResult('Fix the highlighted fields.')}
    >
      <TextField name="user" label="User name" description="Try “admin”" validation={{ required: true, minLength: 3, validate: taken }} />
      <TextField name="email" label="Email" type="email" required />
      <TextField name="password" label="Password" type="password" validation={{ required: true, minLength: 8 }} />
      <TextField name="confirm" label="Confirm password" type="password" validation={{ validate: [(value, ctx) => value === ctx.formData?.get('password'), 'The passwords do not match.'] }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" tone="primary">Create account</Button>
        <Button type="reset" variant="outline" onClick={() => setResult('')}>
          Reset
        </Button>
      </div>
      <output>{result}</output>
    </Form>
  );
}
