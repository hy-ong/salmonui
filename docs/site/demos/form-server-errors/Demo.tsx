'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@salmonui/buttons/button';
import { Form } from '@salmonui/inputs/form';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';

interface SaveState {
  readonly errors: Record<string, string>;
  readonly message: string;
  /** The submitted values: React resets an action form after the action, so the fields remount with them. */
  readonly values: { readonly handle: string; readonly email: string };
  readonly attempt: number;
}

const BEHAVIORS = [
  { value: 'native', label: 'native (block an invalid submit)' },
  { value: 'aria', label: 'aria (mark fields, submit anyway)' },
];

const TAKEN = new Set(['ada', 'grace', 'admin']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stands in for a server action: it answers after a delay with errors keyed by field name. */
async function saveProfile(previous: SaveState, formData: FormData): Promise<SaveState> {
  await wait(900);
  const values = { handle: String(formData.get('handle') ?? ''), email: String(formData.get('email') ?? '') };
  const handle = values.handle.trim().toLowerCase();
  const email = values.email.trim();
  const attempt = previous.attempt + 1;
  const errors: Record<string, string> = {};
  if (TAKEN.has(handle)) errors.handle = `The server says “${handle}” is taken.`;
  if (email.endsWith('@example.com')) errors.email = 'The server rejects example.com addresses.';
  if (handle === '') errors.handle = 'The server needs a handle.';
  return Object.keys(errors).length > 0 ? { errors, message: 'The server returned errors.', values, attempt } : { errors: {}, message: `Saved @${handle}.`, values, attempt };
}

/** Reads the pending state of the enclosing form through React 19 useFormStatus. */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone="primary" disabled={pending} aria-busy={pending} style={{ justifySelf: 'start' }}>
      {pending ? 'Saving…' : 'Save profile'}
    </Button>
  );
}

// Server errors from a React 19 action shown as field errors, blocking
// (native) or non-blocking (aria) client validation, and useFormStatus.
export default function FormServerErrorsDemo() {
  const [state, action] = useActionState(saveProfile, { errors: {}, message: 'Try the handle “ada” or an @example.com address.', values: { handle: '', email: '' }, attempt: 0 });
  const [behavior, setBehavior] = useState<'native' | 'aria'>('native');
  return (
    <>
      <div className="demo-toolbar">
        <label>
          validationBehavior
          <Select aria-label="validationBehavior" data={BEHAVIORS} value={behavior} onValueChange={(value) => value != null && setBehavior(value as 'native' | 'aria')} />
        </label>
      </div>
      <Form action={action} validationErrors={state.errors} validationBehavior={behavior} aria-label="Profile" style={{ display: 'grid', gap: 12, maxInlineSize: 380 }}>
        <TextField key={`handle-${state.attempt}`} defaultValue={state.values.handle} name="handle" label="Handle" validation={{ required: true, minLength: 2 }} startAdornment="@" />
        <TextField key={`email-${state.attempt}`} defaultValue={state.values.email} name="email" label="Email" type="email" validation={{ required: true, email: true }} />
        <SubmitButton />
      </Form>
      <p className="demo-status" role="status">
        {state.message}
      </p>
    </>
  );
}
