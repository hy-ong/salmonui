---
title: FileUpload with 500 files
description: A controlled FileUpload that mounts a 500-file list on demand and shows the measured render time against the 50 ms budget.
category: inputs
---

Press "Show 500 files": the list mounts 500 preloaded entries and the time
from the click to the commit is measured with `performance.now()` and shown
next to the 50 ms budget. Remove a file to see that only the list changes;
"Hide the files" empties it again so you can measure once more. The first
run includes code loading; later runs show the steady state.
