'use client';

import type { ReactNode } from 'react';
import { Conversation, type ConversationAdapter, type ConversationItemRenderContext, type ConversationMentionUser, type ConversationMessage, type ConversationUser } from '@salmonui/chat/conversation';
import { EventLog, useEventLog } from '../../components/demo-kit';

// Teammates you can @mention. They are also `users`, so mention tokens in
// sent prompts render with their names.
const teammates: readonly ConversationMentionUser[] = [
  { id: 'ada', name: 'Ada Lovelace' },
  { id: 'grace', name: 'Grace Hopper' },
  { id: 'linus', name: 'Linus Pauling' },
];
const away = new Set(['linus']);

const users: readonly ConversationUser[] = [{ id: 'user', name: 'You' }, { id: 'assistant', name: 'Planning Assistant' }, ...teammates];

// Module constants with fixed dates: the server and the client render the same markup.
const initialMessages: readonly ConversationMessage[] = [
  { id: 'welcome', author: 'assistant', text: 'Hi! I draft plans and share them with your team. Type @ in the prompt to mention a teammate.', createdAt: '2026-03-03T09:00:00Z' },
  { id: 'q1', author: 'user', text: 'Draft the sprint goal and share it with @Ada Lovelace', mentions: ['ada'], createdAt: '2026-03-03T09:01:00Z' },
  { id: 'a1', author: 'assistant', text: 'Sprint goal: ship the export dialog with keyboard support. I shared it with Ada Lovelace.', createdAt: '2026-03-03T09:01:05Z' },
];

/** Resolves after `ms`, or right away when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

const nameOf = (id: string): string => teammates.find((t) => t.id === id)?.name ?? id;

// A fake assistant (no provider, no network): it reads `message.mentions` of
// the new prompt and answers word by word.
const assistant: ConversationAdapter = async function* (request, { signal }) {
  const prompt = request.messages[request.messages.length - 1];
  const people = (prompt?.mentions ?? []).map(nameOf);
  const reply = people.length > 0 ? `Done. I shared a summary with ${people.join(' and ')} and noted it in the plan.` : 'Done. Mention a teammate with @ and I will share the answer with them.';
  await wait(400, signal);
  for (const word of reply.split(/(?<= )/u)) {
    if (signal.aborted) return;
    await wait(50, signal);
    yield word;
  }
};

/**
 * `renderItem`: the first item (the welcome message) is a `Conversation.Item`
 * with richer children than its plain `text`; prompts that mention someone
 * get a "Shared with" line under the default item; every other item is the
 * default item unchanged.
 */
function renderItem({ message, index, defaultItem }: ConversationItemRenderContext): ReactNode {
  if (index === 0 && message.id === 'welcome') {
    return (
      <Conversation.Item message={message}>
        Hi! I draft plans and share them with your team. Type <kbd>@</kbd> in the prompt to mention a teammate.
      </Conversation.Item>
    );
  }
  if (message.mentions && message.mentions.length > 0) {
    return (
      <div>
        {defaultItem}
        <small style={{ display: 'block', textAlign: 'end', color: 'var(--salmon-text-secondary)' }}>Shared with {message.mentions.map(nameOf).join(', ')}</small>
      </div>
    );
  }
  return defaultItem;
}

export default function ConversationMentionsDemo() {
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
      <Conversation
        variant="assistant"
        style={{ blockSize: 440 }}
        users={users}
        defaultMessages={initialMessages}
        adapter={assistant}
        timeZone="UTC"
        renderItem={renderItem}
        // Copy and feedback on responses (no Regenerate: the welcome item renders fixed children).
        itemActions={{ response: ['copy', 'feedback'] }}
        onSend={(event) => push(`send: mentions ${JSON.stringify(event.message.mentions ?? [])}`)}
        onMessagesChange={(next, event) => push(`messages (${event.reason}): ${next.length}`)}
      >
        <Conversation.Header title="Planning Assistant" />
        <Conversation.Composer
          placeholder="Ask the assistant; type @ to mention a teammate"
          mentions={[{ trigger: '@', items: teammates }]}
          onBeforeMentionSelect={(event) => {
            if (away.has(event.user.id)) {
              event.preventDefault();
              push(`mention prevented: ${event.user.name} is away`);
            }
          }}
          onMentionSelect={(event) => push(`mention: ${event.trigger}${event.user.name}`)}
        />
      </Conversation>
      <EventLog entries={log} />
    </div>
  );
}
