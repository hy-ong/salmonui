---
title: Query builder with 200 rules
description: A 200-rule QueryBuilder mounted on demand, with the mount time and a single-rule edit time measured and shown against the budgets.
category: inputs
---

Press "Mount 200 rules": the time from the click to the commit is measured
with `performance.now()` and shown next to the 50 ms budget. Then press
"Edit rule 100" to change one rule's value: the edit replaces one rule with
structural sharing, so only that rule renders again and the edit time
stays small. Unmount and mount again to measure the steady state; the
first run includes code loading.
