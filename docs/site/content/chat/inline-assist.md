---
title: InlineAssist
description: An AI prompt anchored to an editor, a text selection or a point - streamed responses from a provider-agnostic adapter, Stop, slash commands, Accept / Discard / Retry, a toolbar slot, custom composer and content renderers, dictation and APG non-modal dialog accessibility.
category: Components
order: 40
demos: [inline-assist-basic, inline-assist-modes]
---

`InlineAssist` from `@salmonui/chat/inline-assist` is an inline AI
assistant: a small prompt that opens next to the text a user is editing,
sends the prompt and the selected text to your model, streams the answer in
and lets the user accept it into the editor. Salmon ships no model and no
provider SDK; you pass an `adapter` function.

```tsx
import { InlineAssist } from '@salmonui/chat/inline-assist';
import '@salmonui/chat/inline-assist/styles.css';

const editor = useRef<HTMLTextAreaElement>(null);
const [open, setOpen] = useState(false);

<textarea ref={editor} />
<button onClick={() => setOpen(true)}>Ask AI</button>
<InlineAssist
  anchor={editor}
  open={open}
  onOpenChange={setOpen}
  adapter={myAdapter}
  onAccept={({ text }) => editor.current?.setRangeText(text, editor.current.selectionStart, editor.current.selectionEnd, 'select')}
/>
```

`adapter` is the only prop a working assist needs besides a way to open
it; `anchor`, `open` and `onAccept` connect it to your editor. The
stylesheet carries the Button, Menu and SpeechToText rules the assist
renders, so it is the only stylesheet besides `@salmonui/core/styles.css`
(the theme, once per app). Every prop, event and type is listed in the
[API reference](/docs/reference/chat/inline-assist).

<!-- demo: inline-assist-basic -->

## Anchor, open state and dismissal

`anchor` is what the popover is placed next to:

- an element (`HTMLElement`) or a ref to one (`useRef`),
- a DOM `Range`, usually the current selection
  (`getSelection().getRangeAt(0).cloneRange()`); its text is also the
  request's `selection`,
- a point `{ x, y }` in viewport coordinates (`event.clientX`,
  `event.clientY`), for example from a context menu.

Without an anchor the popover opens next to the element that had focus.
It renders in the top layer (the Popover API), so there is no `zIndex`:
size it with `className` or `style`, for example
`style={{ inlineSize: 480 }}`.

`open` / `defaultOpen` / `onOpenChange(open, { reason })` follow the
controlled and uncontrolled convention. `reason` is `'escape'`,
`'outside'` (a press outside), `'focus-outside'` (Tab left the dialog),
`'accept'`, `'discard'` or `'api'`. Closing aborts a running response.
The assist renders nothing on the server: it opens on the client after
hydration, also with `defaultOpen`.

## Inline and popover mode

`mode="popover"` (the default) is the anchored top-layer popover.
`mode="inline"` renders the same panel in place, where you put the
component in your tree (below a paragraph, inside a document editor). An
inline panel is not positioned (`anchor` only decides where focus returns),
has no outside-press dismissal and closes on Escape.

The demo below switches between the two modes and also shows the toolbar
slot, a custom composer, a Markdown `renderContent` and dictation, all
described in the sections that follow.

<!-- demo: inline-assist-modes -->

## Prompt and history

The prompt is a `<textarea>` with `value` / `defaultValue` /
`onValueChange` and `placeholder`. Enter sends, Shift+Enter adds a
line, and nothing happens during IME composition. The prompt is cleared
when it is sent.

Every finished prompt becomes an `InlineAssistMessage`:

```ts
interface InlineAssistMessage {
  id: string;
  prompt: string;
  command?: string; // the command id, when a command produced the prompt
  response: string;
  status: 'done' | 'aborted' | 'error';
}
```

`messages` / `defaultMessages` / `onMessagesChange(messages, { reason })`
hold the history; `reason` is `'response'` or `'retry'` (Retry replaces the
last message). `onMessagesChange` fires once per response, never per
chunk. The panel shows the latest response; the history goes to the
adapter as `request.messages`.

## The adapter

