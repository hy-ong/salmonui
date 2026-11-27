---
title: Remote ListView as Listbox
description: A virtualized Listbox over 2,000 tickets read in ranges from a remote source with latency, a base query filter, a loading spinner, and an error state with Retry.
category: layout
---

The source answers one `range` per read: scroll the list and the log shows
the next ranges loading (built-in incremental loading, no scroll handler
needed). Only the visible rows are in the DOM
(`virtualization`). "Open tickets only" passes a base `query` filter that is
merged into every read. "Fail the next read", then scroll or change the
filter: `renderError` shows the message with Retry and `onLoadError` is
logged; while a read is pending the list is `aria-busy` and `renderLoading`
shows a spinner.
