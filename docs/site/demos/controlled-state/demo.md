---
title: Controlled grid state
description: The application owns the sort, filters, search, page, hidden columns and selection through reactive props and change events, takes a getState() snapshot and restores it without recompiling columns.
---

The JSON below the grid is the application's state. Buttons change it and
the grid follows; changes made in the grid come back through the change
events. "Restore snapshot" applies a `getState()` snapshot in one batch and
checks that the compiled columns were kept.
