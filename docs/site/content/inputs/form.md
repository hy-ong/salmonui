---
title: Form
description: Form validation with @salmonui/inputs/form - one rule vocabulary with the Data Grid, native constraint validation, server errors and React 19 actions.
category: Components
order: 1
demos: [form-validation, form-rules, form-server-errors, form-shared-rules, field-forms, form-state-drawer, inputs-performance]
---

Form validation is declarative: rules live on each
field's `validation` prop (or native constraint attributes), and `Form`
renders a native `<form>` that validates its fields on submit.
There is no validator instance.

```tsx
import { useActionState } from 'react';
import { Form } from '@salmonui/inputs/form';
import { TextField } from '@salmonui/inputs/text-field';
import '@salmonui/inputs/form/styles.css';

const [state, action] = useActionState(saveUser, { errors: {} });

<Form action={action} validationErrors={state.errors}>
  <TextField name="email" label="Email" validation={{ required: true, email: true }} />
  <button type="submit">Save</button>
</Form>
```

<!-- demo: form-validation -->

## Rules

`validation` takes the Data Grid `column.validation` vocabulary, compiled by
the same `compileValidationRules` from `@salmonui/core/validation`:
`required`, `min`, `max`, `range`, `minLength`,
`maxLength`, `rangeLength`, `number`, `digits`, `email`, `url`, `date`,
`dateIso`, `creditcard`, `tel`, `pattern` (a regular expression; a partial
match passes, so anchor it) and `validate`. Built-in rules are synchronous
and allocate nothing on success (well under 0.05 ms per field per
keystroke).

- Messages: `[argument, message]` per rule, `validation.messages`, then
  `localeText` keys shared with the Data Grid (`validationRequired`,
  `validationMin`, ...).
- Custom rules: `validate(value, ctx)` returns a message, `null` / `true`
  (valid) or `false` (the `validate` message); `[fn, message]` or an array
  of functions; promises are allowed. `ctx` is `{ name, formData,
  isNew: false }`, so a "must equal" rule is
  `validate: [(v, ctx) => v === ctx.formData?.get('password'), 'Passwords differ']`.
- Changing a field's `validation` prop replaces its rules. Inline objects keep their compiled
  form while they are shallow-equal.
- Native attributes (`required`, `minLength`, `maxLength`, `min`, `max`,
  `step`, `pattern`, `type`) are honored and reported with the same messages.

<!-- demo: form-rules -->

<!-- demo: form-shared-rules -->

## When errors show

`validateOn` (on `Form` or per field): `'blur'` (default) shows errors after
the first blur or a submit attempt, the `:user-invalid` model, and then
updates them on every change; `'change'` shows them while typing;
`'submit'` waits for a submit attempt. Each keystroke re-runs only
its own field's rules and re-renders that field only when its shown errors
change.

Results are written to the native input with `setCustomValidity`, so
`form.reportValidity()`, `requestSubmit()`, `input.reportValidity()` and
`:invalid` agree with what Salmon shows.

## Submitting

- `validationBehavior: 'native'` (default) blocks an invalid submit and
  focuses the first invalid field in document order; `'aria'` marks the fields and lets the submit proceed, for
  server-validated forms.
- Async rules show `data-validating` on the field; a submit waits for them
  and then submits again or focuses the first error.
- `onBeforeValidate(event)` runs before client validation;
  `event.preventDefault()` skips it for that submit. `onValidate({ valid,
  errors })` reports the outcome keyed by field name.
- `validationErrors` (server errors keyed by `name`, for example from
  `useActionState`) show as field errors until the field's value changes;
they survive the automatic reset React performs after an
  action.
- React 19 `action`, `useFormStatus` and `useActionState` work unchanged;
with a server action the form also submits before hydration.
- A native reset restores every uncontrolled field and clears shown errors.

<!-- demo: form-server-errors -->

<!-- demo: field-forms -->

## Required marks

`requiredMark` on `Form` puts a decorative asterisk before the label of
every field inside whose control is required (`required` or
`aria-required`), including `Select` and `Combobox` labels:

```tsx
<Form requiredMark>
  <TextField name="customer" label="Customer" required />
  <Select name="status" label="Status" required data={statuses} />
  <TextField name="note" label="Note" />
</Form>
```

- The mark is CSS only (`@salmonui/inputs/form/styles.css`): a `::before`
  with empty alternative text in the danger text color, at the inline
  start of the label (so it moves to the right under `dir="rtl"`). It is
  never announced; screen readers hear "required" once, from the control.
- `Field requiredMark` marks one custom field; `requiredMark={false}`
  opts a field out under a marking `Form`. The rule follows the control's
  `required` state live, so a field that becomes optional loses the mark.
- Any element with `data-required-mark="true"` (a `<fieldset>`, a
  section of a page) marks the fields inside it the same way.

## Unsaved changes: useFormState

