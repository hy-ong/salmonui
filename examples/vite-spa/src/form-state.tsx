// useFormState, requiredMark and the unsaved-changes Drawer flow
// (tests/browser/inputs-form-state.spec.ts):
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it
//
// window.__formState records the editor's results (save, close) as plain objects.
import { StrictMode, useState, type SubmitEvent } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/checkbox/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import '@salmonui/overlays/dialog/styles.css';
import '@salmonui/overlays/drawer/styles.css';
import './app.css';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Field, Form } from '@salmonui/inputs/form';
import { useFormState } from '@salmonui/inputs/form/state';
import { TextField } from '@salmonui/inputs/text-field';
import { DialogProvider, useConfirm } from '@salmonui/overlays/dialog';
import { Drawer } from '@salmonui/overlays/drawer';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __formState?: Record<string, unknown>[];
  }
}

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
window.__formState = [];
const push = (entry: Record<string, unknown>): void => void window.__formState?.push(entry);

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Payment failed' },
];

function Editor({ onClose }: { onClose: () => void }) {
  const form = useFormState();
  const confirm = useConfirm();
  const requestClose = async (): Promise<void> => {
    if (form.isDirty && !(await confirm({ title: 'Discard unsaved changes?', tone: 'danger', confirmLabel: 'Discard', cancelLabel: 'Keep editing' }))) return push({ kind: 'kept' });
    push({ kind: 'closed' });
    onClose();
  };
  return (
    <Drawer open side="end" size={420} title="Edit order" closeButton data-test="editor" onOpenChange={(open) => open || void requestClose()}>
      <Form
        id="order"
        ref={form.ref}
        requiredMark
        style={{ display: 'contents' }}
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault();
          push({ kind: 'save', values: [...new FormData(event.currentTarget).entries()].map(([k, v]) => [k, String(v)]) });
          onClose();
        }}
      >
        <Drawer.Body>
          <div style={{ display: 'grid', gap: 12 }}>
            <TextField id="customer" name="customer" label="Customer" required defaultValue="Ada Lovelace" />
            <TextField id="note" name="note" label="Note" defaultValue="" />
            <Select id="status" name="status" label="Status" required data={STATUSES} defaultValue="paid" />
            <Checkbox id="gift" name="gift">
              Gift wrap
            </Checkbox>
            <Field id="code" name="code" label="Code" required requiredMark={false}>
              {({ inputProps }) => <input {...inputProps} className="salmon-input" defaultValue="A1" />}
            </Field>
            <output id="dirty">{form.isDirty ? form.dirtyFields.join(',') : 'clean'}</output>
            <output id="customer-dirty">{String(form.isFieldDirty('customer'))}</output>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          {form.isDirty ? (
            <>
              <Button id="discard" variant="outline" onClick={form.reset}>
                Discard
              </Button>
              <Button id="save" type="submit" tone="primary">
                Save
              </Button>
            </>
          ) : (
            <Button id="close" variant="outline" onClick={() => void requestClose()}>
              Close
            </Button>
          )}
        </Drawer.Footer>
      </Form>
    </Drawer>
  );
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <DialogProvider>
        <div dir={dir} id="page" data-salmon-a11y-root="">
          <Button id="edit" onClick={() => setOpen(true)}>
            Edit order
          </Button>
          {/* A form outside the drawer: required marks on a plain page (Form-wide, Field opt-in). */}
          <Form id="marks" requiredMark aria-label="Marks" style={{ display: 'grid', gap: 12, maxInlineSize: 320, marginBlockStart: 16 }}>
            <TextField id="mark-required" name="a" label="Required" required />
            <TextField id="mark-optional" name="b" label="Optional" />
            <Select id="mark-select" name="c" label="Select" required data={STATUSES} />
          </Form>
          <Field id="solo" name="solo" label="Solo field" required requiredMark>
            {({ inputProps }) => <input {...inputProps} className="salmon-input" />}
          </Field>
          {open ? <Editor onClose={() => setOpen(false)} /> : null}
        </div>
      </DialogProvider>
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
