// Conversation assistant variant page (tests/browser/conversation-assistant*.spec.ts).
// The adapter is a fake: no provider, no network. The prompt text picks its behavior:
//
//   "parts"     reasoning deltas, a tool call (running, then done), then text
//   "promise"   a Promise adapter (one final response)
//   "fail"      one chunk, then a thrown error
//   "wait"      300 ms before the first chunk (the pending skeleton shows)
//   "slow"      40 ms between chunks (default 5 ms)
//   "stream:<n>" n word chunks (default 5)
//
//   ?controlled   messages and the composer value are owned by the page
//   ?markdown     renderContent turns **x** into <strong> nodes (never HTML strings)
//   ?tools        renderTool renders the "weather" tool
//   ?history      starts with one prompt and one response with an alternative
//   ?dir=rtl  ?scheme=dark
//
// window.__assistant records events; window.__api is the ConversationApi;
// window.__speech drives the fake speech recognizer of Conversation.Dictation.
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/chat/conversation/styles.css';
import '@salmonui/inputs/speech-to-text/styles.css';
import { Conversation, type ConversationAdapter, type ConversationApi, type ConversationMessage, type ConversationUser } from '@salmonui/chat/conversation';
import type { SpeechRecognizer } from '@salmonui/inputs/speech-to-text';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);

const USERS: readonly ConversationUser[] = [
  { id: 'user', name: 'Ada' },
  { id: 'assistant', name: 'Helper' },
  { id: 'bob', name: 'Bob Stone' },
];

const log = {
  sends: [] as string[],
  requests: [] as { text: string; history: number; attachments: number }[],
  changes: [] as string[],
  actions: [] as string[],
  stops: 0,
  errors: [] as string[],
  reasoning: [] as boolean[],
  content: [] as boolean[],
  values: [] as string[],
  aborted: 0,
  lastMessages: [] as ConversationMessage[],
};
(window as unknown as { __assistant: typeof log }).__assistant = log;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const adapter: ConversationAdapter = (request, { signal }) => {
  log.requests.push({ text: request.text, history: request.messages.length, attachments: request.attachments.length });
  signal.addEventListener('abort', () => log.aborted++);
  if (request.text.includes('promise')) return sleep(20).then(() => `Answer to ${request.text}`);
  return (async function* () {
    const step = request.text.includes('slow') ? 40 : 5;
    if (request.text.includes('wait')) await sleep(300);
    if (request.text.includes('parts')) {
      for (const d of ['Look', 'ing up', ' the weather']) {
        await sleep(step);
        yield { type: 'reasoning' as const, delta: d };
      }
      yield { type: 'tool' as const, id: 'w1', name: 'weather', input: { city: 'Oslo' }, status: 'running' as const };
      await sleep(step);
      yield { type: 'tool' as const, id: 'w1', name: 'weather', input: { city: 'Oslo' }, output: { celsius: 3 }, status: 'done' as const };
    }
    if (request.text.includes('fail')) {
      yield 'partial ';
      await sleep(step);
      throw new Error('model unavailable');
    }
    const n = Number(/stream:(\d+)/.exec(request.text)?.[1] ?? 5);
    for (let i = 0; i < n; i++) {
      await sleep(step);
      if (signal.aborted) return;
      yield i === 0 ? { type: 'text' as const, delta: `**w${i}** ` } : `w${i} `;
    }
  })();
};

// Fake recognizer: window.__speech.say(text, final) emits a result.
let active: SpeechRecognizer | null = null;
const recognizer = (): SpeechRecognizer => {
  const r: SpeechRecognizer = {
    lang: '',
    continuous: true,
    interimResults: true,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start() {
      active = r;
      setTimeout(() => r.onstart?.({}), 0);
    },
    stop() {
      setTimeout(() => r.onend?.({}), 0);
    },
    abort() {
      setTimeout(() => r.onend?.({}), 0);
    },
  };
  return r;
};
(window as unknown as { __speech: { say(text: string, final: boolean): void } }).__speech = {
  say(text, final) {
    active?.onresult?.({ results: { length: 1, 0: { isFinal: final, length: 1, 0: { transcript: text } } } });
  },
};

/** **bold** to <strong> nodes: an app-supplied renderer, never an HTML string. */
const markdown = (text: string, { streaming }: { streaming: boolean }): ReactNode => {
  log.content.push(streaming);
  return text.split(/(\*\*[^*]+\*\*)/u).map((seg, i) => (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4 ? <strong key={i}>{seg.slice(2, -2)}</strong> : seg));
};

const initial: ConversationMessage[] = params.has('history')
  ? [
      { id: 'p0', author: 'user', text: 'Hello <b>there</b>', createdAt: '2026-01-01T09:00:00Z' },
      { id: 'r0', author: 'assistant', text: 'Second answer', createdAt: '2026-01-01T09:00:02Z', alternatives: ['First answer'] },
    ]
  : [];

function Page(): ReactNode {
  const [messages, setMessages] = useState<readonly ConversationMessage[]>(initial);
  const [value, setValue] = useState('');
  const controlled = params.has('controlled');
  const onMessagesChange = (next: readonly ConversationMessage[], e: { reason: string }) => {
    log.changes.push(e.reason);
    log.lastMessages = [...next];
    if (controlled) setMessages(next);
  };
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 16 }}>
        <h1>Assistant</h1>
        <div style={{ blockSize: 520, inlineSize: 560 }}>
          <Conversation
            ref={(api: ConversationApi | null) => {
              (window as unknown as { __api: ConversationApi | null }).__api = api;
            }}
            variant="assistant"
            users={USERS}
            timeZone="UTC"
            {...(controlled ? { messages } : { defaultMessages: messages })}
            onMessagesChange={onMessagesChange}
            adapter={adapter}
            onSend={(e) => log.sends.push(e.message.text)}
            onStop={() => log.stops++}
            onError={(error) => log.errors.push(String((error as Error).message))}
            onItemActionClick={(e) => {
              log.actions.push(`${e.action}${e.feedback ? `:${e.feedback}` : ''}:${e.message.id}`);
              if (e.action === 'copy') e.preventDefault();
            }}
            onReasoningClick={(e) => log.reasoning.push(e.open)}
            renderEmpty={() => <p className="banner">How can I help you today?</p>}
            {...(params.has('markdown') ? { renderContent: markdown } : null)}
            {...(params.has('tools') ? { renderTool: { weather: ({ part }) => <output className="weather">{part.output ? `${(part.output as { celsius: number }).celsius} °C` : 'Checking the weather…'}</output> } } : null)}
          >
            <Conversation.Header title="Assistant" />
            <Conversation.Suggestions heading="Try" items={['Summarize this page', 'promise answer']} />
            <Conversation.Composer
              placeholder="Ask anything"
              clearable
              {...(controlled ? { value, onValueChange: (v: string) => (log.values.push(v), setValue(v)) } : { onValueChange: (v: string) => log.values.push(v) })}
              mentions={[{ trigger: '@', items: USERS.filter((u) => u.id === 'bob') }]}
              attachments={{ maxCount: 2 }}
              toolbar={<Conversation.Dictation recognizer={recognizer} />}
            />
            <Conversation.Footer>Answers are generated by a fake adapter.</Conversation.Footer>
          </Conversation>
        </div>
        <button type="button" id="after">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
