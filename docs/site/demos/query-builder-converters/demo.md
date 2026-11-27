---
title: Query builder converters
description: The QueryBuilder value as parameterized SQL with toSql and as a MongoDB filter with toMongo.
category: inputs
---

Edit the rules: the SQL keeps values in `params` (never in the SQL text),
and the MongoDB filter escapes text operators as anchored `$regex`.
