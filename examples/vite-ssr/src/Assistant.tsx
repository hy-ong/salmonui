// `?assistant`: the Conversation assistant variant of the Vite SSR example
// (tests/browser/ssr-assistant.spec.ts). On the
// server `#conversation-assistant` resolves to the static registry, so the
// prompts, responses, parts, alternatives and toolbars are in the server HTML;
// the browser hydrates them while the assistant chunk loads (no placeholder,
// no mismatch). The adapter is a fake (no provider, no network).
import { Conversation, type ConversationAdapter, type ConversationMessage } from '@salmonui/chat/conversation';

const users = [
  { id: 'user', name: 'Ada' },
  { id: 'assistant', name: 'Helper' },
];

const messages: readonly ConversationMessage[] = [
  { id: 'p1', author: 'user', text: 'What is the weather in Oslo?', createdAt: '2026-01-01T09:00:00Z' },
  {
    id: 'r1',
    author: 'assistant',
    text: 'It is 3 °C in Oslo.',
    createdAt: '2026-01-01T09:00:04Z',
    parts: [
      { type: 'reasoning', delta: 'The user asks for the weather; call the tool.' },
      { type: 'tool', id: 't1', name: 'weather', input: { city: 'Oslo' }, output: { celsius: 3 }, status: 'done' },
    ],
    alternatives: ['Oslo is cold today.'],
    feedback: 'positive',
  },
];

const adapter: ConversationAdapter = async function* (request) {
  for (const word of `You asked: ${request.text}`.split(' ')) {
    await new Promise((r) => setTimeout(r, 10));
    yield `${word} `;
  }
};

export function AssistantPage() {
  return (
    <section id="ssr-assistant" style={{ blockSize: 420, inlineSize: 520 }}>
      <Conversation variant="assistant" users={users} defaultMessages={messages} adapter={adapter} timeZone="UTC">
        <Conversation.Header title="Assistant" />
        <Conversation.Suggestions heading="Try" items={['Will it rain tomorrow?']} />
        <Conversation.Composer clearable toolbar={<Conversation.Dictation />} />
      </Conversation>
    </section>
  );
}
