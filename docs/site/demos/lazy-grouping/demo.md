---
title: Lazy load grouping
description: Two-level grouping over 50,000 remote orders. The server returns group captions with their aggregates first; children load in chunks of 50 when a group expands, with a per-group loading state and a Load more button for the next chunk; with infinite scrolling on, scrolling near the end of a group's loaded rows appends the next chunk; paging pages the countries in the root request; a filter change reloads loaded groups and keeps expansion.
---
