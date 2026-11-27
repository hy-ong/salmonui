---
title: Conversation actions and attachments
description: Message actions (copy, reply, pin, delete and custom items), replies with quoted previews, the pinned bar, forwarded labels, delivery status with retry, quick replies, @ mentions and attachments through an upload transport.
category: Components
order: 20
demos: [conversation-actions]
---

This page covers what a message can carry and what people can do with it.
The basics (messages, users, sending, bots) are on the
[Conversation](/docs/chat/conversation) page.

<!-- demo: conversation-actions -->

## Item actions

Every message has an actions toolbar that shows on hover and when focus is
inside the message. `itemActions` lists its items, by default
`['copy', 'reply', 'pin', 'delete']` (the
[assistant variant](/docs/chat/conversation-assistant) has its own
defaults); `false` hides the toolbar. Mix the built-in actions with custom
ones:

```tsx
<Conversation
  currentUser="me"
  itemActions={['reply', 'copy', { id: 'forward', label: 'Forward', icon: <ForwardIcon /> }, 'delete']}
  onItemActionClick={(e) => {
    if (e.action === 'delete' && !confirm('Delete this message?')) e.preventDefault();
    if (e.action === 'forward') openForwardDialog(e.message);
  }}
/>
```

`onItemActionClick({ action, message })` runs for every click; for a
built-in action, `event.preventDefault()` cancels what it does:

| Action | Built-in behavior |
| --- | --- |
| `'copy'` | Writes the message text to the clipboard |
| `'reply'` | Starts a reply to the message and focuses the composer |
| `'pin'` | Toggles `pinned` (`onMessagesChange` reason `'pin'`) |
| `'delete'` | Removes the message (`onMessagesChange` reason `'delete'`) |

The toolbar is an APG Toolbar with one tab stop: Left and Right (mirrored
in RTL), Home and End move between its buttons. Each button has the
action's label as its accessible name. In `renderItem`,
`Conversation.ItemActions` renders the toolbar of one message with its own
`items`.

## Replies

`replyTo` is the id of the message being answered. The item shows
a quoted preview (author and text) of that message; activating the preview
scrolls to it and focuses it. When the target is not loaded, for example
in older history, set `replyPreview: { author, text }` on the reply and the
preview shows that text, without the jump.

The `'reply'` action shows "Replying to ..." with the quoted text above the
composer; the next message sent carries `replyTo`. Escape in the composer,
or the close button, cancels the reply.

## Pins and forwarded messages

`pinned: true` marks a message and shows the latest pinned message in a bar
above the feed. The bar is a button that scrolls to the message
and focuses it. The `'pin'` action toggles `pinned`.

`forwarded: true` adds a "Forwarded" label above the bubble.

## Delivery status and retry

`status` on your own messages shows an icon with screen-reader text:
`'sending'`, `'sent'`, `'delivered'`, `'read'` or `'error'`.
Messages from others never show a status. With an `onRetry` handler, a
message with `status: 'error'` gets a Retry button:

```tsx
<Conversation
  currentUser="me"
  messages={messages}
  onMessagesChange={setMessages}
  onRetry={({ message }) => {
    setMessages((list) => list.map((m) => (m.id === message.id ? { ...m, status: 'sending' } : m)));
    resend(message);
  }}
/>
```

The component sets `status` only on bot replies (`'sending'` while
pending, `'error'` when the adapter fails); for your own messages, your
transport owns it.

## Quick replies

`Conversation.Suggestions` renders a group of buttons below the feed;
clicking one sends its text as if typed, through `onBeforeSend`
and the adapter. `heading` labels the group; `renderItem({ item, index })`
renders a button's content.

```tsx
<Conversation.Suggestions heading="Quick replies" items={['Yes', 'No', 'Talk to a person']} />
```

Render it only while the suggestions apply, for example after the last bot
message.

## Mentions

`Conversation.Composer` `mentions` adds mention triggers to the composer,
through the Dropdowns [Mention](/docs/dropdowns/mention):

```tsx
<Conversation.Composer
  mentions={[{ trigger: '@', items: [{ id: 'bob', name: 'Bob Stone' }] }]}
  onBeforeMentionSelect={(e) => e.user.id === 'blocked' && e.preventDefault()}
  onMentionSelect={(e) => console.log(e.trigger, e.user.id)}
/>
```

