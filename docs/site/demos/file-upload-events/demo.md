---
title: FileUpload events and API
description: The cancellable onBeforeFilesAdd, onBeforeUpload, onBeforeRemove and onBeforeClear events, upload success and error, api.clear and api.getFiles, formatFileSize and the keyboard and live-region behavior.
category: inputs
---

Add a few files; the simulated server rejects any file whose name contains
"error". The log shows every event. `onBeforeFilesAdd` drops hidden files
(names starting with a dot) from the batch; the checkboxes veto uploads of
files over 1 MB (they stay ready), removing uploaded files and clearing the
list. "Clear with api.clear()" and "List with api.getFiles()" call the
imperative API; the sizes come from `formatFileSize` in the chosen locale.

Keyboard: Tab to the "Documents" drop zone and press Enter or Space to open
the file picker; Tab on to Clear and to each file's Retry and Remove
buttons, which are named with the file name. Status changes such as
"report.pdf: Uploaded" are announced by a polite live region.