```ts
type InlineAssistAdapter = (
  request: { prompt: string; command: InlineAssistCommand | undefined; selection: string; messages: readonly InlineAssistMessage[] },
  context: { signal: AbortSignal },
) => PromiseLike<string> | AsyncIterable<string | InlineAssistResponsePart>;
```

The return type decides streaming: a Promise is one final
response, an async iterable streams. A yielded string is a text delta, the
same as `{ type: 'text', delta }`; `reasoning` and `tool` parts are
ignored by InlineAssist. `selection` is the `selection` prop when given,
else the text of a `Range` anchor, else `''`.

```ts
// A server route proxies your provider; the browser never holds an API key.
const adapter: InlineAssistAdapter = async function* (request, { signal }) {
  const response = await fetch('/api/assist', { method: 'POST', body: JSON.stringify(request), signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield value;
  }
};
```

Streamed text never goes through React state: chunks are buffered and
painted once per animation frame, and with the default renderer they are
appended to a text node, so a token costs no React render. The Stop button
replaces Send while a response runs; Stop, closing, a new send and
unmounting abort `signal`, and a chunk that arrives after the abort is
dropped. A stopped response keeps its partial text (`status: 'aborted'`).
A thrown error (or a rejected Promise) shows the error text
(`localeText.error`) with Retry, keeps the partial text with
`status: 'error'` and calls `onError(error)`.

`onBeforeSend(event)` runs first; `event.preventDefault()` keeps the prompt
and sends nothing. `onSend(event)` reports the sent `event.request`. Send
programmatically with the ref:

```tsx
const assist = useRef<InlineAssistApi>(null);
<InlineAssist ref={assist} ... />
assist.current?.send('Summarize the selection');
```

`InlineAssistApi` has `open()`, `close()`, `send(text?)`, `stop()`,
`showCommands()`, `hideCommands()`, `focus()` and `element`.

## Commands

`commands` is a list of slash commands:

```tsx
<InlineAssist
  commands={[
    { id: 'shorter', label: 'Make shorter', keywords: ['summarize'] },
    { id: 'formal', label: 'Make it formal', prompt: 'Rewrite this in a formal tone' },
  ]}
  onCommandSelect={(event) => track(event.command.id)}
/>
```

Typing `/` in the prompt shows them as the Buttons `Menu`, filtered by the
text after the slash (label and `keywords`, case-insensitive). Arrow keys
move into the menu, Enter in the prompt picks the first match, Escape
hides the menu and returns to the prompt. `api.showCommands()` opens the
assist with the full menu. Picking a command sends its `prompt` (default
its `label`) with `request.command` set; `event.preventDefault()` in
`onCommandSelect` skips that send.

## Response actions

A finished response shows its actions; `responseActions`
defaults to `['accept', 'discard', 'retry']` and accepts custom items
`{ id, label, icon? }`:

- Accept calls `onAccept({ text, message })` and closes; insert the text
  into your editor there. Focus returns to the editor.
- Discard calls `onDiscard({ message })` and closes.
- Retry sends the same prompt again and replaces the last message.

`onResponseActionClick(event)` runs first for every action, custom ones
included; `event.preventDefault()` cancels the built-in follow-up.

## Toolbar, composer and content

`toolbar` adds your controls next to the prompt (`toolbarPlacement:
'inline'`, the default) or in a row below it (`'bottom'`).

`renderComposer({ inputProps, value, setValue, send, stop, responding,
defaultComposer })` replaces the prompt input; spread `inputProps` on your
element so the label, keys and focus keep working.

`renderContent(text, { streaming })` renders the response. The default renders plain text with its line breaks preserved
(`white-space: pre-wrap`). Model output is never rendered as HTML: a
response that contains `<b>` shows the characters `<b>`.

### Markdown recipe

Bring your Markdown renderer through `renderContent`. With
`react-markdown` (which builds React elements, no HTML strings):

```tsx
import Markdown from 'react-markdown';

<InlineAssist renderContent={(text) => <Markdown>{text}</Markdown>} />
```

