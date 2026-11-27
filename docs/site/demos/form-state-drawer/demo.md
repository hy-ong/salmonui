---
title: Edit drawer with unsaved changes
description: An order editor in a Drawer built on useFormState - Save and Discard appear only while the form is dirty, closing a dirty form asks through useConfirm, required labels carry a mark, and statuses show as status dot badges.
category: inputs
---

Press Edit, then change a field: the footer switches from Close to
Discard and Save, and the line under the fields lists the changed field
names (`form.dirtyFields`). Change the value back and the form is clean
again: dirtiness compares the live `FormData` with the values the form
had when it opened, not "was anything typed".

With unsaved changes, Escape, the backdrop, the close button and Close
ask "Discard unsaved changes?" through `useConfirm()`; Keep editing
returns to the form. Discard (`form.reset()`) restores every field's
`defaultValue`. Save submits the native form and closes the drawer.

`Form requiredMark` puts a decorative asterisk before the labels of the
required fields, the Select included; screen readers hear "required" once,
from the control.
