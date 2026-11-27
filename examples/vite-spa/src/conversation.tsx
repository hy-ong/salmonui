// Conversation browser page (tests/browser/conversation*.spec.ts):
//
//   ?count=<n>        initial history size (default 40)
//   ?older            older history loads on demand (200 more, 100 ms latency)
//   ?bot              an adapter streams a reply to each message ("stream:<n>" chunks)
//   ?veto             onBeforeSend cancels messages containing "veto"
//   ?controlled       messages are owned by the page (onMessagesChange)
//   ?attachments      composer attachments with an upload transport (max 2, 1 KB)
//   ?mentions         @ mentions over the users
//   ?compact  ?dir=rtl  ?scheme=dark  ?separators
//   ?hydrate          server-renders the page with react-dom/server, then hydrates it
//
// window.__chat records events; window.__chatApi is the ConversationApi;
// window.__push(text, author) appends an incoming message.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/chat/conversation/styles.css';
import '@salmonui/inputs/speech-to-text/styles.css';
import { Conversation, type ConversationAdapter, type ConversationApi, type ConversationMessage, type ConversationUser } from '@salmonui/chat/conversation';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);

const USERS: readonly ConversationUser[] = [
  { id: 'me', name: 'Ada Lovelace' },
  { id: 'bob', name: 'Bob Stone' },
  { id: 'cy', name: 'Cy Young' },
  { id: 'assistant', name: 'Helper' },
];

const log = {
  sends: [] as string[],
  changes: [] as string[],
  typing: [] as boolean[],
  actions: [] as string[],
  attach: [] as string[],
  removed: [] as string[],
  errors: [] as string[],
  mentions: [] as string[],
  older: 0,
  lastMessages: [] as ConversationMessage[],
};
(window as unknown as { __chat: typeof log }).__chat = log;

const day = Date.UTC(2026, 0, 1, 9, 0);
const history = (n: number, offset = 0): ConversationMessage[] =>
  Array.from({ length: n }, (_, i) => {
    const k = i + offset;
    return {
      id: `m${k}`,
      author: k % 3 === 0 ? 'me' : k % 3 === 1 ? 'bob' : 'cy',
      text: k % 7 === 0 ? `Message ${k}\nwith a second line\nand a third` : `Message ${k}`,
      createdAt: new Date(day + k * 3_600_000).toISOString(),
      ...(k % 3 === 0 ? { status: 'read' as const } : null),
    };
  });

const count = Number(params.get('count') ?? 40);
const OLDER_TOTAL = 200;

const bot: ConversationAdapter = async function* (request, { signal }) {
  const n = Number(/stream:(\d+)/.exec(request.text)?.[1] ?? 5);
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, request.text.includes('slow') ? 40 : 5));
    if (signal.aborted) return;
    yield `w${i} `;
  }
};

function Page(): ReactNode {
  const [messages, setMessages] = useState<readonly ConversationMessage[]>(() => history(count, params.has('older') ? OLDER_TOTAL : 0));
  const [olderLeft, setOlderLeft] = useState(params.has('older') ? OLDER_TOTAL : 0);
  const [typing, setTyping] = useState<readonly string[]>([]);
  const api = useRef<ConversationApi | null>(null);
  const controlled = params.has('controlled') || params.has('older');
  (window as unknown as { __chatApi: ConversationApi | null }).__chatApi = null;
  (window as unknown as { __push: (text: string, author?: string) => void }).__push = (text, author = 'bob') =>
    setMessages((prev) => [...prev, { id: `in${prev.length}-${Math.random().toString(36).slice(2)}`, author, text, createdAt: new Date(day).toISOString() }]);
  (window as unknown as { __typing: (ids: string[]) => void }).__typing = (ids) => setTyping(ids);
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 16 }}>
        <h1>Conversation</h1>
        <button type="button" id="before">
          Before
        </button>
        <div style={{ blockSize: 480, inlineSize: 520 }}>
          <Conversation
            ref={(value) => {
              api.current = value;
              (window as unknown as { __chatApi: ConversationApi | null }).__chatApi = value;
            }}
            variant="chat"
            currentUser="me"
            users={USERS}
            timeZone="UTC"
            {...(controlled ? { messages, onMessagesChange: (next: readonly ConversationMessage[], e: { reason: string }) => (log.changes.push(e.reason), (log.lastMessages = [...next]), setMessages(next)) } : { defaultMessages: messages, onMessagesChange: (next: readonly ConversationMessage[], e: { reason: string }) => (log.changes.push(e.reason), (log.lastMessages = [...next])) })}
            typingUsers={typing}
            layout={params.has('compact') ? 'compact' : 'bubbles'}
            dateSeparators={params.has('separators')}
            hasOlder={olderLeft > 0}
            onLoadOlder={() => {
              log.older++;
              return new Promise<void>((resolve) =>
                setTimeout(() => {
                  const take = Math.min(50, olderLeft);
                  setMessages((prev) => [...history(take, olderLeft - take), ...prev]);
                  setOlderLeft((n) => n - take);
                  resolve();
                }, 100),
              );
            }}
            {...(params.has('bot') ? { adapter: bot, adapterAuthor: 'assistant' } : null)}
            onBeforeSend={(e) => {
              if (params.has('veto') && e.message.text.includes('veto')) e.preventDefault();
            }}
            onSend={(e) => log.sends.push(e.message.text)}
            onTypingChange={(e) => log.typing.push(e.typing)}
            typingTimeout={300}
            onItemActionClick={(e) => {
              log.actions.push(`${e.action}:${e.message.id}`);
              if (e.action === 'copy') e.preventDefault();
            }}
            onRetry={(e) => log.actions.push(`retry:${e.message.id}`)}
            renderEmpty={() => 'No messages yet'}
            {...(params.has('customAttachment')
              ? {
                  renderAttachment: ({ attachment, message, tabIndex }) => (
                    <a className="custom-attachment" href={attachment.url} data-message={message.id} tabIndex={tabIndex}>
                      Open {attachment.name}
                    </a>
                  ),
                }
              : null)}
          >
            <Conversation.Header title="Support chat">
              <button type="button" id="call">
                Call
              </button>
              <button type="button" id="info">
                Info
              </button>
            </Conversation.Header>
            <Conversation.Suggestions heading="Quick replies" items={['Sounds good', 'On my way']} />
            <Conversation.Composer
              placeholder="Write a message"
              {...(params.has('mentions') ? { mentions: [{ trigger: '@', items: USERS.filter((u) => u.id !== 'me') }], onMentionSelect: (e) => log.mentions.push(e.user.id) } : null)}
              {...(params.has('attachments')
                ? {
                    attachments: {
                      maxCount: 2,
                      maxSize: 1024,
                      upload: (file: File, { onProgress }: { onProgress: (l: number, t: number) => void }) =>
                        new Promise((resolve) => {
                          onProgress(1, 2);
                          setTimeout(() => resolve({ url: `https://files.example/${file.name}` }), 50);
                        }),
                    },
                    onAttach: (e) => log.attach.push(...e.attachments.map((a) => a.name)),
                    onAttachmentRemove: (e) => log.removed.push(e.attachment.name),
                    onAttachmentError: (e) => log.errors.push(`${e.reason}:${e.file.name}`),
                  }
                : null)}
            />
          </Conversation>
        </div>
        <button type="button" id="after">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(<Page />);
  hydrateRoot(root, <Page />, { onRecoverableError: (error) => console.error('recoverable', error) });
  (window as unknown as { __hydrated: boolean }).__hydrated = true;
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
