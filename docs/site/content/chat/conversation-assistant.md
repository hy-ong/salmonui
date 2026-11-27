---
title: AI assistant
description: Conversation with variant="assistant" - a provider-agnostic adapter that streams text, reasoning and tool parts, Stop, a pending skeleton, prompt suggestions, regenerate with response alternatives, feedback, prompt and response toolbars, dictation and an application Markdown renderer.
category: Components
order: 15
demos: [conversation-assistant, conversation-mentions]
---

`<Conversation variant="assistant">` is the AI assistant view: a user
asks, an assistant answers. It is the same component as the
[chat](/docs/chat/conversation) (the feed, the composer, mentions,
attachments, scrolling and the API are shared); the assistant renderers
(prompt and response items, the pending skeleton, reasoning and tool parts,
response alternatives, feedback and the response toolbar) are a chunk that
loads only for `variant="assistant"`, so a chat pays nothing for them.

```tsx
import { Conversation } from '@salmonui/chat/conversation';
import '@salmonui/chat/conversation/styles.css';

<Conversation
  variant="assistant"
  adapter={async function* (request, { signal }) {
    const response = await fetch('/api/chat', { method: 'POST', body: JSON.stringify(request), signal });
    yield* readTextStream(response.body!); // recipe below, no dependency
  }}
  renderContent={(text) => <MyMarkdown text={text} />}
  style={{ blockSize: 560 }}
>
  <Conversation.Suggestions heading="Try" items={['Summarize this page']} />
  <Conversation.Composer clearable toolbar={<Conversation.Dictation />} />
</Conversation>
```

No component here contains a model, a provider SDK or an API key: the
`adapter` is your function, and Salmon UI never renders model output as an
HTML string. Every prop and type is listed in the
[API reference](/docs/reference/chat/conversation).

<!-- demo: conversation-assistant -->

## Prompts and responses

Each turn is two `ConversationMessage` records keyed by a stable `id`:
the prompt, authored by `currentUser` (default `'user'`), and the
response, authored by `adapterAuthor` (default `'assistant'`). Messages are
controlled (`messages` with `onMessagesChange`) or uncontrolled
(`defaultMessages`); `onMessagesChange` fires once when you send (`reason:
'send'`, the prompt and the pending response together) and once when the
response is complete, stopped or failed (`'response'`), never per token;
regenerate and feedback commit with `'regenerate'` and `'feedback'`, and
regenerating a failed response (its Retry button) with `'retry'`. A
response may carry:

| Field | Meaning |
| --- | --- |
| `text` | The answer (plain text or Markdown for your renderer) |
| `parts` | Reasoning and tool parts in arrival order |
| `alternatives` | Earlier responses to the same prompt, oldest first; `text` is the latest |
| `feedback` | `'positive'` or `'negative'` |
| `status` | `'sending'` while pending, `'error'` after a failure |

