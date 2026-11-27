---
title: FileUpload basics
description: A FileUpload without a transport inside a Form; the picked files submit with FormData, with accept, size and count validation.
category: inputs
---

Pick or drop files, then send the form: the files reach `FormData` through
the native input. Files of another type, larger than 2 MB or beyond the
third stay in the list with their error and are left out of the form.
