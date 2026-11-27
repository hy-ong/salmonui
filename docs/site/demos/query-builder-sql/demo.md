---
title: Query builder SQL and MongoDB import
description: Inline SQL from toSql, a custom operator evaluated by filterRows and serialized by the toSql and toMongo hooks, and queries loaded back with fromSql (literal, positional and named parameters) and fromMongo.
category: inputs
---

The builder offers a custom "Multiple of" operator on number fields: the
matching rows below come from `filterRows` with its `evaluate` function,
and the SQL (`toSql` with `inline: true`, escaped literals) and MongoDB
outputs come from per-operator hooks.

Edit the SQL text and press "Load SQL": `fromSql` reads it back into the
builder. Placeholders take their values from the parameters box: a JSON
array for `?`, `$1` or `@p1`, or a JSON object with "Named parameters"
ticked for `:name`. Anything outside the subset `toSql` writes (try
`price > 1; DROP TABLE t`) is refused with a `SqlParseError`; nothing is
evaluated. "Load MongoDB" does the same with `fromMongo`.
