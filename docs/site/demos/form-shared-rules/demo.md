---
title: One rule engine for forms and grids
description: The same validation rule object on a Form field and a Data Grid column, compiled by the same compileValidationRules, and a timing of the built-in rules showing the per-keystroke cost and the shared empty result on success.
category: inputs
---

The SKU field and the grid's SKU column take the same `validation` object.
Type a lower-case SKU into the field, then double-click a SKU cell in the
grid and type the same value: both show the same message, because `Field`
and `column.validation` compile their rules with the same
`compileValidationRules` from `@salmonui/core/validation`.

"Time the rules" runs the compiled built-in rules 200,000 times on a valid
and an invalid value, the work a field does per keystroke. A valid value
costs a small fraction of a microsecond and every call returns the one
shared, frozen `NO_ERRORS` array, so success allocates nothing; only a
failure builds its message.
