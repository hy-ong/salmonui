---
title: Dropdown templates
description: Custom options, value, group headers, popup header and footer, and the empty, loading and error states of Select and Combobox.
category: dropdowns
---

Owner renders each option with `renderItem` (initials, name and role), the
trigger with `renderValue`, the team headers with `renderGroupHeader`, and a
static `popupHeader` and `popupFooter`. Reviewer highlights the matched text
from `matches` and replaces the empty list with `renderEmpty` (type `zz`).
Assignee reads from a slow remote source: `renderLoading` shows while the
read is pending, and with "Make reads fail" checked `renderError` shows a
retry button (uncheck it, then press "Try again").
