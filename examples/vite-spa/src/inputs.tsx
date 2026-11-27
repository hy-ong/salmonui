// Inputs and Forms browser page (tests/browser/inputs-*.spec.ts, IN1..IN9).
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it
//   ?only=<section ids>  comma-separated sections to render (default all)
//
// window.__inputs records callbacks as plain objects; window.__inputForms holds
// the entries of the last submission of a form (keyed by form id).
import { StrictMode, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import '@salmonui/inputs/color-picker/styles.css';
import '@salmonui/inputs/file-upload/styles.css';
import '@salmonui/inputs/form-renderer/styles.css';
import '@salmonui/inputs/otp-field/styles.css';
import '@salmonui/inputs/rating/styles.css';
import '@salmonui/inputs/signature-pad/styles.css';
import '@salmonui/inputs/slider/styles.css';
import '@salmonui/inputs/speech-to-text/styles.css';
import '@salmonui/query-builder/styles.css';
import './app.css';
import { Field, FieldError, Form } from '@salmonui/inputs/form';
import { TextArea, TextField } from '@salmonui/inputs/text-field';
import { ThemeProvider } from '@salmonui/core/theme';
import { sections } from './inputs-sections.tsx';
import { entries, log, Section } from './inputs-shared.tsx';


const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

function ControlledText() {
  const [value, setValue] = useState('Ada');
  return (
    <>
      <TextField id="tf-controlled" label="Controlled" value={value} onValueChange={(v, d) => (log({ kind: 'controlled', value: v, reason: d.reason }), setValue(v))} clearable />
      <output id="tf-controlled-out">{value}</output>
    </>
  );
}

function RulesToggle() {
  const [strict, setStrict] = useState(true);
  return (
    <>
      <TextField id="rules-field" label="Rules" validateOn="change" validation={strict ? { minLength: 3 } : undefined} />
      <button type="button" id="rules-toggle" onClick={() => setStrict((s) => !s)}>
        Toggle rules
      </button>
    </>
  );
}

function SubmitState() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" id="action-submit" data-pending={pending ? '' : undefined}>
      {pending ? 'Saving' : 'Save'}
    </button>
  );
}

async function save(_: { errors: Record<string, string> }, data: FormData): Promise<{ errors: Record<string, string> }> {
  await new Promise((r) => setTimeout(r, 150));
  window.__inputForms!['action'] = entries(data);
  return data.get('user') === 'taken' ? { errors: { user: 'This user name is taken.' } } : { errors: {} };
}

function ActionForm() {
  const [state, action] = useActionState(save, { errors: {} });
  return (
    <Form id="action-form" action={action} validationErrors={state.errors}>
      <TextField name="user" label="User name" validation={{ required: true }} />
      <SubmitState />
      <output id="action-state">{JSON.stringify(state.errors)}</output>
    </Form>
  );
}

function FormsSection() {
  return (
    <>
      <Section id="text" title="TextField and TextArea">
        <TextField id="tf-basic" label="Name" description="Your full name" placeholder="Ada Lovelace" name="name" onValueChange={(v, d) => log({ kind: 'text', value: v, reason: d.reason, source: d.source })} />
        <TextField id="tf-clear" label="Search" type="search" clearable defaultValue="salmon" onValueChange={(v, d) => log({ kind: 'clear', value: v, reason: d.reason })} />
        <TextField id="tf-adorn" label="Price" startAdornment={<span>$</span>} endAdornment={<span>USD</span>} size="sm" />
        <ControlledText />
        <TextArea id="ta-auto" label="Notes" autoResize rows={2} resize="vertical" />
        <TextField id="tf-disabled" label="Disabled" disabled defaultValue="x" />
        <TextField id="tf-readonly" label="Read only" readOnly defaultValue="fixed" />
      </Section>
      <Section id="form" title="Form validation">
        <Form
          id="signup"
          onSubmit={(e) => {
            e.preventDefault();
            window.__inputForms!['signup'] = entries(e.currentTarget);
            log({ kind: 'submit', form: 'signup' });
          }}
          onValidate={(r) => log({ kind: 'validate', valid: r.valid, names: Object.keys(r.errors) })}
        >
          <TextField id="f-email" name="email" label="Email" type="email" validation={{ required: true, email: true }} defaultValue="" />
          <TextField id="f-native" name="code" label="Code" required minLength={3} pattern="[A-Z]+" />
          <TextField id="f-password" name="password" label="Password" type="password" defaultValue="secret" />
          <TextField
            id="f-confirm"
            name="confirm"
            label="Confirm password"
            type="password"
            validation={{ validate: [(v, ctx) => v === ctx.formData?.get('password'), 'Passwords differ'] }}
          />
          <TextField id="f-async" name="handle" label="Handle" validation={{ validate: async (v) => (await new Promise((r) => setTimeout(r, 100)), v === 'taken' ? 'Handle taken' : null) }} />
          <TextField id="f-change" name="live" label="Live" validateOn="change" validation={{ maxLength: 3 }} />
          <Field id="f-plan" name="plan" label="Plan">
            {(f) => (
              <select {...f.inputProps} required defaultValue="">
                <option value="">Choose</option>
                <option value="pro">Pro</option>
              </select>
            )}
          </Field>
          <button type="submit" id="signup-submit">
            Sign up
          </button>
          <button type="reset" id="signup-reset">
            Reset
          </button>
        </Form>
        <Form id="aria-form" validationBehavior="aria" onSubmit={(e) => (e.preventDefault(), log({ kind: 'submit', form: 'aria' }))}>
          <TextField id="a-email" name="email" label="Email (aria)" validation={{ required: true }} />
          <Field label="Custom error placement" invalid errorMessage="Placed below" errorPlacement="manual">
            {(f) => (
              <>
                <input {...f.inputProps} aria-label="custom" />
                <FieldError />
              </>
            )}
          </Field>
          <button type="submit" id="aria-submit">
            Send
          </button>
        </Form>
        <ActionForm />
        <RulesToggle />
      </Section>
    </>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <div dir={dir} id="page" data-salmon-a11y-root="" style={{ padding: 16 }}>
        <FormsSection />
        {sections()}
      </div>
    </ThemeProvider>
  );
}

const root = document.getElementById('root') as HTMLElement;
const app = (
  <StrictMode>
    <Page />
  </StrictMode>
);
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app, { onRecoverableError: (error) => console.error('recoverable', error) });
} else {
  createRoot(root).render(app);
}
window.__inputsReady = true;
