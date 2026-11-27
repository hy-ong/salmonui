// Conversation assistant variant: the assistant runner over
// the chat runner, part merging and the response commit, tested without a
// DOM against the built modules.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createConversationStore } from '../dist/conversation/store.js';
import { runAdapter } from '../dist/conversation/runner.js';
import { mergePart, run } from '../dist/conversation/assistant.js';

const msg = (id: string, author = 'assistant', text = '') => ({ id, author, text, status: 'sending' as const });
const manual = () => {
  let pending: (() => void) | null = null;
  return {
    schedule: (cb: () => void) => {
      pending = cb;
      return () => {
        pending = null;
      };
    },
    flush: () => {
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
};

describe('Conversation assistant runner', () => {
  it('merges reasoning deltas and updates tool parts by id', () => {
    let parts = mergePart([], { type: 'reasoning', delta: 'Think' });
    parts = mergePart(parts, { type: 'reasoning', delta: 'ing' });
    parts = mergePart(parts, { type: 'tool', id: 't1', name: 'search', input: { q: 'x' }, status: 'running' });
    parts = mergePart(parts, { type: 'tool', id: 't1', name: 'search', input: { q: 'x' }, output: ['a'], status: 'done' });
    parts = mergePart(parts, { type: 'reasoning', delta: 'More' });
    assert.deepEqual(parts, [
      { type: 'reasoning', delta: 'Thinking' },
      { type: 'tool', id: 't1', name: 'search', input: { q: 'x' }, output: ['a'], status: 'done' },
      { type: 'reasoning', delta: 'More' },
    ]);
  });

  it('a Promise adapter is one final response; the commit drops the pending status', async () => {
    const store = createConversationStore([], manual().schedule);
    const seen: unknown[] = [];
    const outcome = await run(
      async (request) => {
        seen.push(request.text, request.messages.length);
        return 'Hello';
      },
      { messages: [{ id: 'p', author: 'user', text: 'Hi' }], text: 'Hi', attachments: [] },
      'r',
      store,
      new AbortController().signal,
      runAdapter,
    );
    assert.deepEqual(seen, ['Hi', 1]);
    assert.equal(outcome.status, 'done');
    assert.deepEqual(outcome.apply?.(msg('r')), { id: 'r', author: 'assistant', text: 'Hello' });
  });

  it('streams text strings, text parts and response parts; text flushes once per frame', async () => {
    const frames = manual();
    const store = createConversationStore([], frames.schedule);
    let published = 0;
    store.subscribeStream(() => published++);
    const outcome = await run(
      async function* () {
        yield { type: 'reasoning', delta: 'Plan' } as const;
        yield 'Hel';
        yield { type: 'text', delta: 'lo' } as const;
        yield { type: 'tool', id: 'w', name: 'weather', input: { city: 'Oslo' } } as const;
        yield { type: 'tool', id: 'w', name: 'weather', input: { city: 'Oslo' }, output: 3, status: 'done' } as const;
      },
      { messages: [], text: 'q', attachments: [] },
      'r',
      store,
      new AbortController().signal,
      runAdapter,
    );
    assert.equal(outcome.text, 'Hello');
    // startStream and endStream publish; the chunks were buffered (no frame ran) and committed by endStream.
    assert.equal(published, 2);
    assert.deepEqual(outcome.apply?.(msg('r')), {
      id: 'r',
      author: 'assistant',
      text: 'Hello',
      parts: [
        { type: 'reasoning', delta: 'Plan' },
        { type: 'tool', id: 'w', name: 'weather', input: { city: 'Oslo' }, output: 3, status: 'done' },
      ],
    });
  });

  it('an aborted stream keeps the partial text and drops later chunks', async () => {
    const store = createConversationStore([], manual().schedule);
    const controller = new AbortController();
    const outcome = await run(
      async function* () {
        yield 'part ';
        controller.abort();
        yield 'late';
      },
      { messages: [], text: 'q', attachments: [] },
      'r',
      store,
      controller.signal,
      runAdapter,
    );
    assert.equal(outcome.status, 'aborted');
    assert.equal(outcome.text, 'part ');
  });

  it('an error marks the response for retry; an empty regenerate brings the previous text back', async () => {
    const store = createConversationStore([], manual().schedule);
    const failed = await run(
      async () => {
        throw new Error('boom');
      },
      { messages: [], text: 'q', attachments: [] },
      'r',
      store,
      new AbortController().signal,
      runAdapter,
    );
    assert.equal(failed.status, 'error');
    assert.deepEqual(failed.apply?.(msg('r')), { id: 'r', author: 'assistant', text: '', status: 'error' });

    const controller = new AbortController();
    controller.abort();
    const empty = await run(async () => '', { messages: [], text: 'q', attachments: [] }, 'r', store, controller.signal, runAdapter);
    assert.deepEqual(empty.apply?.({ ...msg('r'), alternatives: ['first', 'second'] }), { id: 'r', author: 'assistant', text: 'second', alternatives: ['first'] });
    assert.equal(empty.apply?.(msg('r')), null);
  });

  it('a regenerated response keeps its alternatives', async () => {
    const store = createConversationStore([], manual().schedule);
    const outcome = await run(async () => 'third', { messages: [], text: 'q', attachments: [] }, 'r', store, new AbortController().signal, runAdapter);
    assert.deepEqual(outcome.apply?.({ ...msg('r'), alternatives: ['first', 'second'], feedback: 'positive' }), { id: 'r', author: 'assistant', alternatives: ['first', 'second'], feedback: 'positive', text: 'third' });
  });
});
