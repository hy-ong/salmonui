---
title: Stepper events and templates
description: A sign-up Stepper whose onBeforeValueChange refuses to leave the first step without a workspace name, an onValueChange log, step content from renderStep and one step that overrides it with its own children.
category: navigation
---

- Click **Plan** (or focus the steps and press Enter) with the name empty:
  `onBeforeValueChange` calls `preventDefault()` and the step does not
  change. Type a name and try again: `onValueChange` reports the new
  step.
- Every step's content comes from `renderStep` (number, label and status);
  **Done** passes its own children, which win over `renderStep` for that
  step.
