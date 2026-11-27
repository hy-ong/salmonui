---
title: Pager basics
description: A controlled Pager with page sizes and a cancelled page, an uncontrolled Pager with five numeric buttons and a page label, and a Pager over an unknown total.
category: navigation
---

Click a page, or focus a page button and use ArrowLeft / ArrowRight,
PageUp / PageDown, Home and End. Page 13 is cancelled by
`onBeforePageChange`; changing the page size keeps the first visible item.
The narrow pager keeps only the current number (container query), and the
last pager replaces its content with `renderPager`.
