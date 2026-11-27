---
title: Alert Dialog
description: Alert, confirm and prompt dialogs with async confirmation, plus DialogProvider with useConfirm and useAlert for promise-based calls.
category: Overlays
order: 11
demos: [alert-dialog]
---

`AlertDialog` is a ready-made alert, confirm or prompt dialog built on the
APG Alert Dialog pattern:
`role="alertdialog"`, initial focus on the least destructive action, no
backdrop dismissal, Escape cancels. It composes `Button` from
`@salmonui/buttons/button`; `@salmonui/overlays/dialog/styles.css` carries
those Button rules, so no other stylesheet is needed besides
`@salmonui/core/styles.css` (the theme, once per app).

```tsx
import { AlertDialog, Dialog } from '@salmonui/overlays/dialog';
import '@salmonui/overlays/dialog/styles.css';

<AlertDialog
  trigger={<Dialog.Trigger>Delete</Dialog.Trigger>}
  title="Delete order?"
  description="This cannot be undone."
  tone="danger"
  confirmLabel="Delete"
  cancelLabel="Keep"
  onConfirm={() => api.delete(id)}
/>;
```

<!-- demo: alert-dialog -->

## Alert, confirm, prompt

- Without `cancelLabel` (or `onCancel`) the dialog is an **alert** with one
  action, focused on open.
- With a cancel action it is a **confirm**; Cancel takes the initial focus.
`tone="danger"` styles the confirm button.
- `onConfirm` may return a promise (see [Async confirm](#async-confirm)).
- With `children` it is a **prompt**: the body and actions become
  a `<form>`, Enter or the confirm button submits it, and
  `onConfirm(formData)` receives its `FormData`.
- Labels: `confirmLabel` / `cancelLabel`, defaults `localeText.ok` ("OK")
  and `localeText.cancel` ("Cancel"); `confirmIcon` / `cancelIcon`.
- The other Dialog options apply: `modal`, `closeButton`, `placement`,
  `position`, `draggable`, `width`, .... `dismissible` is a
  boolean here (default `true`: Escape cancels); a backdrop press never
  closes an alert dialog.
- `open` / `defaultOpen` / `onOpenChange` work as in
  [Dialog](/docs/layout/dialog); the close reasons are `'confirm'`,
  `'cancel'`, `'escape'` and `'closeButton'`.

## Async confirm

```tsx
<AlertDialog
  title="Publish the price list?"
  confirmLabel="Publish"
  cancelLabel="Cancel"
  onConfirm={() => api.publish()} // a promise
/>
```

- While the promise is pending the confirm button shows its loading state
  (`aria-busy`, `data-loading`) and ignores presses; the dialog stays
  open. Cancel is disabled, and Escape and the close button are ignored,
  so the action cannot be abandoned halfway. Nothing else changes: focus
  stays where it was.
- Fulfilled: the dialog closes with the reason `'confirm'`.
- Rejected: the dialog stays open and an error region
  (`.salmon-alert-dialog-error`, `role="alert"`, so it is announced)
  appears above the actions. Its text is the reason's `Error` message
  when the promise rejects with an `Error` that has one, otherwise
  `localeText.error` (default "Something went wrong. Try again.").
  Cancel works again; confirming again clears the error and retries.
- A synchronous `onConfirm` (no promise) closes the dialog at once, as
  before.

## useConfirm and useAlert

```tsx
import { DialogProvider, useConfirm } from '@salmonui/overlays/dialog';

function App() {
  return (
    <DialogProvider>
      <Orders />
    </DialogProvider>
  );
}

function Orders() {
  const confirm = useConfirm();
  async function remove() {
    if (await confirm({ title: 'Delete order?', tone: 'danger', confirmLabel: 'Delete' })) await api.delete(id);
  }
}
```

- `useConfirm()` returns `confirm(options)` → `Promise<boolean>` (true on
  confirm; false on cancel, Escape or abort); `useAlert()` returns
  `alert(options)` → `Promise<void>`.
- `options.signal` (an `AbortSignal`) closes the dialog programmatically.
- `options.onConfirm` runs the work inside the dialog:
  `await confirm({ title: 'Delete order?', onConfirm: () => api.delete(id) })`
  keeps the dialog open with a loading confirm button until the promise
  settles, then resolves `true`; a rejection shows the error as above and
  the call resolves only once the user retries successfully or cancels
  (`false`). Without `onConfirm` the call resolves `true` at once, as
  before.
- One `<DialogProvider>` above the callers holds the queue in its own state
  and shows one dialog at a time; it renders nothing on the server.
- There is no library-owned global dialog utility:
  module-level state would be shared across server requests and break the
  React Compiler rules. Mount one provider near the root instead.

## Accessibility

APG Alert Dialog pattern: `role="alertdialog"`, labelled by the
title and described by the description. A confirm focuses its Cancel
button first (the least destructive action), an alert its only button.
Tab stays inside the dialog, Escape cancels, a backdrop press never
dismisses, and focus returns to the trigger on close.

API reference: [`@salmonui/overlays/dialog`](/docs/reference/overlays/dialog).
