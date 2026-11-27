---
title: Validation
description: Column validation rules, custom and async validators, row-level rules, batch validation, messages and their localization, and the inline error wiring.
category: Validation
order: 76
demos: [validation]
---

Validation runs in the core `edit` module, so every editing mode, the edit
methods (`updateRow`, `updateCell`) and paste share the same rules. A save
is refused while any rule fails.

## Column rules

`column.validation` holds the built-in rules:

```tsx
const columns: DataGridColumn<Supplier>[] = [
  { field: 'name', validation: { required: true, minLength: 3, maxLength: [20, 'Keep it under 20 characters.'] } },
  { field: 'email', validation: { required: true, email: true } },
  { field: 'rating', type: 'number', validation: { range: [1, 5] } },
  { field: 'code', validation: { pattern: '^[A-Z]{3}-\\d{3}$' } },
];
```

- `required`.
- `min`, `max` (numbers or dates), `range: [min, max]`, `minLength`,
  `maxLength` and `rangeLength: [min, max]`.
- `number`, `digits`, `email`, `url`, `date`, `dateIso`, `creditcard`,
  `tel` and `pattern` (a string or `RegExp`; a partial match passes, so
  anchor the pattern).

Number and date columns parse the editor text first; text that does not
parse fails the `number` rule.

## Custom validators

`validation.validate(value, row, ctx)` returns a message, or `null` (or
`true`) when the value is valid. It may return a promise: the save waits
for it, and the result is cached until the value changes. Pass
`[validator, message]` for a fixed message, or an array of validators.

```tsx
{ field: 'voucher', validation: { validate: async (value) => ((await isRedeemed(value)) ? 'Already redeemed.' : null) } }
```

## Row rules and batches

`editing.validateRow(row, ctx)` checks the whole row (with its drafts)
before it saves and blocks the save on a message; it may be async
too. In batch mode `save()` validates every pending cell and row before the
single write; `validateBatch()` runs the same checks without saving and
resolves `true` when everything is valid. `getEditSnapshot()`
lists the current `cellErrors` and `rowErrors`.

## Messages

Each rule has a default message. Localize them with the `localeText` keys
`validationRequired`, `validationMin`, `validationMax`, `validationRange`,
`validationMinLength`, `validationMaxLength`, `validationRangeLength`,
`validationNumber`, `validationDigits`, `validationEmail`, `validationUrl`,
`validationDate`, `validationDateIso`, `validationCreditcard`,
`validationTel`, `validationPattern` and `validationValidate`; `{0}` and
`{1}` are the rule arguments. A rule given as `[argument, message]`, or a
key of `validation.messages`, overrides the message for one column.

## Error display and accessibility

An invalid editor gets `aria-invalid="true"` and an inline message linked
with `aria-describedby`; the message updates as the user types. Invalid
cells outside the editor keep `data-invalid` and a hidden message.
The dialog form shows the same messages under each field and the row-level
messages above the buttons.

In row, batch and cell mode a row-level message (`validateRow`, server
`rowErrors`) blocks the save, marks the row `data-invalid`, and is shown
beside the grid in a `role="alert"` list (`.salmon-data-grid-row-errors`,
"Row 2: message"; localize with the `rowErrors` and `newRowErrors`
`localeText` keys). `getEditSnapshot().rowErrors` lists the same messages.

<!-- demo: validation -->

## API reference

[`ColumnValidation`](/docs/reference/data-grid/engine/ColumnValidation) lists
every rule, [`CustomValidator`](/docs/reference/data-grid/engine/CustomValidator)
and [`RowValidator`](/docs/reference/data-grid/engine/RowValidator) the
validator signatures, and [`EditSnapshot`](/docs/reference/data-grid/engine/EditSnapshot)
the error lists; `validateBatch` and `getEditSnapshot` are on
[`DataGridApi`](/docs/reference/data-grid/DataGridApi).