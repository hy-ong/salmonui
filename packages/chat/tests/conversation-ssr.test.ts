// Conversation server rendering: renders with
// DOM globals removed; the server HTML holds the feed (last window), the
// composer and an empty polite live region, and never renders model or user
// text as HTML.
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
const { Conversation, ConversationItem } = await import('@salmonui/chat/conversation');

const users = [
  { id: 'u1', name: 'Ada Lovelace' },
  { id: 'u2', name: 'Bob Stone', avatar: '/bob.png' },
];
const messages = [
  { id: 'm1', author: 'u2', text: 'Hello <b>Ada</b>', createdAt: '2026-01-01T09:05:00Z', mentions: [] },
  { id: 'm2', author: 'u1', text: 'Hi @Bob Stone', createdAt: '2026-01-02T10:30:00Z', status: 'read', mentions: ['u2'], replyTo: 'm1' },
  { id: 'm3', author: 'u2', text: 'Forwarded note', createdAt: '2026-01-02T10:31:00Z', forwarded: true, pinned: true, attachments: [{ id: 'a1', name: 'plan.pdf', size: 2048, url: 'javascript:alert(1)' }] },
];

const render = (props: Record<string, unknown> = {}, ...children: unknown[]) =>
  renderToString(h(Conversation as never, { currentUser: 'u1', users, defaultMessages: messages, timeZone: 'UTC', ...props }, ...(children as never[])));

