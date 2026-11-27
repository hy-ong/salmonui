'use client';

import { useRef, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Conversation, type ConversationAdapter, type ConversationApi, type ConversationMessage, type ConversationResponsePart, type ConversationUser } from '@salmonui/chat/conversation';
import { EventLog, useEventLog } from '../../components/demo-kit';

const users: readonly ConversationUser[] = [
  { id: 'user', name: 'You' },
  { id: 'assistant', name: 'Salmon Assistant' },
];

// Module constants with fixed dates: the server and the client render the same markup.
const initialMessages: readonly ConversationMessage[] = [
  { id: 'q1', author: 'user', text: 'What should I pack for Oslo this weekend?', createdAt: '2026-03-03T10:00:00Z' },
  {
    id: 'a1',
    author: 'assistant',
    text: 'Pack a **warm coat**, a hat and waterproof boots: it stays around 3 °C with light rain.',
    createdAt: '2026-03-03T10:00:04Z',
    parts: [
      { type: 'reasoning', delta: 'The user travels to Oslo. Check the forecast, then suggest clothing.' },
      { type: 'tool', id: 'f1', name: 'forecast', input: { city: 'Oslo', days: 2 }, output: { celsius: 3, rain: true }, status: 'done' },
    ],
    alternatives: ['Bring layers and a rain jacket; Oslo is cold this weekend.'],
  },
];

/** Resolves after `ms`, or right away when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

function answerFor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('summar')) return 'This page shows the **assistant variant** of Conversation: a fake adapter streams reasoning, a tool call and a Markdown answer, and every response can be regenerated, rated and copied.';
  if (t.includes('poem')) return 'Salmon swim **upstream**,\nagainst the cold and the stones;\nthe river remembers.';
  return `This answer comes from a local async generator, word by word, so you can watch it stream and press **Stop**. You asked: "${text}".`;
}

// A fake assistant (no provider, no network, no API key): reasoning deltas, a
// tool call that runs and completes, then the answer one word at a time.
const assistant: ConversationAdapter = async function* (request, { signal }) {
  await wait(500, signal);
  for (const delta of ['Reading the question. ', 'Looking up what I know. ', 'Writing a short answer.']) {
    if (signal.aborted) return;
    await wait(150, signal);
    yield { type: 'reasoning', delta } satisfies ConversationResponsePart;
  }
  yield { type: 'tool', id: 'lookup', name: 'search', input: { query: request.text }, status: 'running' } satisfies ConversationResponsePart;
  await wait(400, signal);
  yield { type: 'tool', id: 'lookup', name: 'search', input: { query: request.text }, output: { results: 3 }, status: 'done' } satisfies ConversationResponsePart;
  for (const word of answerFor(request.text).split(/(?<= )/u)) {
    if (signal.aborted) return;
    await wait(50, signal);
    yield word;
  }
};

/**
 * A tiny application renderer for `renderContent`: **bold** and line breaks
 * as React nodes. Real apps plug in their Markdown library here; Salmon UI
 * never renders model output as an HTML string.
 */
function renderMarkdown(text: string): ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*)/u).map((segment, i) => (segment.length > 4 && segment.startsWith('**') && segment.endsWith('**') ? <strong key={i}>{segment.slice(2, -2)}</strong> : segment));
}

export default function ConversationAssistantDemo() {
  const api = useRef<ConversationApi | null>(null);
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
      <Conversation
        ref={api}
        variant="assistant"
        style={{ blockSize: 520 }}
        users={users}
        defaultMessages={initialMessages}
        adapter={assistant}
        timeZone="UTC"
        renderContent={(text) => renderMarkdown(text)}
        renderEmpty={() => 'Ask me anything to start.'}
        onMessagesChange={(next, event) => push(`messages (${event.reason}): ${next.length}`)}
        onSend={(event) => push(`send: ${JSON.stringify(event.message.text)}`)}
        onStop={() => push('stop')}
        onItemActionClick={(event) => push(`action: ${event.action}${event.feedback ? ` (${event.feedback})` : ''}`)}
        onReasoningClick={(event) => push(`reasoning ${event.open ? 'opened' : 'closed'}`)}
      >
        <Conversation.Header title="Salmon Assistant">
          <Button variant="ghost" onClick={() => api.current?.scrollToBottom({ behavior: 'smooth' })}>
            Latest
          </Button>
        </Conversation.Header>
        <Conversation.Suggestions heading="Try" items={['Summarize this page', 'Write a poem about salmon']} />
        <Conversation.Composer placeholder="Ask the assistant" clearable attachments={{ maxCount: 3 }} toolbar={<Conversation.Dictation />} />
        <Conversation.Footer>Answers come from a fake local adapter.</Conversation.Footer>
      </Conversation>
      <EventLog entries={log} />
    </div>
  );
}
