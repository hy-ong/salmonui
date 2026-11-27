---
title: Editing, popups and validation
description: Events with your own property names mapped through eventFields, validated subject and room fields with a default room, the quick info popups and the editor dialog, add, edit and delete permissions, overlap prevention, a blocked window, a locked event, read-only mode, inline editing, click events and the CRUD methods.
category: calendars
---

The rows use `Id`, `Subject`, `StartTime`, `EndTime`, `Room`, `Locked` and
`Blocked`; `eventFields` maps them. Click a free slot: the cell quick info
asks for a title (Save, or More details for the dialog). Double click an
event for the editor dialog: clear the subject or type `Basement` as the
room to see the validation messages; a new event starts in the Atrium
(`defaultValue`). Drag the workshop onto the board meeting: with "Prevent
overlaps" ticked the move is rejected and `onOverlap` reports the
conflict. The maintenance window is blocked and the board meeting is
locked (the `readOnly` role). Untick `editing.add`, `edit` or `delete` to
remove those actions; `readOnly` allows details only. With "Inline editing"
typing in a focused cell creates an event and Enter on an event edits its
title in place. The log shows the click, popup and change events; the
buttons call `addEvents`, `saveEvent`, `deleteEvents`, `openEditor`,
`openQuickInfo` and `isSlotAvailable`.
