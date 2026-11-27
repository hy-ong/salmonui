---
title: URL-synced paging
description: Server paging without a reported total (`paging.totalRowCount`), the page kept in the query string (`paging.syncUrl`), `onViewChange` once per page, and a `renderError` state with retry.
---

The "server" is an in-page source that answers after 120 ms and pages on its
side (`performed: ['page']`).
