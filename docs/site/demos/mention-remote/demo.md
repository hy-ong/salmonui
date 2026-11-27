---
title: Mention with remote suggestions
description: An input whose @ suggestions come from a remote source with latency - debounced reads, aborted superseded requests and a loading state.
category: dropdowns
---

The directory answers after 300 ms. Typing quickly sends one read after the
200 ms debounce; a read that a newer search supersedes is aborted, as the
event log shows. The list shows "Loading…" while a read is pending and at
most eight names.
