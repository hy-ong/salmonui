---
title: Query builder fields
description: Per-field operators, fixed values and defaults, display formats, number steps, validation rules, a custom value editor and rule layout, the tree field picker, editor props, operatorsFor and localized labels.
category: inputs
---

Each field configures its rules: Product offers only three operators, Tier
is a fixed list whose new rules start at Gold, Price steps by 0.50 and must
stay between 0 and 500, and Rating uses a custom editor (a `Rating`) that writes
the value with `ctx.setValue`. Every rule row is laid out by `renderRule`
with its position. The summary below shows the values in each field's
`format` (currency, dates).

Type a price over 500 and press "Validate" to see the field rule's error.
Switch the field picker to "tree" (Address is a parent of City), tick
"Searchable fields, wide values" (`editorProps`: a search box in the field
Select, a minimum width on the value editors) or "German labels" (`localeText`).