describe('Conversation SSR', () => {
  it('renders an APG feed of articles keyed by message id', () => {
    const html = render({ className: 'extra', style: { height: 400 } });
    assert.match(html, /<div class="salmon-conversation extra" style="height:400px" data-variant="chat" data-layout="bubbles">/);
    assert.match(html, /role="feed"[^>]*aria-label="Messages"/);
    assert.equal(html.match(/<article /g)?.length, 3);
    assert.match(html, /data-id="m1" data-index="0" aria-posinset="1" aria-setsize="3" aria-labelledby="[^"]*-m-m1-author [^"]*-m-m1-time"/);
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"><\/div>/, 'empty live region present in server HTML');
  });

  it('never renders message text as HTML', () => {
    const html = render();
    assert.match(html, /Hello &lt;b&gt;Ada&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>Ada<\/b>/);
    assert.doesNotMatch(html, /href="javascript:/, 'unsafe attachment URLs are not links');
  });

  it('marks own items and resolves users, avatars and initials', () => {
    const html = render();
    assert.match(html, /class="salmon-conversation-item" data-own="" data-author="u1"/);
    assert.match(html, /data-author="u2"/);
    assert.match(html, /<img src="\/bob.png" alt=""\/>/);
    assert.match(html, /salmon-conversation-avatar__initials">AL</);
    const custom = render({ renderAvatar: ({ id }: { id: string }) => h('i', null, `av-${id}`) });
    assert.match(custom, /<i>av-u2<\/i>/);
  });

  it('formats timestamps with the given locale and time zone', () => {
    const html = render();
    assert.match(html, /<time [^>]*dateTime="2026-01-01T09:05:00.000Z"[^>]*>9:05 AM<\/time>/);
    const de = render({ locale: 'de-DE', formatTimestamp: { hour: '2-digit', minute: '2-digit' } });
    assert.match(de, />09:05<\/time>/);
    const fn = render({ formatTimestamp: (d: Date) => `t${d.getUTCHours()}` });
    assert.match(fn, />t9<\/time>/);
    assert.doesNotMatch(render({ timestamps: false }), /<time /);
    // Without a time zone the server renders UTC (the client switches after hydration).
    assert.match(render({ timeZone: undefined }), />9:05 AM<\/time>/);
  });

  it('renders date separators between days', () => {
    const html = render({ dateSeparators: true });
    assert.equal(html.match(/salmon-conversation-date-separator/g)?.length, 2);
    assert.match(html, /January 2, 2026/);
    const custom = render({ dateSeparators: true, renderDateSeparator: ({ label }: { label: string }) => h('em', null, `day ${label}`) });
    assert.match(custom, /<em>day January 1, 2026<\/em>/);
  });

  it('switches to the compact layout', () => {
    assert.match(render({ layout: 'compact' }), /data-layout="compact"/);
  });

  it('renders the empty state', () => {
    const html = render({ defaultMessages: [], renderEmpty: () => 'No messages yet' });
    assert.match(html, /salmon-conversation-empty">No messages yet</);
  });

  it('renderItem wraps the default item; Conversation.Item decorates', () => {
    const html = render({
      renderItem: ({ message, index, defaultItem }: { message: { id: string }; index: number; defaultItem: unknown }) => h('div', { 'data-custom': `${message.id}:${index}` }, defaultItem as never),
    });
    assert.match(html, /data-custom="m2:1"><div class="salmon-conversation-item"/);
    const decorated = render({ renderItem: ({ message }: { message: unknown }) => h(ConversationItem as never, { message, className: 'deco' }, 'replaced') });
    assert.match(decorated, /class="salmon-conversation-item deco"/);
    assert.match(decorated, /salmon-conversation-item__bubble" dir="auto">replaced</);
  });

  it('renders the composer, footer and header parts', () => {
    const html = render(
      {},
      h(Conversation.Composer, { placeholder: 'Say something' }),
      h(Conversation.Header, { title: 'Support', icon: h('span', null, 'I') }, h('button', { type: 'button' }, 'Call')),
      h(Conversation.Footer, null, 'Encrypted'),
    );
    assert.match(html, /<textarea[^>]*aria-label="Message"[^>]*aria-multiline="true"[^>]*placeholder="Say something"/);
    assert.match(html, /salmon-conversation-footer">Encrypted</);
    assert.ok(html.indexOf('salmon-conversation-header') < html.indexOf('role="feed"'), 'the header renders before the feed');
    assert.match(html, /role="toolbar" class="salmon-conversation-header__toolbar" aria-labelledby="[^"]+-title"/);
    assert.doesNotMatch(render(), /salmon-conversation-composer/, 'no composer without the part');
  });

  it('renders item action toolbars with the default items', () => {
    const html = render();
    assert.match(html, /role="toolbar" aria-label="Message actions"/);
    for (const a of ['copy', 'reply', 'pin', 'delete']) assert.match(html, new RegExp(`data-action="${a}"`));
    assert.match(html, /aria-label="Unpin"/, 'a pinned message offers unpin');
    assert.doesNotMatch(render({ itemActions: false }), /Message actions/);
    assert.match(render({ itemActions: ['copy', { id: 'flag', label: 'Flag' }] }), /data-action="flag" aria-label="Flag"/);
  });

  it('renders replies, pins, forwards and delivery status', () => {
    const html = render({ onRetry: () => {} });
    assert.match(html, /salmon-conversation-reply-preview__author">Bob Stone<\/span><span class="salmon-conversation-reply-preview__text">Hello &lt;b&gt;Ada&lt;\/b&gt;/);
    assert.match(html, /salmon-conversation-pinned-bar/);
    assert.match(html, /salmon-conversation-item__forwarded">Forwarded</);
    assert.match(html, /data-icon="status-read"[^>]*><\/span><span class="salmon-conversation-sr">Read</);
    const err = render({ onRetry: () => {}, defaultMessages: [{ id: 'x', author: 'u1', text: 'oops', status: 'error' }] });
    assert.match(err, /Not sent/);
    assert.match(err, /salmon-conversation-retry[^>]*>Retry</);
    const preview = render({ defaultMessages: [{ id: 'y', author: 'u1', text: 'answer', replyTo: 'gone', replyPreview: { author: 'Zed', text: 'old' } }] });
    assert.match(preview, /reply-preview__author">Zed</);
  });

  it('renders typing indicators and suggestions', () => {
    const html = render({ typingUsers: ['u2'] }, h(Conversation.Suggestions, { items: ['Yes', 'No'], heading: 'Quick replies' }));
    assert.match(html, /Bob Stone is typing/);
    assert.match(html, /role="group" class="salmon-conversation-suggestions" aria-labelledby/);
    assert.match(html, />Quick replies</);
    assert.equal(html.match(/salmon-conversation-suggestion"/g)?.length, 2);
    assert.match(render({ typingUsers: ['u2'], renderTyping: ({ users: u }: { users: { name: string }[] }) => `custom ${u.length}` }), /custom 1/);
  });

  it('renders mention tokens and attachments', () => {
    const html = render();
    assert.match(html, /<span class="salmon-conversation-mention" data-user="u2">@Bob Stone<\/span>/);
    assert.match(html, /salmon-conversation-attachment__name">plan.pdf<\/span><span class="salmon-conversation-attachment__size">2 KB/);
    const safe = render({ defaultMessages: [{ id: 'z', author: 'u2', text: '', attachments: [{ id: 'a', name: 'x.png', url: 'https://example.com/x.png' }] }] });
    assert.match(safe, /<a class="salmon-conversation-attachment" href="https:\/\/example.com\/x.png" target="_blank" rel="noopener noreferrer"/);
    const composer = render({}, h(Conversation.Composer, { attachments: { accept: 'image/*' } }));
    assert.match(composer, /<input type="file" hidden="" multiple="" accept="image\/\*"/);
    assert.match(composer, /aria-label="Attach files"/);
  });

  it('renderAttachment replaces the sent attachment chip', () => {
    const seen: unknown[] = [];
    const html = render({
      defaultMessages: [{ id: 'z', author: 'u2', text: '', attachments: [{ id: 'a', name: 'x.png', url: 'https://example.com/x.png' }] }],
      renderAttachment: ({ attachment, message, tabIndex }: { attachment: { name: string }; message: { id: string }; tabIndex: number }) => {
        seen.push([attachment.name, message.id, tabIndex]);
        return h('i', { className: 'mine', tabIndex }, attachment.name);
      },
    });
    assert.match(html, /<i class="mine" tabindex="(?:0|-1)">x\.png<\/i>/);
    assert.doesNotMatch(html, /salmon-conversation-attachment"/);
    assert.equal((seen[0] as unknown[])[0], 'x.png');
    assert.equal((seen[0] as unknown[])[1], 'z');
  });

  it('virtualizes long histories to the last window, unknown set size while older history exists', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `k${i}`, author: i % 2 ? 'u1' : 'u2', text: `message ${i}` }));
    const html = render({ defaultMessages: many, hasOlder: true, initialItemCount: 20 });
    assert.equal(html.match(/<article /g)?.length, 20);
    assert.match(html, /data-id="k480" data-index="480" aria-posinset="481" aria-setsize="-1"/);
    assert.match(html, /salmon-conversation-older/);
  });
});
