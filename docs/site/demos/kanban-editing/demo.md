---
title: Kanban editing with a data source
description: A board over an in-memory data source with latency, a field-list editor with required and custom validation, add buttons, the ref API, optimistic writes and reverts on rejected writes.
category: data-visualization
---

The board shows its loading state until the source's first read resolves.
Double-click a card, or focus it and press Enter, to edit it; **Add card**
in a column or **New ticket** (`api.openEditor('new')`) opens an empty
draft. Moves and saves apply at once and are written to the source; with
**Reject writes** checked the source rejects each write, the board restores
the previous cards and announces the failure.
