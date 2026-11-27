---
title: TextArea suggestions from a phrase list
description: A TextArea with a local phrase matcher as its suggest function - ghost text or a popover, Tab to accept, Escape to dismiss, and the show and accept events in a log.
category: chat
---

Start a sentence with Thank, Kind, Looking, Please or Your and pause: after
150 ms the rest of a canned phrase appears after the caret. Press Tab to
insert it (Ctrl+Z or Cmd+Z undoes it), Escape to dismiss it, or keep typing
the same words to keep the rest of the suggestion. Switch the display to
`popover` to see the touch layout, which you can also press to accept;
`auto` picks the popover on touch screens by CSS media query. The phrase
matcher is a plain function in the demo file: no network and no model.
