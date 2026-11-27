'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Conversation, type ConversationAdapter, type ConversationApi, type ConversationMessage, type ConversationUser } from '@salmonui/chat/conversation';
import { EventLog, useEventLog } from '../../components/demo-kit';

const users: readonly ConversationUser[] = [
  { id: 'me', name: 'Ada Lovelace' },
  { id: 'assistant', name: 'Salmon Support' },
];

// Module constants with fixed dates: the server and the client render the same markup.
const initialMessages: readonly ConversationMessage[] = [
  { id: 'w1', author: 'assistant', text: 'Hi Ada! I am the Salmon Support bot. Ask me about shipping, returns or your invoice.', createdAt: '2026-03-02T09:58:00Z' },
  { id: 'w2', author: 'me', text: 'Hello, my order #2041 has not arrived yet.', createdAt: '2026-03-03T10:02:00Z', status: 'read' },
  { id: 'w3', author: 'assistant', text: 'Sorry about that. Order #2041 left the warehouse yesterday and should arrive within two working days.', createdAt: '2026-03-03T10:02:30Z' },
];

function replyFor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('return')) return 'You can return any item within 30 days. Open Orders, pick the item and choose "Return". A prepaid label is emailed to you right away.';
  if (t.includes('invoice')) return 'Invoices are under Account > Billing. Each order has a PDF download, and a copy goes to your billing address by email.';
  if (t.includes('ship') || t.includes('track')) return 'Standard shipping takes two to four working days. The tracking link is in your confirmation email and on the order page.';
  return `Thanks for your message. This demo answers locally, word by word, so you can watch the response stream in and press Stop to cut it short. You wrote: "${text}".`;
}

/** Resolves after `ms`, or right away when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

// A fake bot: an async generator that "types" for a moment, then yields one
// word at a time (no network, no API key).
function createSupportBot(setTyping: (ids: readonly string[]) => void): ConversationAdapter {
  return async function* (request, { signal }) {
    setTyping(['assistant']);
    await wait(700, signal);
    setTyping([]);
    for (const word of replyFor(request.text).split(/(?<= )/u)) {
      if (signal.aborted) return;
      await wait(60, signal);
      yield word;
    }
  };
}

export default function ConversationBasicDemo() {
  const api = useRef<ConversationApi | null>(null);
  const [compact, setCompact] = useState(false);
  const [separators, setSeparators] = useState(true);
  const [typing, setTyping] = useState<readonly string[]>([]);
  const [supportBot] = useState(() => createSupportBot(setTyping));
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <Conversation
        ref={api}
        style={{ blockSize: 420 }}
        currentUser="me"
        users={users}
        defaultMessages={initialMessages}
        onMessagesChange={(next, event) => push(`messages (${event.reason}): ${next.length}`)}
        adapter={supportBot}
        onBeforeSend={(event) => {
          if (event.message.text.trim().toLowerCase() === 'spam') {
            event.preventDefault();
            push('send prevented: the draft stays in the composer');
          }
        }}
        onSend={(event) => push(`send: ${JSON.stringify(event.message.text)}`)}
        onTypingChange={(event) => push(`typing: ${event.typing}`)}
        typingUsers={typing}
        timeZone="UTC"
        dateSeparators={separators}
        layout={compact ? 'compact' : 'bubbles'}
        renderEmpty={() => 'No messages yet. Say hello!'}
      >
        <Conversation.Header title="Salmon Support">
          <Button variant="outline" aria-pressed={compact} onClick={() => setCompact((v) => !v)}>
            Compact
          </Button>
          <Button variant="outline" aria-pressed={separators} onClick={() => setSeparators((v) => !v)}>
            Date separators
          </Button>
          <Button variant="outline" onClick={() => api.current?.stop()}>
            Stop reply
          </Button>
        </Conversation.Header>
        <Conversation.Suggestions heading="Quick replies" items={['How do I return an item?', 'Where is my invoice?', 'Track my shipment']} />
        <Conversation.Composer placeholder="Ask Salmon Support (Enter sends, Shift+Enter adds a line)" />
        <Conversation.Footer>
          <small>Replies are generated in your browser by a fake bot. Type &quot;spam&quot; to see onBeforeSend keep the draft.</small>
        </Conversation.Footer>
      </Conversation>
      <EventLog entries={log} />
    </div>
  );
}
