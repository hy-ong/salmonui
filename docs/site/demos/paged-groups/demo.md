---
title: Paged groups and aggregate scope
description: 400 orders grouped by country and paged 25 data rows at a time; `aggregateScope` switches the footer and group footers between the current page and every row.
---

`aggregateScope` is reactive: switching it recomputes the aggregates without
re-reading the data.
