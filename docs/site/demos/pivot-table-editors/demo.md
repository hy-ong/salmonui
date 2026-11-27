---
title: Field list popup and editors
description: The built-in popup field list with its field menus, and the calculated field, number format and conditional format dialogs, opened from the toolbar and from the instance API.
category: pivot-table
---

`fieldList="popup"` adds the field list dialog, opened by the toolbar's
Field list item or `api.openFieldList()`. Open the menu of a field in it:
the same menu as on the axis bar sorts, filters, groups, changes the
aggregate, opens the number format editor, and edits the formula of a
calculated field.

"Average price" is a calculated field, `"Sum(amount)" / "Sum(units)"`,
compiled by the engine's formula parser (no `eval`). Edit its formula,
or add a new calculated field, from the toolbar. Number format writes
`pivotModel.formats` (`Intl.NumberFormat` options); conditional format
writes `pivotModel.conditionalFormats`; the model starts with one rule
that tones average prices over 85. The log lists the model changes and
`onCalculatedFieldChange`.
