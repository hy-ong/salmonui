---
title: Conversation
description: A chat between people and bots - controlled or uncontrolled messages, users and avatars, a composer that sends on Enter, streamed bot replies from an adapter, typing indicators, timestamps, date separators, templates and an accessible APG Feed.
category: Components
order: 10
demos: [conversation-basic, conversation-mentions]
---

`Conversation` from `@salmonui/chat/conversation` renders a chat: a
scrolling feed of messages, an optional header, quick replies and a
composer. It is the chat UI for people talking to people or to a
bot (`variant="chat"`, the default). For an AI assistant see
[AI assistant](/docs/chat/conversation-assistant) (`variant="assistant"`).
Every prop and type is listed in the
[API reference](/docs/reference/chat/conversation).

```tsx
import { Conversation } from '@salmonui/chat/conversation';
import '@salmonui/chat/conversation/styles.css';

<Conversation currentUser="me" users={users} defaultMessages={history} style={{ blockSize: 480 }}>
  <Conversation.Header title="Support" />
  <Conversation.Composer placeholder="Write a message" />
</Conversation>
```

The stylesheet carries the rules of everything the conversation renders,
including its buttons and the Mention popup the composer uses for `@`
mentions, so it is the only stylesheet besides `@salmonui/core/styles.css`
(the theme, once per app). The root is
a `<div class="salmon-conversation">` that fills its container: give it, or
its parent, a block size. `className` and `style` go to the root;
`classNames` and `styles` reach the parts `root`, `scroller`, `feed`,
`item`, `composer` and `typing`.

<!-- demo: conversation-basic -->

## Messages

A message is a plain record keyed by a stable `id`:

```ts
interface ConversationMessage {
  id: string;            // list key and store key
  author: string;        // user id
  text: string;
  createdAt?: Date | string | number;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  replyTo?: string;      // see "Conversation actions and attachments"
  replyPreview?: { author: string; text: string };
  pinned?: boolean;
  forwarded?: boolean;
  mentions?: string[];   // user ids
  attachments?: ConversationAttachment[];
}
```

Pass `defaultMessages` and let the component own the list, or own it
yourself with `messages` and `onMessagesChange(next, { reason })`. The
reason is `'send'` (the composer, a quick reply or `api.send()`),
`'response'` (a bot reply that finished, was stopped or failed), or
`'delete'` and `'pin'` (built-in item actions); the assistant variant adds
`'regenerate'`, `'feedback'` and `'retry'` (its Retry button regenerates a
failed response). In the chat variant the component never changes the list
for a Retry click: `onRetry` hands the message to you. Items are keyed by `id`, so
replacing one record re-renders that item only.

```tsx
const [messages, setMessages] = useState(initial);

<Conversation
  currentUser="me"
  messages={messages}
  onMessagesChange={(next, { reason }) => setMessages(next)}
/>
```

There are no `addMessage()`, `prependMessages()` or `updateMessage()`
methods: a second copy of the history inside the component would
drift from your server state. Append with `setMessages([...messages, m])`,
prepend from `onLoadOlder` (see
[history and scrolling](/docs/chat/conversation-history)), and update by
replacing the record with that `id`.

## Users and the current user

`currentUser` is the id of the person using the UI: their messages get
`data-own` and align to the inline end. `users` lists everybody
who can appear as an author:

```tsx
const users: ConversationUser[] = [
  { id: 'me', name: 'Ada Lovelace' },
  { id: 'bob', name: 'Bob Stone', avatar: '/avatars/bob.png', status: <Online /> },
];
```

`avatar` is an image URL or any node; without it the avatar shows the
initials of `name`. `status` is a presence node next to the avatar. An
author missing from `users` shows its id. `renderAvatar({ user, id })`
replaces the avatar, and every item carries `data-author` for per-user
styling.

## Sending

The composer is a native `<textarea>` that grows with its content. Enter
sends, Shift+Enter inserts a line break, and Enter never sends while an IME
composition is open. An empty draft is not sent.

`onBeforeSend({ message })` runs first; `event.preventDefault()` cancels
the send and keeps the draft in the composer, for example to validate it.
`onSend({ message })` reports a message that was sent. The new
message gets a generated id, `author: currentUser` and `createdAt: new
Date()`.

```tsx
<Conversation
  currentUser="me"
  onBeforeSend={(e) => e.message.text.length > 2000 && e.preventDefault()}
  onSend={(e) => saveMessage(e.message)}
/>
```

`Conversation.Composer` takes `placeholder`, `rows` (default 1),
`disabled`, a `toolbar` node next to the send button, and
`mentions` and `attachments` (see
[actions and attachments](/docs/chat/conversation-messages)). The draft is
uncontrolled by default (it lives in the `<textarea>`, optionally seeded by
`defaultValue`); pass `value` with `onValueChange` to own it, for example to
keep a draft per conversation. After a send the composer reports `''`.

```tsx
const [draft, setDraft] = useState('');

<Conversation.Composer value={draft} onValueChange={setDraft} />
```

Without a `Conversation.Composer` the conversation is read-only;
`Conversation.Footer` renders any other content at the bottom.

## Bot replies

