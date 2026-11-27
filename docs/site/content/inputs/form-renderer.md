---
title: Form Renderer
description: A form rendered from a JSON Schema subset and a UI schema with @salmonui/inputs/form-renderer, using the Salmon fields, Form validation and a typed onSubmit.
category: Components
order: 70
demos: [form-renderer-basics]
---

`FormRenderer` renders a form from a schema. It reads a JSON Schema
subset and a UI schema and renders the Salmon fields (`TextField`,
`NumberField`, `Checkbox`, `Switch`, `Select`, `RadioGroup`) inside a
[Form](/docs/inputs/form), with a submit `Button`.

```tsx
import { FormRenderer, type FormSchema } from '@salmonui/inputs/form-renderer';
import '@salmonui/inputs/form-renderer/styles.css';

const schema: FormSchema = {
  type: 'object',
  title: 'Sign up',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', title: 'Name', minLength: 2 },
    email: { type: 'string', title: 'Email', format: 'email' },
    plan: { type: 'string', title: 'Plan', enum: ['free', 'pro'] },
    terms: { type: 'boolean', title: 'I accept the terms', const: true },
  },
};

<FormRenderer schema={schema} onSubmit={(data, { isValid }) => isValid && save(data)} />
```

<!-- demo: form-renderer-basics -->

## Schema

`schema` is an object schema: `type: 'object'`, `title` (the
form's accessible name unless `aria-label` is given), `description`,
`properties` and `required`. A property has `type` (`'string'`,
`'number'`, `'integer'`, `'boolean'`), `title` (the label; default the
property name), `description`, `default`, `enum`, `const`, `format`,
`minLength`, `maxLength`, `minimum`, `maximum` and `pattern`. Other JSON
Schema keywords are ignored; a property of another type is not rendered
and a development warning names it.

## Widgets

| Property | Field | UI schema `widget` |
| --- | --- | --- |
| `string` | `TextField` (`format: 'email'` is `type="email"`, `'uri'` is `type="url"`) | `'password'`, `'textarea'` (`TextArea`) |
| `number`, `integer` | `NumberField` (`integer`: no decimals) | |
| `boolean` | `Checkbox` | `'switch'` (`Switch`) |
| `enum` | `Select` | `'radio'` (`RadioGroup`) |

The submit control is a `Button type="submit"`; set
`uiSchema.submit` to `{ label, tone, variant }`, or `false` to render your
own button as a child.

## Layout

`uiSchema.layout` is an ordered list of rows. A row is a property
name, or an array of names shown side by side as equal columns; columns
stack when the form is narrower than 30rem. Properties missing from
`layout` follow in schema order.

```tsx
const uiSchema = {
  layout: [['first', 'last'], 'email', ['age', 'plan']],
  fields: {
    password: { widget: 'password' },
    plan: { enumLabels: ['Free', 'Pro'], placeholder: 'Choose a plan' },
  },
};
```

`uiSchema.fields[name]` also takes `label`, `description`, `placeholder`,
`disabled`, `readOnly`, `autoComplete` and `enumLabels` (option labels in
`enum` order).

## Validation

Schema keywords become the field `validation` rules of
[Form](/docs/inputs/form): `required` (`required`), `minLength`,
`maxLength`, `minimum` (`min`), `maximum` (`max`), `pattern`, and the
`email` / `url` rules for `format: 'email'` / `'uri'`. Messages and
`localeText` `validation*` keys are the shared ones. A boolean is always
present in JSON Schema, so `required` does not apply to it: use `const:
true` for a box that must be checked. Number fields report an out-of-range
value instead of clamping it.

## Submit

`onSubmit(data, { isValid, errors }, event)` runs once per submit, valid
or not. `data` is typed by the schema: strings, numbers (or
`null` when empty), booleans, and enum values in their schema type;
`errors` lists the messages per property. The native submit is prevented
unless `action` is set. Every other `Form` prop passes through
(`validationBehavior`, `validateOn`, `validationErrors`, `action`, `id`).

With the default `validationBehavior: 'native'` an invalid submit also
focuses the first invalid field; with `'aria'` the fields are marked and
`onSubmit` runs with `isValid: false`.

## Keyboard

The fields keep their own keyboard behavior (see their pages).

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Moves through the fields in layout order |
| Enter (in a text field or on the submit button) | Submits the form |

## SSR

The fields render from the schema on the server with the same markup as on
the client (ids from `useId`), so the form is complete before hydration
and, with an `action`, submits natively.

## Design notes

- a visual form designer (toolbox, canvas, properties
  pane, code view, live preview and rule editor) is not part of Salmon UI: it is an application-sized designer
  whose output is a schema, so the library value is the renderer. Author the schema as JSON, or generate it from your model with
  existing JSON Schema tools, and render it with `FormRenderer`; a designer
  can be built in the application from Salmon components.

## API

| Prop | Type | Default |
| --- | --- | --- |
| `schema` | `FormSchema` | required |
| `uiSchema` | `{ layout, fields, submit }` | |
| `onSubmit` | `(data, { isValid, errors }, event) => void` | |
| `children` | `ReactNode` (after the fields) | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `localeText` | `validation*` keys and `submit` | English |
| `validationBehavior`, `validateOn`, `validationErrors`, `action`, `onValidate`, `onBeforeValidate` | see [Form](/docs/inputs/form) | |
| `ref` | `HTMLFormElement` | |

Full signatures: [`@salmonui/inputs/form-renderer` API reference](/docs/reference/inputs/form-renderer).
