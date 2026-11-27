---
title: Traditional Chinese admin page
description: An order admin page under one LocaleProvider with the built-in zh-TW pack (data grid, pager, date pickers, dropdowns, form validation, file upload, tabs, breadcrumbs, dialogs and toasts), switchable to the built-in English text.
---

Every component string on this page (the pager and the grid's column
menus, the picker buttons and calendars, the dropdown clear and empty
texts, the required-field messages, the dialog close button, the toast
dismiss button) comes from `zhTW`, and every date and number is formatted
for `zh-TW`. The page's own labels and data belong to the application.

**English** renders the same tree without the provider, so each component
falls back to its built-in English text. Submit **新增訂單** with empty
fields to see the validation messages, and select rows to open the delete
confirmation.
