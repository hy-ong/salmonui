'use client';

import { useRef, useState } from 'react';
import {
  Conversation,
  type ConversationActionItem,
  type ConversationAttachmentOptions,
  type ConversationMentionConfig,
  type ConversationMessage,
  type ConversationUser,
} from '@salmonui/chat/conversation';
import { EventLog, useEventLog } from '../../components/demo-kit';

const users: readonly ConversationUser[] = [
  { id: 'me', name: 'Ada Lovelace' },
  { id: 'bob', name: 'Bob Stone' },
  { id: 'chen', name: 'Chen Wei' },
  { id: 'mira', name: 'Mira Kovač' },
];

const mentions: readonly ConversationMentionConfig[] = [{ trigger: '@', items: users.filter((u) => u.id !== 'me') }];

// Built-in actions plus one custom action.
const actions: readonly ConversationActionItem[] = ['reply', 'copy', 'pin', { id: 'forward', label: 'Forward' }, 'delete'];

// Fixed dates, so the server and the client render the same timestamps.
const initialMessages: readonly ConversationMessage[] = [
  { id: 'r0', author: 'mira', text: 'Release checklist for 2.4 is in the wiki.', createdAt: '2026-04-14T08:30:00Z', replyPreview: { author: 'Chen Wei', text: 'Where do we track the release steps?' }, replyTo: 'archived-1' },
  { id: 'r1', author: 'bob', text: 'Standup moved to 10:15 today. Please keep this pinned.', createdAt: '2026-04-14T08:45:00Z', pinned: true },
  { id: 'r2', author: 'chen', text: '@Ada Lovelace can you review the invoice export before lunch?', createdAt: '2026-04-14T09:02:00Z', mentions: ['me'], attachments: [{ id: 'f1', name: 'invoice-export.pdf', size: 48_213, type: 'application/pdf' }] },
  { id: 'r3', author: 'me', text: 'Sure, looking now.', createdAt: '2026-04-14T09:05:00Z', replyTo: 'r2', status: 'read' },
  { id: 'r4', author: 'mira', text: 'From the design channel: the new icons are ready.', createdAt: '2026-04-14T09:20:00Z', forwarded: true },
  { id: 'r5', author: 'me', text: 'Uploaded the screenshots to the ticket.', createdAt: '2026-04-14T09:24:00Z', status: 'delivered' },
  { id: 'r6', author: 'me', text: 'This one failed to send - press Retry.', createdAt: '2026-04-14T09:25:00Z', status: 'error' },
];

/** A fake upload transport: reports progress for about a second and keeps the file as a blob: URL. */
const fakeUpload: ConversationAttachmentOptions['upload'] = (file, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    let step = 0;
    const timer = setInterval(() => {
      step++;
      onProgress(step, 5);
      if (step === 5) {
        clearInterval(timer);
        resolve({ url: URL.createObjectURL(file) });
      }
    }, 200);
    signal.addEventListener('abort', () => (clearInterval(timer), reject(signal.reason)), { once: true });
  });

const attachmentOptions: ConversationAttachmentOptions = { accept: 'image/*,.pdf,.txt', maxSize: 5 * 1024 * 1024, maxCount: 3, upload: fakeUpload };

export default function ConversationActionsDemo() {
  const [messages, setMessages] = useState<readonly ConversationMessage[]>(initialMessages);
  const forwarded = useRef(0);
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <Conversation
        style={{ blockSize: 460 }}
        currentUser="me"
        users={users}
        messages={messages}
        onMessagesChange={(next, event) => {
          push(`messages (${event.reason}): ${next.length}`);
          setMessages(next);
        }}
        timeZone="UTC"
        itemActions={actions}
        onItemActionClick={(event) => {
          push(`action: ${event.action} on ${event.message.id}`);
          if (event.action === 'delete' && event.message.pinned) {
            event.preventDefault();
            push('delete prevented: unpin the message first');
          }
          if (event.action === 'forward') {
            const copy: ConversationMessage = { id: `fwd-${++forwarded.current}`, author: 'me', text: event.message.text, createdAt: new Date(), forwarded: true, status: 'sent' };
            setMessages((prev) => [...prev, copy]);
          }
        }}
        onRetry={(event) => {
          push(`retry: ${event.message.id}`);
          const id = event.message.id;
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'sending' } : m)));
          setTimeout(() => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'sent' } : m))), 800);
        }}
        onAttachmentClick={(event) => {
          push(`attachment: ${event.attachment.name}`);
          if (event.attachment.url) window.open(event.attachment.url, '_blank', 'noopener');
        }}
      >
        <Conversation.Header title="#release-2-4" />
        <Conversation.Suggestions heading="Quick replies" items={['On it', 'Thanks!', 'Can we sync at 11?']} />
        <Conversation.Composer
          placeholder="Message #release-2-4 (type @ to mention)"
          mentions={mentions}
          onBeforeMentionSelect={(event) => push(`before mention: ${event.user.name}`)}
          onMentionSelect={(event) => push(`mention: ${event.trigger}${event.user.id}`)}
          attachments={attachmentOptions}
          onAttach={(event) => push(`attach: ${event.attachments.map((a) => a.name).join(', ')}`)}
          onAttachmentRemove={(event) => push(`remove: ${event.attachment.name}`)}
          onAttachmentError={(error) => push(`attachment error (${error.reason}): ${error.file.name}`)}
        />
      </Conversation>
      <EventLog entries={log} />
    </div>
  );
}
