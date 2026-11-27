---
title: Breadcrumbs
description: Links, a router link through render, a disabled item, an icon, a custom separator, a navigable current item and onItemClick cancelling navigation.
category: navigation
---

Tab moves through the links; the last item is the current page
(`aria-current="page"`) and renders as text. The first trail cancels every
navigation in `onItemClick` and reports the click instead; the second uses a
`/` separator and keeps the current item a link (`currentNavigable`); the
third is `disabled` as a whole.
