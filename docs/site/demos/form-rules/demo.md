---
title: Validation rules and events
description: Form validation with per-rule, validation.messages and localeText messages, native HTML constraints read as rules, rules swapped at runtime, error text from a function, onBeforeValidate and onValidate, and the native reportValidity and requestSubmit entry points.
category: inputs
---

Press Submit with the form empty. Each field shows its message: Recipient
uses `localeText.validationRequired` and a per-rule `[3, message]` for
`minLength`; Street's `validation.messages` rewrites the `maxLength` text;
ZIP code has only native attributes (`required`, `pattern`, `minLength`,
`maxLength`) and its text comes from an `errorMessage` function of the
errors; Website checks the native `type="url"`.

Check "Courier delivery": the phone field's `validation` prop changes from
no rules to `required` and `tel`, so rules are added and removed by
re-rendering.
Check "Skip client validation": `onBeforeValidate` calls
`preventDefault()` and the submit goes through. The log shows
`onBeforeValidate` and `onValidate({ valid, errors })` for every submit.

The `reportValidity()` buttons call the native methods on the form and on
the phone input: they return the Salmon result because each field writes
its first error with `setCustomValidity`.
`form.requestSubmit()` runs the same validation as the Submit button.
