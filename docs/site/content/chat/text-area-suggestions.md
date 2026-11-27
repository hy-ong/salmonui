---
title: TextArea suggestions
description: useTextSuggest - inline completions for the Inputs TextArea from any source (a local phrase list, the browser, a server or a model) as ghost text or a popover, accepted with Tab, cancelled on every keystroke, and paid for only by the fields that use them.
category: Components
order: 40
demos: [text-area-suggest, text-area-suggest-filter]
---

Smart text suggestions are a hook you wire to the Inputs `TextArea`: `useTextSuggest` from `@salmonui/chat/text-suggest` returns a
`ref` for the field. Give it a `suggest` function that returns the text to
insert at the caret, and the textarea shows it as ghost text the user
accepts with Tab. Nothing in it is tied to a model: the function can match a local
phrase list, call your server, or ask a model through your own endpoint.

```tsx
import { TextArea } from '@salmonui/inputs/text-field';
import { useTextSuggest } from '@salmonui/chat/text-suggest';
import '@salmonui/inputs/text-field/styles.css';
import '@salmonui/chat/text-suggest/styles.css';

function Reply() {
  const suggestion = useTextSuggest({
    suggest: async ({ textBeforeCaret }, { signal }) => {
      const response = await fetch('/api/complete', { method: 'POST', body: textBeforeCaret, signal });
      return response.ok ? response.text() : null;
    },
  });
  return <TextArea label="Reply" name="reply" ref={suggestion.ref} />;
}
```

`suggestion.ref` is a stable callback ref; it works on any native
`<textarea>` and survives re-renders of components that forward refs
through a new callback each render. When the field needs a ref of its own
too, call both from one callback (`(el) => { mine.current = el; suggestion.ref(el); }`). The options
(`suggest`, `suggestionDisplay`, `suggestDelay`, the events,
`localeText.acceptHint` and `container`) are read when events happen, so
inline functions are fine. `suggest` is the only required option.
`container` is the element that receives the ghost text overlay, the hint
and the live region (default: the textarea's parent, which the Inputs
`TextArea` already positions); set it when you wire a bare `<textarea>`
whose parent is not `position: relative`. Every option and type is in the
[API reference](/docs/reference/chat/text-suggest).

The hook keeps no value of its own: the field stays controlled
(`value` / `onValueChange`) or uncontrolled (`defaultValue`) exactly as
without suggestions, and an accepted suggestion reaches it as ordinary
input.

## How a suggestion is requested

- `suggest(context, { signal })` receives `context.value`,
  `context.textBeforeCaret` and `context.textAfterCaret`, and resolves the
  text to insert at the caret, or `null` for nothing.
- A request starts after `suggestDelay` milliseconds without typing
  (default 300), only with a collapsed selection, outside IME composition,
  with some text before the caret, and when the caret is at a word
  boundary (the next character is not a letter or digit).
- Every keystroke aborts the request in flight through `signal` and drops
  its answer, even when your function ignores the signal; a rejection or an
  empty answer shows nothing. Pass `signal` to `fetch` so the
  network request is cancelled too.

## Display, accepting and dismissing

`suggestionDisplay` picks the look:

| Value | Look |
| --- | --- |
| `'inline'` | Ghost text after the caret, in the placeholder color, clipped at the field's edge. |
| `'popover'` | A small box below the caret line; it can be pressed to accept, which is how touch users accept. |
| `'auto'` (default) | Inline on fine pointers, a popover on coarse pointers (`@media (pointer: coarse)`). |

The `'auto'` choice is made by the stylesheet, not by script, so the server
HTML and the hydrated page are identical: the ref never runs on the server,
so `useTextSuggest` adds nothing to the server markup.

While a suggestion is visible:

- **Tab** inserts it at the caret and keeps focus in the textarea. Without a
  visible suggestion Tab moves focus as usual, so keyboard users are never
  trapped.
- **Escape** dismisses it; moving the caret, clicking, blurring or starting
  an IME composition dismisses it too.
- Typing the next characters of the suggestion keeps the rest of it.
- The textarea's `aria-describedby` gains a hint ("Tab to accept", set with
  `localeText.acceptHint`). In popover mode the suggestion is also read by
  a polite live region.

Accepted text goes through the native input path (`insertText`, with a
`setRangeText` plus `input` event fallback): **Ctrl+Z** / **Cmd+Z** undoes
it, `onValueChange` and `onChange` fire, and `FormData`, `form.reset()` and
form libraries see it exactly as typed text. A suggestion that is only
shown is never part of the value.

## Events

| Prop | When |
| --- | --- |
| `onBeforeSuggestionShow(event)` | Before a suggestion shows; `event.text` is the suggestion, `event.preventDefault()` hides it. |
| `onSuggestionShow({ text })` | After it shows. |
| `onSuggestionAccept({ text })` | After Tab or a press inserted it. |

`onBeforeSuggestionShow` is the place for application rules: hide a
suggestion that would exceed `maxLength`, contains a blocked word, or
arrives while the user has paused suggestions. The demo below does the
first and the last on a `TextArea` that also uses `maxLength`,
`clearable`, `resize`, `readOnly` and `disabled`.

<!-- demo: text-area-suggest-filter -->

## A local phrase list

No network is needed for canned replies. This is the recipe for a fixed
phrase list:

```ts
import type { SuggestFunction } from '@salmonui/chat/text-suggest';

const PHRASES = ['Thank you for your message', 'Kind regards'];

const suggestPhrase: SuggestFunction = async ({ textBeforeCaret }) => {
  const before = textBeforeCaret.toLowerCase();
  for (const phrase of PHRASES) {
    for (let k = phrase.length - 1; k > 0; k--) {
      const start = before.length - k;
      if (before.endsWith(phrase.slice(0, k).toLowerCase()) && (start === 0 || /\s/.test(before[start - 1]!))) return phrase.slice(k);
    }
  }
  return null;
};
```

For a model, build the prompt on your server: a role line describing the
user and any phrase list become part of that prompt. Never send an API key to the browser.

## SSR

`useTextSuggest` is SSR-safe: the hook renders nothing and its ref runs
only in the browser, so a `TextArea` wired to it renders exactly the same
server markup as one without it, and suggestions attach after hydration.
`suggest` is called only from browser events.

## Performance

The suggestion code (request timing, overlay, caret measurement) lives in
`@salmonui/chat/text-suggest` (about 2.6 KB gzip), not in the
`TextArea`: a field without `useTextSuggest` pays nothing for it, and a
field with it pays no lazy-chunk loader. The ghost text is written to an overlay
element, not rendered through React state, so a keystroke re-renders
nothing beyond the textarea's own value.

## Everything else is the TextArea

Rows, columns, resizing, `maxLength`, `placeholder`, `readOnly`,
`disabled`, the label, description, validation, adornments and the
`value` / `onValueChange` pair are the Inputs `TextArea`, documented on the
[TextField and TextArea](/docs/inputs/text-field) page.

## Design notes

- **No role or phrase props.** A user role and a phrase
  list only shape the input of one particular AI request, and Salmon makes
  no request itself: your `suggest` function owns the source. Put the role
  line into the prompt your server builds, and a phrase list into a local
  matcher like the recipe above (no network needed).
- **Common props, methods and lifecycle.** The suggestion is a
  hook on a native `<textarea>`, not a component with its own lifecycle,
  so these follow the catalog-wide rules: persistence is your own state
  (save `value`), direction is the inherited `dir`, labels are
  `localeText`, styling and attributes are `className` and native props on
  the `TextArea`, focus is `ref.current.focus()` / `.blur()`, and setup and
  teardown are an effect.
