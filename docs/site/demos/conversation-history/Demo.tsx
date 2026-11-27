'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Conversation, type ConversationApi, type ConversationMessage, type ConversationUser } from '@salmonui/chat/conversation';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

const users: readonly ConversationUser[] = [
  { id: 'me', name: 'Ada Lovelace' },
  { id: 'bob', name: 'Bob Stone' },
  { id: 'chen', name: 'Chen Wei' },
];

const AUTHORS = ['me', 'bob', 'chen'] as const;
const START = Date.UTC(2026, 0, 5, 8, 0);
const ARCHIVE = 600; // older messages that load on demand
const LOADED = 2_000; // messages in the first render
const PAGE = 100;

/** Message `k` of the whole history (0 = oldest), built deterministically: no Date.now(), no Math.random(). */
function message(k: number): ConversationMessage {
  const author = AUTHORS[k % 3] as string;
  return {
    id: `h${k}`,
    author,
    text: k % 11 === 0 ? `Message ${k + 1}\nA longer one: virtualization measures\nevery item after it mounts.` : `Message ${k + 1}`,
    createdAt: new Date(START + k * 7 * 60_000).toISOString(),
    ...(author === 'me' ? { status: 'read' as const } : null),
  };
}

const range = (from: number, to: number): ConversationMessage[] => Array.from({ length: to - from }, (_, i) => message(from + i));
const initialMessages: readonly ConversationMessage[] = range(ARCHIVE, ARCHIVE + LOADED);

type AutoScroll = 'whenAtBottom' | 'always' | 'never';
const AUTO_SCROLL: readonly AutoScroll[] = ['whenAtBottom', 'always', 'never'];

export default function ConversationHistoryDemo() {
  const api = useRef<ConversationApi | null>(null);
  const [messages, setMessages] = useState<readonly ConversationMessage[]>(initialMessages);
  const [oldest, setOldest] = useState(ARCHIVE);
  const [autoScroll, setAutoScroll] = useState<AutoScroll>('whenAtBottom');
  const incoming = useRef(0);
  const [log, push] = useEventLog();

  const loadOlder = () =>
    new Promise<void>((resolve) => {
      push(`onLoadOlder: ${Math.min(PAGE, oldest)} messages in 600 ms`);
      setTimeout(() => {
        const from = Math.max(0, oldest - PAGE);
        setMessages((prev) => [...range(from, oldest), ...prev]);
        setOldest(from);
        resolve();
      }, 600);
    });

  const receive = () => {
    const n = ++incoming.current;
    const k = ARCHIVE + LOADED + n - 1;
    setMessages((prev) => [...prev, { id: `in${n}`, author: n % 2 ? 'bob' : 'chen', text: `Incoming message ${n}`, createdAt: new Date(START + k * 7 * 60_000).toISOString() }]);
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Button onClick={receive}>
          Receive a message
        </Button>
        <Button variant="outline" onClick={() => push(`scrollToMessage(h1000): ${api.current?.scrollToMessage('h1000', { focus: true }) ?? false}`)}>
          Go to message 1,001
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToBottom({ behavior: 'smooth' })}>
          Scroll to bottom
        </Button>
        <Button variant="outline" onClick={() => api.current?.focus()}>
          Focus composer
        </Button>
        <label>
          autoScroll{' '}
          <Select aria-label="autoScroll" data={AUTO_SCROLL} value={autoScroll} onValueChange={(value) => value != null && setAutoScroll(value as AutoScroll)} />
        </label>
      </div>
      <Conversation
        ref={api}
        style={{ blockSize: 420 }}
        currentUser="me"
        users={users}
        messages={messages}
        onMessagesChange={(next, event) => {
          push(`messages (${event.reason}): ${next.length}`);
          setMessages(next);
        }}
        hasOlder={oldest > 0}
        onLoadOlder={loadOlder}
        autoScroll={autoScroll}
        estimatedItemHeight={64}
        initialItemCount={30}
        timeZone="UTC"
        dateSeparators
        itemActions={false}
      >
        <Conversation.Header title={`History (${messages.length.toLocaleString('en-US')} messages loaded)`} />
        <Conversation.Composer placeholder="Write a message" />
      </Conversation>
      <EventLog entries={log} />
    </div>
  );
}
