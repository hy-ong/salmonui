---
title: Tree View checkboxes
description: Tri-state permissions with cascade or independent checks, a disabled item the cascade skips, check on click, form submission with reset, and the checkAll, uncheckAll and getCheckedIds methods.
category: navigation
---

Check **Orders**: its enabled children follow and the locked **Issue
refunds** keeps its state. **Save** submits one value per checked id;
**Reset** restores the initial checks.

**Check all**, **Uncheck all** and **Check Catalog** call `api.checkAll()`,
`api.uncheckAll()` and `api.checkAll(['catalog'])` on the `ref`; **Read
checked ids** shows `api.getCheckedIds()`, every checked id.