Typing the trigger opens a suggestion list at the caret; the selected
person is inserted as plain text (`@Bob Stone `), and the sent message
lists their id in `message.mentions` (only while the inserted name is still
in the text). When a message has `mentions`, each mentioned user's name
after a trigger (`@Name`, `#Name` or any configured `trigger`: a single
character that is not a letter, a digit or a space) renders as a
`.salmon-conversation-mention` token. `onBeforeMentionSelect` can cancel an
insertion with `preventDefault()`; `onMentionSelect` reports it. Each
config can use its own `trigger` (default `'@'`).

The Mention component is loaded lazily on the client, only when `mentions`
is set, so it adds nothing to the server HTML or to conversations without
mentions. Its popup styles are included in
`@salmonui/chat/conversation/styles.css`.

## Attachments

`attachments` on the composer enables an attach button and drag and drop.
`true` uses the defaults; an options object sets:

| Option | Meaning |
| --- | --- |
| `accept` | The file input's `accept` (`'image/*,.pdf'`); other files are rejected |
| `maxSize` | Largest accepted file in bytes |
| `maxCount` | Most files per message |
| `dropTarget` | `'composer'` (default), `'conversation'` (the whole component) or `'none'` |
| `upload` | Stores each file before sending (see below) |
| `renderPreview({ attachment, progress, error, remove })` | The chip of a pending attachment in the composer |

The chip of a *sent* attachment is replaced with the `renderAttachment({
attachment, message, tabIndex })` prop of `Conversation`; put `tabIndex` on
interactive content so it follows the item's roving tab stop.

```tsx
<Conversation.Composer
  attachments={{ accept: 'image/*,.pdf', maxSize: 10 * 1024 * 1024, maxCount: 5, upload }}
  onBeforeAttach={(e) => e.files.length > 10 && e.preventDefault()}
  onAttach={(e) => console.log(e.attachments)}
  onAttachmentRemove={(e) => console.log('removed', e.attachment.name)}
  onAttachmentError={(e) => toast(`${e.file.name}: ${e.reason}`)}
/>
```

- `onBeforeAttach({ files })` runs for each pick or drop and can cancel it.
- `onAttach({ attachments })` reports the accepted files.
- `onAttachmentError({ file, reason, error })` reports a rejected file
  (`'type'`, `'size'`, `'count'`) or a failed upload (`'upload'`).
- `onAttachmentRemove({ attachment, message })` reports a pending file
  removed from the composer (`message` is `null`); removing it aborts its
  upload.

Pending files show as chips with their name, size and upload progress;
activating a chip calls `onAttachmentClick` with `message: null`. Send does
nothing while an upload is still running; failed uploads are not sent. The
sent message carries `message.attachments` (`id`, `name`, `size`, `type`,
and `url` from the transport or the picked `file`), and the adapter receives
them in its request.

In the feed, an attachment with a safe `url` (`http:`, `https:`, `blob:`,
`mailto:` or relative) is a link that opens in a new tab. With
`onAttachmentClick({ attachment, message })` on the `Conversation`, every
attachment is a button that calls it instead, for example to open a
preview dialog or fetch a signed URL.

### Upload transport

There is no upload URL property: Salmon does not prescribe a
backend protocol. `upload(file, { signal, onProgress })` stores one file
and returns the stored reference, merged into the attachment (the `File`
is dropped once the upload succeeds):

```ts
const upload: ConversationUploadTransport = async (file, { signal, onProgress }) => {
  const body = new FormData();
  body.append('file', file);
  // fetch has no upload progress; use XMLHttpRequest when you need it.
  onProgress(0, file.size);
  const response = await fetch('/api/upload', { method: 'POST', body, signal });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  onProgress(file.size, file.size);
  const { id, url } = await response.json();
  return { id, url };
};
```

`signal` aborts when the chip is removed or the conversation unmounts; a
thrown error marks the chip failed and calls `onAttachmentError` with
`reason: 'upload'`. Delete a stored file in your `onAttachmentRemove`
handler; the storage path and format are whatever the transport sends and
returns. Without `upload`, attachments carry the picked `File` and you upload them
in `onSend` or in the adapter.