`adapter` answers each sent message. It receives the history
including the new message, the text and the attachments, plus an
`AbortSignal`, and returns either a `Promise<string>` (one final reply) or
an `AsyncIterable<string>` of text chunks:

```tsx
const bot: ConversationAdapter = async function* ({ messages, text }, { signal }) {
  const response = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages }), signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield value;
  }
};

<Conversation currentUser="me" adapter={bot} adapterAuthor="assistant" onError={console.error} />
```

The reply appears as a message by `adapterAuthor` (default `'assistant'`).
Streamed text is buffered and painted once per animation frame outside
React state, so a fast stream costs no React commits; the message list
changes once per response, when the reply is complete (reason
`'response'`). While a reply streams, a Stop button replaces Send; it, and
`api.stop()`, abort the signal, keep the text received so far (a reply
stopped before its first chunk is removed) and call `onStop({ message })`.
A thrown error keeps the partial text with `status: 'error'` and calls
`onError`. Sending again, and unmounting, abort a pending reply.

## Typing

`onTypingChange({ typing })` reports the current user typing in the
composer: one `true` when typing starts and one `false` after
`typingTimeout` ms without input (default 3000), on send or on blur, never
one event per keystroke. Forward it to your server.

`typingUsers` lists the ids of the others typing right now. The
indicator below the feed reads "Bob is typing", "Bob and Cy are typing" or
"Bob and 2 others are typing" and is announced once per change;
`renderTyping({ users })` replaces its content.

## Timestamps and date separators

Each message with a `createdAt` shows its time (`timestamps`, default
`true`) in a `<time dateTime>` element. `formatTimestamp` takes
`Intl.DateTimeFormatOptions` (default hour and minute) or a function
`(date, { locale, timeZone }) => string`; `locale` defaults to `'en-US'`.

```tsx
<Conversation
  currentUser="me"
  locale="de-DE"
  timeZone="Europe/Berlin"
  formatTimestamp={{ weekday: 'short', hour: '2-digit', minute: '2-digit' }}
/>
```

Pattern strings such as `'dd/MM/yyyy hh:mm a'` are not supported:
they ignore the reader's locale. Use the options object
(`{ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit',
minute: '2-digit' }`), or the function form when an exact pattern is
required.

