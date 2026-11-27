// Conversation store, adapter runner and text helpers: framework-agnostic
// modules tested without a DOM.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createConversationStore, diffIds } from '../dist/conversation/store.js';
import { runAdapter } from '../dist/conversation/runner.js';
import { createText, dayKey, initials, mentionSegments, startsNewDay, typingText } from '../dist/conversation/format.js';

const m = (id: string, author = 'u1', text = id) => ({ id, author, text });

/** A manual frame scheduler: `flush()` runs the pending frame. */
function frames() {
  let pending: (() => void) | null = null;
  let count = 0;
  return {
    schedule: (cb: () => void) => {
      pending = cb;
      count++;
      return () => {
        pending = null;
      };
    },
    flush: () => {
      const cb = pending;
      pending = null;
      cb?.();
    },
    get scheduled() {
      return count;
    },
  };
}

describe('Conversation message store', () => {
  it('keys records by stable id and keeps unchanged record identity', () => {
    const a = m('a');
    const b = m('b');
    const store = createConversationStore([a, b]);
    assert.deepEqual(store.getIds(), ['a', 'b']);
    assert.equal(store.getMessage('a'), a);
    const b2 = { ...b, text: 'edited' };
    let calls = 0;
    store.subscribe(() => calls++);
    const ids = store.getIds();
    const diff = store.setMessages([a, b2]);
    assert.equal(diff.changed, true);
    assert.equal(store.getIds(), ids, 'same id list keeps its reference, so the list does not re-render');
    assert.equal(store.getMessage('a'), a);
    assert.equal(store.getMessage('b'), b2);
    assert.equal(calls, 1);
    assert.equal(store.setMessages([a, b2]).changed, false, 'an equal list publishes nothing');
    assert.equal(calls, 1);
    assert.equal(store.indexOf('b'), 1);
  });

  it('reports appended ids and the prepended count', () => {
    assert.deepEqual(diffIds(['b', 'c'], ['a', 'b', 'c', 'd']), { appended: ['d'], prepended: 1 });
    assert.deepEqual(diffIds([], ['a']), { appended: ['a'], prepended: 0 });
    const store = createConversationStore([m('b')]);
    const diff = store.setMessages([m('z'), m('a'), m('b'), m('c')]);
    assert.equal(diff.prepended, 2);
    assert.deepEqual(diff.appended, ['c']);
  });

  it('view updates publish only when a field changes', () => {
    const store = createConversationStore([]);
    let calls = 0;
    store.subscribe(() => calls++);
    store.setView({ atBottom: true });
    assert.equal(calls, 0);
    store.setView({ atBottom: false, unread: 2 });
    assert.equal(calls, 1);
    assert.equal(store.getView().unread, 2);
  });
});

describe('Conversation streaming', () => {
  it('buffers chunks and publishes once per animation frame', () => {
    const f = frames();
    const store = createConversationStore([], f.schedule);
    let published = 0;
    store.subscribeStream(() => published++);
    store.startStream('r1');
    published = 0;
    for (let i = 0; i < 200; i++) store.pushStream('x');
    assert.equal(published, 0, 'no publication before the frame');
    assert.equal(f.scheduled, 1, 'one frame scheduled for many chunks');
    f.flush();
    assert.equal(published, 1);
    assert.equal(store.getStream()?.text.length, 200);
    store.pushStream('y');
    assert.equal(store.endStream(), `${'x'.repeat(200)}y`);
    assert.equal(store.getStream()?.done, true);
  });

  it('runs a Promise adapter as one final response', async () => {
    const store = createConversationStore([]);
    const out = await runAdapter(async (request) => `echo ${request.text}`, { messages: [], text: 'hi', attachments: [] }, 'r', store, new AbortController().signal);
    assert.deepEqual(out, { status: 'done', text: 'echo hi' });
  });

  it('streams an AsyncIterable adapter and drops chunks after abort', async () => {
    const f = frames();
    const store = createConversationStore([], f.schedule);
    const controller = new AbortController();
    async function* adapter() {
      yield 'Hel';
      yield 'lo';
      controller.abort();
      yield ' world';
    }
    const out = await runAdapter(adapter, { messages: [], text: '', attachments: [] }, 'r', store, controller.signal);
    assert.deepEqual(out, { status: 'aborted', text: 'Hello' });
  });

  it('reports a thrown error with the partial text', async () => {
    const store = createConversationStore([]);
    async function* adapter() {
      yield 'part';
      throw new Error('boom');
    }
    const out = await runAdapter(adapter, { messages: [], text: '', attachments: [] }, 'r', store, new AbortController().signal);
    assert.equal(out.status, 'error');
    assert.equal(out.text, 'part');
  });

  it('a superseded run keeps its own text and never ends the newer stream', async () => {
    const store = createConversationStore([], frames().schedule);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const first = new AbortController();
    const slow = runAdapter(
      async function* () {
        yield 'old';
        await gate;
      },
      { messages: [], text: '', attachments: [] },
      'r1',
      store,
      first.signal,
    );
    await new Promise((r) => setTimeout(r, 0));
    first.abort();
    store.startStream('r2');
    release();
    const out = await slow;
    assert.equal(out.status, 'aborted');
    assert.equal(store.getStream()?.id, 'r2');
    assert.equal(store.getStream()?.done, false);
  });
});

