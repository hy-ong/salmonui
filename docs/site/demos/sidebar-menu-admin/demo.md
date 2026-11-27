---
title: Sidebar menu with router links
description: A grouped admin SidebarMenu whose links render through renderLink as client-side router links; the selected item follows the current path and carries aria-current.
category: navigation
---

The menu is controlled by a tiny in-demo router: `renderLink` returns a link
that pushes the path instead of loading a page, and `selected` is derived
from the current path, so the highlight and `aria-current="page"` follow
navigation from anywhere in the app. A modified click (Ctrl, Cmd, Shift)
still reaches `onItemClick` but selects nothing, so "open in a new tab"
keeps working with a real router.
