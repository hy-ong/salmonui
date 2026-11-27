---
title: TreeSelect lazy loading
description: Folders load on first expand through loadChildren with an abort signal; one share fails first and shows a custom error row with Retry, plus header, footer and item templates.
category: dropdowns
---

Open the picker and expand **home** to load its folders (each load takes
0.7 s). The **mnt** share rejects once: press **Retry** on its row to load
it again. Items render through `renderItem` with an icon, and the popup
carries a header and a footer.