describe('Conversation text helpers', () => {
  it('initials fall back for avatars', () => {
    assert.equal(initials('Ada Lovelace'), 'AL');
    assert.equal(initials('bob'), 'B');
    assert.equal(initials('  '), '?');
  });

  it('date separators start on a new day in the given zone', () => {
    const a = { id: 'a', author: 'u', text: '', createdAt: '2026-01-01T23:30:00Z' };
    const b = { id: 'b', author: 'u', text: '', createdAt: '2026-01-02T00:30:00Z' };
    assert.equal(startsNewDay(b, a, 'UTC'), true);
    assert.equal(startsNewDay(b, a, 'America/New_York'), false);
    assert.equal(startsNewDay(a, undefined, 'UTC'), true);
    assert.equal(dayKey(new Date('2026-01-02T00:30:00Z'), 'UTC'), '2026-01-02');
  });

  it('typing text names one, two or many users with plurals', () => {
    const t = createText(undefined, 'en-US');
    assert.equal(typingText(t, ['Ana']), 'Ana is typing');
    assert.equal(typingText(t, ['Ana', 'Bo']), 'Ana and Bo are typing');
    assert.equal(typingText(t, ['Ana', 'Bo', 'Cy']), 'Ana and 2 others are typing');
    assert.equal(createText({ typingOne: '{name} escribe' }, 'es')('typingOne', { name: 'Ana' }), 'Ana escribe');
  });

  it('mention tokens split the text without markup', () => {
    const users = new Map([['u2', { id: 'u2', name: 'Bob Stone' }]]);
    const segs = mentionSegments('Hi @Bob Stone, <b>ok</b>', ['u2'], (id) => users.get(id));
    assert.deepEqual(segs, [{ text: 'Hi ' }, { text: '@Bob Stone', mention: 'u2' }, { text: ', <b>ok</b>' }]);
    assert.deepEqual(mentionSegments('plain', undefined, () => undefined), [{ text: 'plain' }]);
  });

  it('mention tokens render for every configured trigger, not only @ and #', () => {
    const users = new Map([['u2', { id: 'u2', name: 'Bob' }], ['t1', { id: 't1', name: 'deploy' }]]);
    const userOf = (id: string) => users.get(id);
    for (const trigger of ['@', '#', '!', '+', '/', '$', '~', '＠']) {
      assert.deepEqual(mentionSegments(`ask ${trigger}Bob now`, ['u2'], userOf), [{ text: 'ask ' }, { text: `${trigger}Bob`, mention: 'u2' }, { text: ' now' }], trigger);
    }
    assert.deepEqual(mentionSegments('run /deploy, cc !Bob', ['t1', 'u2'], userOf), [{ text: 'run ' }, { text: '/deploy', mention: 't1' }, { text: ', cc ' }, { text: '!Bob', mention: 'u2' }]);
    // A name without a trigger (after a space, a letter or a digit) stays plain text.
    assert.deepEqual(mentionSegments('Bob, aBob 1Bob', ['u2'], userOf), [{ text: 'Bob, aBob 1Bob' }]);
  });
});
