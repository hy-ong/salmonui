---
title: Loading indicator and refresh
description: The spinner or skeleton overlay while a slow source loads, renderLoading with its initial, page and refresh phases, setLoading(true/false), and refresh() re-reading the data with the current query.
---

Turn on `renderLoading` to see which phase each load is in. Change ORD-10001 on the server, then call `refresh()`: the grid re-reads the current page and shows the new customer.
