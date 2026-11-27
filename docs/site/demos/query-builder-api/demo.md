---
title: Query builder API and options
description: A controlled QueryBuilder driven by its imperative API (addRules, addGroups, remove, getValue, setValue, getNode, reset, getValidValue, validate), with button, nesting, new-rule, field order, matchCase, read-only and group header options and a cancellable onBeforeChange.
category: inputs
---

The value is controlled (`value` and `onValueChange`) and printed as JSON
below. The API buttons call the `ref`: add a rule or a group, remove the
last node, read a node, replace the value, reset it, and compare
`getValidValue()` (incomplete rules dropped) with `validate()` (inline
errors). The checkboxes switch the built-in buttons, the nesting limit,
whether new groups start with a rule, which field and operator new rules
start with, the field order, `matchCase` (written to every edited rule),
`readOnly`, and a custom group header showing the nesting depth. With
"Confirm removals" ticked, `onBeforeChange` cancels every removal; the log
lists each proposed change.

Keyboard: Tab moves through each group's connector, buttons and every
rule's field, operator and value editors; the arrow keys change the AND /
OR connector. Screen readers hear each group by its connector ("And
group") and each rule by its position ("Condition 2"). After "Add
condition" focus moves to the new rule's field, and after a removal to the
group's add button.
