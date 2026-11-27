---
title: Conversation history and scrolling
description: Virtualized long histories, older messages loaded on demand with a stable scroll position, auto-scroll modes, the jump-to-latest button with an unread count, and the ConversationApi for scrolling and focus.
category: Components
order: 30
demos: [conversation-history]
---

A conversation can hold thousands of messages. This page covers how the
feed stays fast and where it scrolls; the basics are on the
[Conversation](/docs/chat/conversation) page.

<!-- demo: conversation-history -->

## Virtualization

The feed always virtualizes: it mounts the messages near the viewport plus
a few on each side, measures each one after it mounts (messages have
different heights) and stands in for the rest with spacers. Nothing needs
to be configured; two props tune the first render:

- `estimatedItemHeight` (default 64): the height in px assumed for a
  message that has not been measured yet. Set it close to your typical
  message to keep the scrollbar steady.
- `initialItemCount` (default 30): how many of the latest messages render
  on the server and before the first measurement.

The scroller is bottom-anchored in CSS, so the server HTML already shows
the latest message with no scroll jump at hydration. Scroll position,
measured heights, the at-bottom flag and the unread count live outside
React state.

## Loading older messages

Set `hasOlder` while older history exists and handle `onLoadOlder`.
It runs when the top of the history comes within
one viewport; return a Promise and prepend the older messages to
`messages` before it resolves:

```tsx
const [messages, setMessages] = useState(latestPage);
const [cursor, setCursor] = useState<string | null>(firstCursor);

<Conversation
  currentUser="me"
  messages={messages}
  onMessagesChange={setMessages}
  hasOlder={cursor !== null}
  onLoadOlder={async () => {
    const page = await fetchOlder(cursor);
    setMessages((list) => [...page.messages, ...list]);
    setCursor(page.nextCursor);
  }}
/>
```

- The message under the reader's eyes stays in place while the older ones
  are inserted above it.
- While the Promise is pending, a loading placeholder shows above the
  history, the feed is `aria-busy="true"`, and `onLoadOlder` is not called
  again. A rejected Promise calls `onError`. A handler that returns nothing
  gets no loading state and can run again on the next scroll frame.
- While `hasOlder` is true, every article has `aria-setsize="-1"` (the
  total is unknown); afterwards it is the number of messages.

## Auto-scroll and the jump button

`autoScroll` decides what happens when messages are appended:

| Value | Behavior |
| --- | --- |
| `'whenAtBottom'` (default) | Follow new messages while the reader is at the bottom; stay put when they scrolled up. Your own sent messages still scroll to the bottom |
| `'always'` | Scroll to every new message |
| `'never'` | Never scroll on new messages, your own included |

When the reader is away from the bottom, a jump-to-latest button shows
with the number of messages that arrived since (the unread count, part of
its accessible name). It scrolls to the bottom and resets the count; so
does scrolling back down. `jumpButton={false}` hides the built-in button;
place `Conversation.JumpButton` yourself to change its content or styling:

```tsx
<Conversation currentUser="me" jumpButton={false}>
  <Conversation.JumpButton className="my-jump">Latest</Conversation.JumpButton>
  <Conversation.Composer />
</Conversation>
```

## ConversationApi

The `ref` of `Conversation` receives a `ConversationApi`:

| Member | Description |
| --- | --- |
| `scrollToBottom({ behavior })` | Scrolls to the latest message and resets the unread count |
| `scrollToMessage(id, { focus })` | Scrolls a message into view, also one that is not mounted or not measured yet, optionally focusing it; returns `false` for an unknown id |
| `focus()` | Focuses the composer input |
| `send(text)` | Sends `text` as the current user, through `onBeforeSend` and the adapter |
| `stop()` | Aborts a pending bot reply (`onStop` fires) |
| `regenerate(id)` | Assistant variant: runs the adapter again for response `id`, keeping the previous text as an alternative ([AI assistant](/docs/chat/conversation-assistant)) |
| `element` | The root `<div>` |

```tsx
const api = useRef<ConversationApi>(null);

<>
  <Conversation ref={api} currentUser="me" messages={messages} />
  <button type="button" onClick={() => api.current?.scrollToMessage(searchHit.id, { focus: true })}>
    Show result
  </button>
</>
```

`scrollToMessage` needs the message to be in `messages`: to jump to a
message in older, unloaded history, load the history up to it first. Every
member is typed in the [API reference](/docs/reference/chat/conversation).

## Performance

- Only changed items re-render: the store diffs `messages` by `id`, so
  appending a message renders one item, and replacing one record renders
  that item only. Keep unchanged records referentially equal (spread the
  old array, do not rebuild every record).
- Streaming bot replies are painted once per animation frame outside React
  state and cost no React commits until the reply is complete.
- Typing in the composer re-renders no message: the draft lives in the
  native `<textarea>` unless you control it with `value`.
- Scrolling updates the mounted window from the store, never from React
  state; a 2,000-message history mounts a few dozen items.