Prompts can carry `mentions` and `attachments` exactly as in the chat:
`Conversation.Composer` `mentions={[{ trigger: '@',
items }]}` goes through the Dropdowns `Mention`, and `attachments` takes
`accept`, `maxSize`, `maxCount`, an `upload(file, { signal, onProgress })`
transport and `renderPreview`. There is no upload URL property:
Salmon does not prescribe a backend protocol, and a URL property would
hard-code one multipart format and its error handling. Pass an `upload`
function that posts to your endpoint and returns the stored reference, and
delete stored files in an `onAttachmentRemove` handler (see the
[upload transport](/docs/chat/conversation-messages#upload-transport)). The
request the adapter receives has the attachments of the prompt.

`onBeforeMentionSelect(event)` runs before a mention is inserted
(`event.user`, `event.trigger`; `event.preventDefault()` cancels it) and
`onMentionSelect` after. The sent prompt lists the ids in
`message.mentions`, so the adapter can read them from the last entry of
`request.messages`; put mentionable people in `users` too so their names
render as mention tokens.

<!-- demo: conversation-mentions -->

Avatars come from `users` (`avatar` as an image URL or a node) or
`renderAvatar`.

## The adapter

```ts
type ConversationAdapter = (
  request: { messages: readonly ConversationMessage[]; text: string; attachments: readonly ConversationAttachment[] },
  context: { signal: AbortSignal },
) => Promise<string> | AsyncIterable<string | ConversationResponsePart>;

type ConversationResponsePart =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool'; id: string; name: string; input: unknown; output?: unknown; status?: 'running' | 'done' | 'error' };
```

The return type decides streaming: a `Promise<string>` is
one final response, an `AsyncIterable` streams. A plain string chunk is a
text delta (`{ type: 'text', delta }` is the same). Streamed text is
buffered outside React state and painted once per animation frame; only the
streaming item renders. `request.messages` is the history including the new
prompt. `onBeforeSend` can cancel a send (`event.preventDefault()` keeps the
draft), `onSend` reports it, and `api.send(text)` sends from code.

Stop (the button that replaces Send while a response is pending),
`api.stop()`, a new send, a regenerate and unmount abort the `signal`;
a chunk that arrives after the abort is dropped, the partial
response is kept (a response stopped before its first chunk is removed) and
`onStop({ message })` fires. The Stop button also returns focus to the
composer. A thrown error marks the response `status: 'error'` and
`onError` reports it; its Retry button regenerates the response (the partial
text becomes an alternative) and commits with `reason: 'retry'`.

The part protocol is Salmon UI's own and deliberately small; it does not
follow any SDK's message format. Map your provider's events to it in the
adapter (recipes below).

## Pending response

Until the first text chunk arrives the response shows `renderPending`
(default: a skeleton line) and its article is `aria-busy="true"`,
so screen readers skip the half-written answer; the polite live region
announces the response once it is complete.

## Suggestions

`Conversation.Suggestions` renders `items` as a labelled group of
buttons (`heading`, `renderItem`); choosing one sends it as a prompt.

## Reasoning and tools

Reasoning parts (`part:reasoning`) render as a collapsed native
disclosure ("Reasoning"); consecutive deltas are joined. `renderReasoning({
text, message, streaming })` replaces it and `onReasoningClick({ message,
open })` reports the default disclosure opening or closing.

Tool parts (`part:tool`) with the same `id` update each other, so an
adapter yields `{ status: 'running' }` first and the `output` later. The
default shows `name: status` with the input and output as text;
`renderTool={{ weather: ({ part, message }) => <WeatherCard {...part} /> }}`
renders a tool by name. Your tool code runs in the adapter, not in the
component. Agent-streamed A2UI surfaces are not included (see
[Conversation](/docs/chat/conversation#agent-streamed-surfaces-not-included));
`renderTool` covers generated UI built from your own components.

## Regenerate, alternatives and feedback

The response toolbar (`Conversation.ItemActions`) has `'copy'`,
`'regenerate'` and `'feedback'` (Helpful and Not helpful toggle buttons with
`aria-pressed`); the prompt toolbar has `'edit'` (copies the prompt back into
the composer through the native input path, so undo and `onValueChange`
see it) and `'copy'`. `itemActions` sets both (`['copy']`), each
(`{ prompt: ['copy'], response: ['copy', 'feedback'] }`) or hides them
(`false`); custom items (`{ id, label, icon }`) fire
`onItemActionClick`. Every built-in action fires `onItemActionClick({
action, message, feedback })` first; `event.preventDefault()` cancels the
built-in follow-up (copy, regenerate, feedback, edit).

Regenerate (or `api.regenerate(id)`) moves the current text into
`alternatives` and runs the adapter again with the history up to the
prompt; the arrows below the response browse the alternatives ("2 of 2").
A regenerate that produces nothing (stopped before the first chunk) brings
the previous text back. Feedback is stored on the message
(`message.feedback`, `reason: 'feedback'`); clicking the pressed button
again clears it.

## Composer, dictation, header and footer

`Conversation.Composer` takes `value` / `defaultValue` /
`onValueChange`, `placeholder`, and `clearable` (a clear button while there
is a draft). Its `toolbar` slot holds extra controls, such as
`Conversation.Dictation`: a microphone button over the Inputs
`useSpeechRecognition` hook. The transcript follows the current draft; the
button is disabled, with an explanation, on the server, during hydration
and in browsers without speech recognition; `recognizer` plugs in a cloud
recognizer (the Inputs `SpeechRecognizer` contract) and `lang` sets the
language.

The header renders only when `Conversation.Header` is a child;
`Conversation.Footer` is a footer slot, `renderEmpty` the banner while there
are no messages, and `renderItem({ message, index, defaultItem })` wraps or
replaces items, with `Conversation.Item` for decoration.

## Scrolling

New prompts and responses keep the view at the bottom (`autoScroll:
'whenAtBottom' | 'always' | 'never'`); when you scrolled away,
`Conversation.JumpButton` (default on) jumps back, and `api.scrollToBottom()`
does it from code.

## Markdown and other content

`renderContent(text, { message, streaming })` renders the text of every
response; the default is plain text with preserved line breaks.
Bring your Markdown renderer here, for example `react-markdown` or
`marked` plus your sanitizer turning the result into React elements. It is
called once per animation frame while the response streams (`streaming:
true`), so a renderer that re-parses the whole text costs O(length) per
frame; the default plain-text renderer appends text nodes instead.

HTML strings are never rendered as markup: content is text, parts
and `ReactNode`, so a response containing `<b>` shows the characters.
Model output is untrusted input, and rendering it as HTML is an XSS path.
Pass the raw response text and render it with your Markdown renderer in
`renderContent`; if the markup is
trusted HTML, your `renderContent` owns the `dangerouslySetInnerHTML`
call.

## Accessibility

The feed is an APG Feed (`role="feed"`, one `role="article"` per prompt and
response, Page Up / Page Down between them, Ctrl+Home / Ctrl+End to leave);
the streaming response is `aria-busy` and a polite live region announces it
once complete; the toolbars follow the APG Toolbar pattern (one tab stop,
Left / Right / Home / End); Stop is a reachable button that returns focus to
the composer; reasoning is a disclosure; the composer is a labelled
`<textarea>` with `aria-multiline`. Verified by axe and ARIA
snapshots in light, dark and RTL. The full key table is on the
[Conversation](/docs/chat/conversation#keyboard-and-accessibility) page.

## Server rendering

The assistant renderers are static on the server, so the server HTML holds
the prompts, the responses and their parts; in the browser the chunk loads
on first use and hydration waits for it, without a mismatch. The SSR rules
of the [chat](/docs/chat/conversation#server-rendering) apply: pass
`timeZone` for stable timestamps, and generate ids and dates in your data
or event handlers, never in render. `Conversation.Dictation` renders
disabled on the server and during hydration, and enables once speech
recognition is detected.

## Recipes

### A server proxy and SSE to `AsyncIterable`

Salmon UI ships no provider SDK: a provider package would add a
runtime dependency and track fast-moving formats, and browser-side samples
expose API keys. Keep keys on the server: move the provider call from your
`promptRequest` handler to a server route that streams text back, return
that stream from the `adapter`, and delete `addPromptResponse` calls and
timer-based streaming.

```ts
async function* readTextStream(body: ReadableStream<Uint8Array>) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield value;
  }
}

// Server-sent events: one `data:` line per chunk, `event: reasoning` for thinking.
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncIterable<string | ConversationResponsePart> {
  let buffer = '';
  for await (const text of readTextStream(body)) {
    buffer += text;
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'text';
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? '';
      yield event === 'reasoning' ? { type: 'reasoning', delta: JSON.parse(data) } : JSON.parse(data);
    }
  }
}
```

### Text to speech

There is no built-in speaker: the voice, language and trigger are
the application's choice, and `speechSynthesis` is one call with no
rendering component. Replace `textToSpeechSettings` with a custom item
action:
`itemActions={{ response: ['copy', { id: 'speak', label: 'Read aloud' }] }}`
and in `onItemActionClick` call
`speechSynthesis.speak(new SpeechSynthesisUtterance(event.message.text))`.

### Several views

Several views are a composition, not a second tab model
inside the assistant: put `Conversation` and your other panels in the
Navigation [Tabs](/docs/navigation/tabs), one `Tab` / `TabPanel` pair per
view, with the active view as the `Tabs` `value`. Keep
`messages` in your state so switching tabs keeps the history.

### Persistence, telemetry and common props

The component has no persistence, direction or sizing props:
built-in persistence would write storage behind your back and break SSR
consistency, and direction and size duplicate the platform. Persist the `onMessagesChange` output yourself, put `dir="rtl"` on
an ancestor, take strings from `localeText` and timestamps from `locale`,
and use `className` / `style` on the root.

Telemetry belongs to your observability stack, not a UI library:
wrap the adapter, which sees every request
and every chunk (`(request, context) => traced(adapter(request, context))`),
or read `onSend` and `onMessagesChange`.

There are no lifecycle events, because React already has a
lifecycle: put setup code in a `ref` callback or a `useEffect`, and
teardown code in its cleanup.

## Locale text

The assistant adds these `localeText` keys (defaults in English): `edit`,
`regenerate`, `helpful`, `notHelpful`, `previousResponse`, `nextResponse`,
`responseIndex` (`'{index} of {count}'`), `reasoning`, `tool`
(`'{name}: {status}'`) with `toolRunning`, `toolDone`, `toolError`,
`responding`, `dictate` and `dictationUnsupported`. Their defaults ship with
the assistant chunk, so they are not in `CONVERSATION_DEFAULT_LOCALE_TEXT`;
the composer's `clear` label is a chat key and is.

## Page blocks and layouts

- **No copy-paste page blocks.** Salmon UI ships components,
  not starter or marketing page blocks. Build pages from Salmon components
  using the examples in their docs.
- **No utility-framework styling.** Salmon UI uses `.salmon-*`
  classes and a derived theme: five seeds plus `colorScheme`, `density`,
  `fontFamily`, `neutral` and `surfaces` on `ThemeProvider`. Style with
  your theme, `className` and `style`.
- **AI layouts.** An AI chat page, sidebar, dialog or floating
  widget is a composition: place `Conversation` in a sidebar, a `Dialog`
  or a floating `Popover`.