`useFormState()` from `@salmonui/inputs/form/state` tracks whether a form
differs from its initial values. It works with the native `FormData`
model: no field is controlled or registered, and the initial values are
the fields' `defaultValue`s.

```tsx
import { Form } from '@salmonui/inputs/form';
import { useFormState } from '@salmonui/inputs/form/state';

function OrderEditor({ order, onClose }) {
  const form = useFormState();
  const confirm = useConfirm();
  const requestClose = async () => {
    if (form.isDirty && !(await confirm({ title: 'Discard unsaved changes?', tone: 'danger', confirmLabel: 'Discard', cancelLabel: 'Keep editing' }))) return;
    onClose();
  };
  return (
    <Drawer open title="Edit order" onOpenChange={(open) => open || void requestClose()}>
      <Form ref={form.ref} requiredMark onSubmit={save}>
        <Drawer.Body>
          <TextField name="customer" label="Customer" required defaultValue={order.customer} />
        </Drawer.Body>
        <Drawer.Footer>
          {form.isDirty ? (
            <>
              <Button variant="outline" onClick={form.reset}>Discard</Button>
              <Button type="submit">Save</Button>
            </>
          ) : (
            <Button variant="outline" onClick={requestClose}>Close</Button>
          )}
        </Drawer.Footer>
      </Form>
    </Drawer>
  );
}
```

- `ref`: attach to the form (`<Form ref={form.ref}>` or a plain
  `<form ref>`). When the form mounts, its `FormData` is the snapshot of
  initial values; a form that mounts again (a drawer opened again, a `key`
  change after a save) takes a new snapshot and starts clean.
- `isDirty`, `dirtyFields` (the names that differ, in form order) and
  `isFieldDirty(name)`. A field is dirty when its submitted values differ
  from the snapshot, so changing a value back makes it clean again; an
  unchecked checkbox and a disabled field submit nothing, so checking one
  or enabling a field with a value makes it dirty. Files compare by name,
  size and date.
- `reset()` calls `form.reset()`: native controls and every Salmon field
  return to their `defaultValue`, shown errors clear, and the state is
  clean. A controlled field whose value the parent holds stays dirty until
  the parent resets it.
- The hook listens to `input` and `change` events on the form and observes
  its controls, so the hidden inputs and options of custom-drawn fields
  (Select, NumberField, ColorPicker, ...) count too. One `FormData` read
  per change; the form's fields do not re-render, only the component that
  calls the hook, and only when the set of dirty names changes.
- Fields outside the `<form>` element (a `form="id"` attribute) are not
  tracked. On the server the state is clean.
- Its own subpath, so `@salmonui/inputs/form` does not grow for apps that
  do not use it.

<!-- demo: form-state-drawer -->

## Performance

Every Inputs subpath has a gating JavaScript and stylesheet row in
`npm run bundle:check`. A keystroke re-renders only the edited field, and
dragging a Slider or drawing a signature causes no React render.

<!-- demo: inputs-performance -->

## Error placement

Every field renders its error below the control with the id its
`aria-errormessage` points at; `errorMessage` replaces the text or receives
`{ errors }`. For a custom layout, render `FieldError` yourself in
a [`Field`](/docs/inputs/field) with `errorPlacement="manual"`.

## SSR

`Form` renders a native `<form noValidate>` with the same markup on the
server and the client. Before hydration a submit is a plain native submit
(a server action still runs); the Salmon rules run once the page is
hydrated.

## Design notes

- there are no state class options; state classes would
  duplicate ARIA state, so state is `[data-invalid]` and
  `[aria-invalid="true"]`. Style invalid fields with `[data-invalid]`.
- there is no skip list; a class-based skip list couples markup
  and validation. Fields without rules are not validated and disabled
  fields are skipped natively. Omit `validation` or set `disabled`.
- there is no method that looks an input up by name; the platform
  already does. Use `form.elements.namedItem(name)` or a `ref`.

## API

| `Form` prop | Type | Default |
| --- | --- | --- |
| `validationBehavior` | `'native' \| 'aria'` | `'native'` |
| `validateOn` | `'blur' \| 'change' \| 'submit'` | `'blur'` |
| `validationErrors` | `Record<string, string \| string[]>` | |
| `onBeforeValidate` | `(event: { form, preventDefault() }) => void` | |
| `onValidate` | `({ valid, errors }) => void` | |
| `requiredMark` | `boolean` | `false` |
| `action`, `onSubmit`, `onReset`, native form props | | |

`ref` is the `<form>`. Salmon sets `noValidate` so the browser's own bubbles
stay off; pass `noValidate={false}` to get them back.

`Field`, `FieldError`, `FieldDescription` and the shared field props are
documented on [Field](/docs/inputs/field). Full signatures:
[`@salmonui/inputs/form` API reference](/docs/reference/inputs/form).
