---
title: InlineAssist modes, toolbar, templates and dictation
description: Switch an InlineAssist between the anchored popover and inline mode, move its toolbar slot, replace the prompt with renderComposer, render a Markdown answer through renderContent and dictate the prompt with InlineAssist.Dictation.
category: chat
---

Press "Ask AI" (or Ctrl+Space in the editor). In `popover` mode the assist
is an anchored, non-modal dialog in the top layer that closes on Escape and
on an outside press; in `inline` mode it renders in the page flow below the
editor and closes on Escape only. Either way focus moves into the prompt,
Tab is not trapped (it walks the prompt, the controls and the response
actions in visual order, then leaves the dialog) and, when the assist closes, focus returns to the editor. The
dialog is named "Writing assistant" through `localeText.label`, and the
finished response is announced through a polite live region.

The `toolbar` slot holds two quick actions that call `api.send()`; switch
"Toolbar placement" between `inline` (next to the prompt) and `bottom` (a
row below it). With "renderComposer" checked, the prompt is a custom
template that spreads `inputProps` on its own `<textarea>` and adds a
character counter; uncheck it for the built-in prompt.

The fake adapter streams Markdown. `renderContent` is a short application
renderer in the demo file that turns paragraphs, `- ` lists and `**bold**`
into React nodes and shows a caret while `streaming` is true; Salmon UI
never renders model output as an HTML string.

The microphone button is `InlineAssist.Dictation`, the Inputs
`SpeechToTextButton`: the transcript is appended to the prompt. "Scripted
speech" passes a `recognizer` that "hears" a fixed phrase, so it works
without a microphone; uncheck it to use the browser's speech recognition,
where the button is disabled and described as unsupported if the browser
has none.