The renderer runs once per animation frame while streaming, so a parser
that re-parses the whole text costs O(length) per frame; check
`streaming` to show plain text until the end if your responses are long.
If you trust the markup and use an HTML renderer, the
`dangerouslySetInnerHTML` call is yours, inside `renderContent`.

## Dictation

`InlineAssist.Dictation` (also exported as `InlineAssistDictation`) is the
Inputs `SpeechToTextButton` placed next to the prompt. The
transcript is appended to the prompt text present when listening
started. It accepts the button props (`lang`, `interimResults`,
`continuous`, a replaceable `recognizer`, `onError`, ...).

```tsx
<InlineAssist adapter={adapter}>
  <InlineAssist.Dictation lang="en-US" interimResults />
</InlineAssist>
```

The button is named "Dictate" (`localeText.dictation`) and is a toggle
(`aria-pressed` while listening). In a browser without the Web Speech API
and with no `recognizer`, it is disabled and described as unsupported, so
nothing breaks; pass a `recognizer` (the Inputs `SpeechRecognizer`
contract) to use a cloud service instead. It must be rendered inside
`InlineAssist`.

## Accessibility

InlineAssist follows the APG non-modal dialog pattern:

- `role="dialog"` without `aria-modal`, named "AI assistant"
  (`localeText.label`, or your `aria-label` / `aria-labelledby`).
- Focus moves into the prompt on open and returns to the editor (the
  focusable element at the anchor; for a point anchor, the element that
  had focus) on close. `returnFocus={false}` turns this off.
- Tab is not contained: the order is the prompt, the controls next to it,
  the response actions, then out of the dialog (which closes it).
- The command list is an APG Menu (`role="menu"`, roving focus,
  typeahead); disabled commands are `aria-disabled`.
- The response is `aria-busy` while it streams, and a polite live region
  announces the finished response once.
- Every string is in `localeText` (defaults: "AI assistant", "Prompt",
  "Ask AI, or type / for commands", "Send", "Stop", "Accept", "Discard",
  "Retry", "Commands", "Response actions", "Thinking…", "The response
  failed.", "Dictate"; the defaults are exported as
  `INLINE_ASSIST_DEFAULT_LOCALE_TEXT`).

Keyboard summary:

| Key | Where | Action |
| --- | --- | --- |
| Enter | prompt | Send (or pick the first command while the menu shows) |
| Shift+Enter | prompt | New line |
| `/` | start of the prompt | Show and filter the commands |
| Arrow Down / Up | prompt with the menu open | Move into the command menu |
| Escape | menu | Hide the menu, back to the prompt |
| Escape | dialog | Close; focus returns to the editor |
| Tab / Shift+Tab | dialog | Move through the controls; leaving the dialog closes a popover |

Opening the assist is up to you (a button, a shortcut such as Ctrl+Space,
a context menu); InlineAssist adds no global shortcut.

## SSR

The component is SSR-safe and renders nothing on the server, open or not:
the panel appears on the client after hydration (so `defaultOpen` and
`open` take effect then), which keeps server and client markup identical.
Browser APIs (selection ranges, the top layer, speech recognition) are
used only in effects and event handlers. Build `anchor` ranges and points
in event handlers, not during render.

## Design notes

- **Popup sizing and stacking.** There is no `popupWidth`,
  `popupHeight` or `zIndex`: the popover lives in the browser top layer,
  above every z-index, so a stacking prop has nothing to do, and size is
  ordinary CSS. Size it with `className` or `style`
  (`style={{ inlineSize: 480, maxBlockSize: 360 }}`).
- **Common props and lifecycle.** These follow the catalog-wide
  rules rather than per-component props: there is no built-in persistence
  because storage policy belongs to the application (save the
  `onMessagesChange` and `onValueChange` output yourself and pass it back
  as `defaultMessages` / `defaultValue`), direction is the inherited `dir`
  attribute, labels are `localeText`, styling is `className`, and setup
  code goes in a `ref` callback or an effect.
- **Provider integrations.** Salmon ships no provider SDK and no
  Gemini or Ollama sample component, so the library stays provider-neutral
  and keys stay on your server. Write an `adapter` that calls your own
  server route, as in the adapter recipe
  above.
