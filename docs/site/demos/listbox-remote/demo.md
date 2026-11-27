---
title: Listbox over a remote source
description: A Listbox reading 5,000 customers from a remote source in ranges as it scrolls, with a base query, a debounced multi-field search, a minimum search length, case matching, aborted superseded reads and a load error with retry.
category: dropdowns
---

The source answers after 400 ms and logs every read. Scroll the list: it
reads blocks of rows (`rows 100–200`) and `totalRowCount` sizes the
scrollbar. Type at least two characters: the search runs 300 ms after the
last keystroke over the name and e-mail fields, and a read that a newer
search supersedes is aborted (`aborted:` in the log), so a late answer never
replaces a newer one. "Active customers only" changes the base `query`
merged into every read. "Fail the next read" makes the next request fail:
the list shows the error with a Retry button and `onLoadError` fires.
