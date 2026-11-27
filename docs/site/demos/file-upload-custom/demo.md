---
title: FileUpload customization
description: Preloaded files, a custom file row from renderFile, a custom drop zone from renderTrigger, renamed status and error texts with localeText, folder picking, the drop effect and showFileList.
category: inputs
---

The list starts with two preloaded files (status `uploaded`). Each row is
drawn by `renderFile` with its own Remove button, and the drop zone by
`renderTrigger`. The status and error texts come from `localeText`: add a
file other than a PDF or an image, or one over 1 MB, to see the renamed
errors. Tick "Pick folders" to choose a whole folder (each row then shows
its folder-relative path), pick another drop effect (`none` refuses
drops), or untick "Show the file list" to hide the list.
