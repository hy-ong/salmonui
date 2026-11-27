---
title: Filter builder
description: The advanced filter builder dialog over nested AND/OR filter groups, opened from the toolbar item or `api.openFilterBuilder()`, with hidden columns offered through `includeHidden`, a cancellable `onBeforeFilterBuilderOpen` and filter events reporting `ui: 'builder'`.
---

The grid starts with (Country = Japan OR Country = Malaysia) AND Amount > 100.
Open the builder to edit the groups, then OK applies the whole tree as one
filter change.
