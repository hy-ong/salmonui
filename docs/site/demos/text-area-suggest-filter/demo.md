---
title: Vetoing suggestions on a full-featured TextArea
description: useTextSuggest on a TextArea with maxLength, clearable, resize, read-only and disabled states, where onBeforeSuggestionShow hides suggestions that would not fit or while suggestions are paused.
category: chat
---

Type "We", "The" or "Next" and pause: the rest of a status phrase appears
as ghost text, and Tab accepts it. Before each suggestion shows,
`onBeforeSuggestionShow` receives its `text` and may call
`preventDefault()`: this demo vetoes a suggestion that would push the update
past its 120-character `maxLength` (type some text first, then start a
phrase near the end) and every suggestion while "Pause suggestions" is
checked. The event log shows each veto next to `onSuggestionShow` and
`onSuggestionAccept`.

The field is the ordinary Inputs `TextArea`, so everything it supports
keeps working with suggestions attached: `label`, `description`,
`placeholder`, `rows`, `resize`, `maxLength`, `clearable` (the clear button,
or Escape when no suggestion is showing), `readOnly`, `disabled`, the
controlled `value` / `onValueChange` pair (with its `reason`) and the
native `onFocus` / `onBlur` events. Escape with a suggestion visible only
dismisses the suggestion; it does not clear the field.
