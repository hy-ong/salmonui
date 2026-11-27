// Conversation assistant variant, server rendering: with DOM globals
// removed, `#conversation-assistant`
// resolves to the static registry, so the server HTML holds the assistant
// markup (prompts, responses, parts, alternatives, toolbars) and never a
// placeholder; model output is never rendered as HTML.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Conversation } = await import('@salmonui/chat/conversation');

const users = [
  { id: 'user', name: 'Ada' },
  { id: 'assistant', name: 'Helper', avatar: '/helper.png' },
];
const messages = [
  { id: 'p1', author: 'user', text: 'Summarize <b>this</b>', createdAt: '2026-01-01T09:00:00Z' },
  {
    id: 'r1',
    author: 'assistant',
    text: 'Line one\nLine <i>two</i>',
    createdAt: '2026-01-01T09:00:05Z',
    parts: [
      { type: 'reasoning', delta: 'Reading the page' },
      { type: 'tool', id: 't1', name: 'search', input: { q: 'salmon' }, output: { hits: 2 }, status: 'done' },
    ],
    alternatives: ['First answer'],
    feedback: 'positive',
  },
];

const render = (props: Record<string, unknown> = {}, ...children: unknown[]) =>
  renderToString(h(Conversation as never, { variant: 'assistant', users, defaultMessages: messages, timeZone: 'UTC', ...props }, ...(children as never[])));

describe('Conversation assistant SSR', () => {
  it('renders prompts and responses as feed articles keyed by id', () => {
    const html = render();
    assert.match(html, /data-variant="assistant"/);
    assert.equal(html.match(/<article /g)?.length, 2);
    assert.match(html, /data-own="" data-author="user" data-role="prompt"/);
    assert.match(html, /data-author="assistant" data-role="response"/);
    assert.match(html, /<img src="\/helper.png" alt=""\/>/);
    assert.doesNotMatch(html, /<!--\$\?-->|<!--\$!-->/, 'no pending or client-rendered Suspense boundary');
  });

  it('never renders model output as HTML; renderContent gets the text and the streaming flag', () => {
    const html = render();
    assert.match(html, /Line one\nLine &lt;i&gt;two&lt;\/i&gt;/);
    assert.doesNotMatch(html, /<i>two<\/i>|<b>this<\/b>/);
    const calls: string[] = [];
    const custom = render({ renderContent: (text: string, { streaming }: { streaming: boolean }) => (calls.push(`${streaming}`), h('em', { className: 'md' }, text.toUpperCase())) });
    assert.match(custom, /<em class="md">LINE ONE\nLINE &lt;I&gt;TWO&lt;\/I&gt;<\/em>/);
    assert.ok(calls.every((c) => c === 'false'));
  });

  it('renders reasoning as a collapsed disclosure and tool parts with their status', () => {
    const html = render();
    assert.match(html, /<details class="salmon-conversation-reasoning"><summary>Reasoning<\/summary><div dir="auto">Reading the page<\/div><\/details>/);
    assert.match(html, /<details class="salmon-conversation-reasoning" data-tool="search" data-status="done"><summary>search: done<\/summary>/);
    assert.match(html, /&quot;q&quot;: &quot;salmon&quot;/);
    const custom = render({
      renderReasoning: ({ text }: { text: string }) => h('aside', null, `why: ${text}`),
      renderTool: { search: ({ part }: { part: { output: { hits: number } } }) => h('output', null, `${part.output.hits} hits`) },
    });
    assert.match(custom, /<aside>why: Reading the page<\/aside>/);
    assert.match(custom, /<output>2 hits<\/output>/);
  });

  it('renders response alternatives and the prompt / response toolbars', () => {
    const html = render();
    assert.match(html, /role="group" class="salmon-conversation-alternatives" aria-label="2 of 2"/);
    assert.match(html, /aria-label="Previous response"/);
    assert.match(html, /aria-label="Next response" disabled=""/);
    // Prompt: edit, copy. Response: copy, regenerate, helpful (pressed), not helpful.
    assert.match(html, /data-action="edit" aria-label="Edit"[^>]*>.*data-action="copy" aria-label="Copy"/s);
    assert.match(html, /data-action="regenerate" aria-label="Regenerate"/);
    assert.match(html, /data-action="positive" aria-label="Helpful" title="Helpful" aria-pressed="true"/);
    assert.match(html, /data-action="negative" aria-label="Not helpful" title="Not helpful" aria-pressed="false"/);
    const none = render({ itemActions: false });
    assert.doesNotMatch(none, /role="toolbar"/);
    const split = render({ itemActions: { response: ['copy'], prompt: [] } });
    assert.doesNotMatch(split, /data-action="edit"|data-action="regenerate"/);
    assert.match(split, /data-action="copy"/);
    const text = render({ localeText: { regenerate: 'Try again', responseIndex: '{index}/{count}' } });
    assert.match(text, /aria-label="Try again"/);
    assert.match(text, /aria-label="2\/2"/);
  });

  it('renders the pending skeleton for a response that is still sending', () => {
    const pending = [messages[0], { id: 'r2', author: 'assistant', text: '', status: 'sending' }];
    // On the server no stream exists: a committed sending response with text renders as text, an empty one as text too.
    const html = render({ defaultMessages: pending, timestamps: false });
    assert.match(html, /data-role="response" data-status="sending"/);
    const custom = render({ defaultMessages: pending, renderPending: () => h('span', { className: 'dots' }, '...') });
    assert.doesNotMatch(custom, /class="dots"/, 'the pending part is client-only (no stream on the server)');
  });

  it('renders the banner, header, suggestions, footer, clearable composer and dictation button', () => {
    const empty = render(
      { defaultMessages: [], renderEmpty: () => h('p', null, 'How can I help?') },
      h(Conversation.Header, { title: 'Assistant' }),
      h(Conversation.Suggestions, { heading: 'Try', items: ['Summarize this page'] }),
      h(Conversation.Composer, { clearable: true, placeholder: 'Ask anything', toolbar: h(Conversation.Dictation) }),
      h(Conversation.Footer, null, 'AI can make mistakes'),
    );
    assert.match(empty, /<p>How can I help\?<\/p>/);
    assert.match(empty, /salmon-conversation-header__title">Assistant</);
    assert.match(empty, /<button type="button" class="salmon-conversation-suggestion">Summarize this page<\/button>/);
    assert.match(empty, /placeholder="Ask anything"/);
    assert.match(empty, /class="salmon-conversation-composer__clear" aria-label="Clear"/);
    assert.match(empty, /class="salmon-conversation-composer__dictate" aria-label="Dictate" disabled="" title="Dictation is not available in this browser"/);
    assert.match(empty, /AI can make mistakes/);
    assert.doesNotMatch(render(), /salmon-conversation-header/, 'no header without Conversation.Header');
  });
});
