// Mention logic in Node: trigger detection,
// insertion text and the store. Filtering, folding, match ranges and the
// remote reads are internal/collection/ (packages/react/tests/collection*.test.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMention, insertionText } from '../dist/mention/query.js';
import { createMentionStore, isRemote } from '../dist/mention/store.js';

const AT = [{ char: '@' }];
const opts = { requireLeadingSpace: true, multiWord: false };

describe('Mention trigger detection', () => {
  it('detects the default @ trigger and the search text up to the caret', () => {
    assert.deepEqual(findMention('hi @al', 6, AT, opts), { trigger: 0, start: 3, end: 6, text: 'al' });
    assert.deepEqual(findMention('@', 1, AT, opts), { trigger: 0, start: 0, end: 1, text: '' });
    assert.equal(findMention('hi al', 5, AT, opts), null);
  });

  it('supports several trigger characters, each reported by index', () => {
    const triggers = [{ char: '@' }, { char: '#' }];
    assert.equal(findMention('see #bu', 7, triggers, opts)?.trigger, 1);
    assert.equal(findMention('see @bo', 7, triggers, opts)?.trigger, 0);
    // A multi-character trigger beats a shorter one that shares its end.
    assert.deepEqual(findMention('x ::sm', 6, [{ char: ':' }, { char: '::' }], opts), { trigger: 1, start: 2, end: 6, text: 'sm' });
  });

  it('requireLeadingSpace: a trigger inside a word is ignored unless turned off', () => {
    assert.equal(findMention('mail@ho', 7, AT, opts), null);
    assert.deepEqual(findMention('mail@ho', 7, AT, { ...opts, requireLeadingSpace: false }), { trigger: 0, start: 4, end: 7, text: 'ho' });
    assert.equal(findMention('line\n@ab', 8, AT, opts)?.text, 'ab');
  });

  it('multiWord: spaces end the search unless multiWord is on; a line break always does', () => {
    assert.equal(findMention('@ann lee', 8, AT, opts), null);
    assert.deepEqual(findMention('@ann lee', 8, AT, { ...opts, multiWord: true }), { trigger: 0, start: 0, end: 8, text: 'ann lee' });
    assert.equal(findMention('@ann\nlee', 8, AT, { ...opts, multiWord: true }), null);
    assert.equal(findMention('@ ann', 5, AT, { ...opts, multiWord: true }), null, 'the search never starts with a space');
  });
});


describe('Mention insertion text', () => {
  it('drops the trigger char by default and keeps it with keepChar', () => {
    assert.equal(insertionText('@', false, 'Alice', ''), 'Alice');
    assert.equal(insertionText('@', true, 'Alice', ''), '@Alice');
  });

  it('appends the suffix', () => {
    assert.equal(insertionText('@', true, 'Alice', ' '), '@Alice ');
    assert.equal(insertionText('#', false, 'bug', '\n'), 'bug\n');
  });
});


describe('Mention store', () => {
  it('notifies only on change', () => {
    const store = createMentionStore<string>();
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ active: -1 });
    assert.equal(calls, 0);
    store.set({ active: 2 });
    assert.equal(calls, 1);
    assert.equal(store.get().active, 2);
  });

  it('tells a remote source from local data', () => {
    assert.equal(isRemote(['a']), false);
    assert.equal(isRemote({ read: () => ({ version: 1, rows: [] }) }), true);
    assert.equal(isRemote(undefined), false);
  });
});