Server rendering needs a known time zone. Pass `timeZone` (for example the
user's saved zone, or `'UTC'`) and the server and client render the same
text. Without `timeZone` the server renders UTC and the client switches to
the browser's zone after hydration, so the text can change once, without a
hydration warning.

`dateSeparators` adds a day label before the first message of each day in
that time zone; `renderDateSeparator({ date, label })` replaces
it.

## Layout, empty state and templates

`layout="compact"` puts every message at the inline start, as in a team
chat log; the default
`'bubbles'` aligns your own messages to the inline end. `renderEmpty()`
renders when there are no messages.

`renderItem({ message, index, defaultItem })` renders the content of each
item. Return `defaultItem` wrapped or decorated, or compose
`Conversation.Item`, which renders the default avatar, author, time and
bubble and replaces the text with its children:

```tsx
<Conversation
  currentUser="me"
  renderItem={({ message, defaultItem }) =>
    message.author === 'system' ? (
      <Conversation.Item message={message}>
        <em>{message.text}</em>
      </Conversation.Item>
    ) : (
      defaultItem
    )
  }
/>
```

The custom content keeps the item's avatar, name, time, actions and the
feed article's accessible name, so prefer decorating `defaultItem` or
composing `Conversation.Item` over rendering unrelated markup. The demo
below (an assistant, but `renderItem` works the same in both variants)
puts a "Shared with" line under prompts that mention someone and gives
the first item richer children through `Conversation.Item`.

<!-- demo: conversation-mentions -->

## Header

`Conversation.Header` takes a `title`, an `icon` and toolbar buttons as
children. The buttons form an APG Toolbar with one tab stop:
Left and Right (mirrored in RTL), Home and End move between them. The
toolbar is labelled by the title, or by `toolbarLabel`.

```tsx
<Conversation.Header title="Bob Stone" icon={<Avatar />}>
  <button type="button" onClick={call}>Call</button>
  <button type="button" onClick={showInfo}>Info</button>
</Conversation.Header>
```

Parts can be written in any order: `Conversation.Header` always renders
above the feed, the composer, suggestions and footer below it.

## Events

| Event | Fires when |
| --- | --- |
| `onMessagesChange(messages, { reason })` | The component proposes a new list (see [Messages](#messages)) |
| `onBeforeSend({ message })` | Before a send; `preventDefault()` cancels it and keeps the draft |
| `onSend({ message })` | A message was sent |
| `onError(error)` | The adapter threw, or the `onLoadOlder` Promise rejected |
| `onStop({ message })` | A pending reply was aborted (Stop, `api.stop()`, a new send, unmount) |
| `onTypingChange({ typing })` | The current user starts or stops typing |
| `onRetry({ message })` | The Retry button of an own message with `status: 'error'` was clicked |
| `onItemActionClick({ action, message })` | An item action was clicked; `preventDefault()` cancels a built-in one |
| `onAttachmentClick({ attachment, message })` | An attachment chip was activated |
| `onLoadOlder()` | The top of the history is within one viewport while `hasOlder` |

`Conversation.Composer` adds `onValueChange`, the mention events
(`onBeforeMentionSelect`, `onMentionSelect`) and the attachment events
(`onBeforeAttach`, `onAttach`, `onAttachmentRemove`, `onAttachmentError`),
described on [actions and attachments](/docs/chat/conversation-messages).

## Keyboard and accessibility

The feed is an APG [Feed](https://www.w3.org/WAI/ARIA/apg/patterns/feed/):

| Key | Where | Action |
| --- | --- | --- |
| Tab / Shift+Tab | anywhere | The feed is one tab stop (the latest message, or the last one focused); then its message controls, then the composer |
| Page Down / Page Up | a message | Next / previous message, scrolled into view even when it is not mounted |
| Ctrl+End / Ctrl+Home | the feed | Leave the feed to the next / previous focusable element |
| Left / Right, Home / End | header or item actions toolbar | Move between the toolbar buttons |
| Enter | composer | Send (not during IME composition) |
| Shift+Enter | composer | New line |
| Escape | composer | Cancel the reply |

- The feed has `role="feed"`; each message is a `role="article"` with
  `aria-posinset`, `aria-setsize` (`-1` while older history can still
  load) and `aria-labelledby` pointing at its author and time.
- A polite live region announces each incoming message once, and a bot
  reply once it is complete; the typing indicator is announced once per
  change. Your own messages are not announced.
- A streaming reply carries `aria-busy="true"` until it is complete, so
  screen readers skip the half-written text; the feed is `aria-busy` while
  older messages load.
- The composer is a labelled `<textarea aria-multiline="true">`; send,
  stop, attach and item action buttons have accessible names; the delivery
  status has screen-reader text.
- Item actions show on hover and on focus within the message, never hover
  only.

Every label is in `localeText` (see `CONVERSATION_DEFAULT_LOCALE_TEXT` for
the keys and English defaults).

## Server rendering

`Conversation` renders on the server (Next.js App Router, Vite SSR) and
hydrates without warnings:

- The server HTML holds the latest `initialItemCount` messages (default
  30), the composer, the suggestions and an empty live region. The
  scroller is bottom-anchored in CSS, so the latest message shows before
  any script runs.
- Pass `timeZone` (see [Timestamps](#timestamps-and-date-separators)) so
  timestamps and date separators read the same on the server and the
  client.
- Render output depends only on props: message ids and `createdAt` are
  generated when a message is sent, in the event handler, never during
  render. Give your own records stable ids and dates from your data, not
  `crypto.randomUUID()` or `new Date()` in the component body.
- The typing timer, streaming, the jump button, measurement and the
  Mention popup are client-only; the Mention component loads after
  hydration and only when `mentions` is set.

## RTL

The conversation follows the inherited `dir`: wrap it in
`dir="rtl"` and own messages, bubble tails, the send icon and the jump
button mirror through CSS logical properties, and the toolbar arrow keys
mirror. Message text renders with `dir="auto"`, so a Hebrew message in an
English chat reads correctly.

## Security

Message text is never rendered as HTML: it is inserted as text nodes, and
mention tokens are spans around matched names, so a message containing
`<img onerror>` shows those characters. Attachment URLs are only rendered as
links when they are `http:`, `https:`, `blob:`, `mailto:` or relative; a
`javascript:` or `data:` URL that could run script is never a link (handle
such files with `onAttachmentClick`).

## Persistence, direction and lifecycle

The component has no persistence, direction or sizing props:
built-in persistence would write storage behind your back and break SSR
consistency, and direction and size are already `dir`, `className` and
`style`. Save the `onMessagesChange` output (and the composer's
`onValueChange` draft) yourself, set `dir="rtl"` on an ancestor, and size
the component with `className` or `style`.

The `ref` receives a `ConversationApi` (`scrollToBottom`, `scrollToMessage`,
`focus`, `send`, `stop`, `regenerate` for the assistant variant, and
`element`); `api.send(text)` sends as the current user, through
`onBeforeSend` and the adapter, like the composer. There are no lifecycle
events: React components already have a lifecycle. Put setup
code in a `ref` callback, which runs on mount, or a `useEffect`, and
teardown code in the cleanup either one returns. See
the [API reference](/docs/reference/chat/conversation) for every member.

## Agent-streamed surfaces (not included)

Agent-streamed interfaces over the A2UI protocol are not included.
The design below is a sketch only and **is not
available**:

- `<A2uiSurface messages={asyncIterable}>` renders streamed surfaces
  (create, update components, update the data model, delete) with Salmon
  components, keeping data model updates by JSON Pointer in a store rather
  than React state.
- A Salmon catalog maps protocol components to Salmon components, with
  custom entries through `catalog`.
- `onAction(action)` and an outgoing `AsyncIterable` or callback transport
  send user actions back to the agent.
- A `Conversation` tool part maps to `A2uiSurface` through `renderTool`.

Today, `renderTool` can already render your own React component for a tool
result, which covers generated UI from a fixed set of components.
