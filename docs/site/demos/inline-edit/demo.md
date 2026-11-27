---
title: Inline edit
description: Click-to-edit fields - a title in a popover with validation and a slow save, a number in place with a range rule, and a notes field that saves with Ctrl+Enter.
category: editors
---

Click the title to edit it in a popover; Enter saves, Escape cancels. The save
takes 600 ms (the Save button shows a spinner); type `fail` to see a rejected
save keep the editor open with an error. The quantity edits in place with a
number input and a 1 to 10 range rule; the notes use a textarea, so Enter
adds a line and Ctrl+Enter (Cmd+Enter) saves. The log shows the events.
