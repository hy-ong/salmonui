// InlineAssist model: the
// per-instance store, command filtering, request building, history commits
// and the dictation merge. The component in the browser is
// tests/browser/inline-assist.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as entry from '@salmonui/chat/inline-assist';
import { buildRequest, cancelable, commandQuery, commitMessage, createAssistStore, filterCommands, isPoint, isRange, mergeTranscript, selectionText } from '../dist/inline-assist/model.js';

const commands = [
  { id: 'summarize', label: 'Summarize', keywords: ['shorter', 'tl;dr'] },
  { id: 'translate', label: 'Translate to French' },
  { id: 'fix', label: 'Fix spelling and grammar', disabled: true },
];

describe('InlineAssist entry', () => {
  it('exports the component, the Dictation part (static and flat) and the locale text', () => {
    assert.equal(typeof entry.InlineAssist, 'function');
    assert.equal(entry.InlineAssist.Dictation, entry.InlineAssistDictation);
    assert.equal(entry.INLINE_ASSIST_DEFAULT_LOCALE_TEXT.accept, 'Accept');
  });
});

describe('InlineAssist model', () => {
  it('reads a command query only after a leading slash', () => {
    assert.equal(commandQuery('/'), '');
    assert.equal(commandQuery('/sum'), 'sum');
    assert.equal(commandQuery('/sum more'), null, 'whitespace ends the query: it is a prompt');
    assert.equal(commandQuery('make it /short'), null);
    assert.equal(commandQuery(''), null);
  });

  it('filters commands by label and keywords, case-insensitively', () => {
    assert.deepEqual(filterCommands(commands, '').map((c) => c.id), ['summarize', 'translate', 'fix']);
    assert.deepEqual(filterCommands(commands, 'TRANS').map((c) => c.id), ['translate']);
    assert.deepEqual(filterCommands(commands, 'short').map((c) => c.id), ['summarize']);
    assert.deepEqual(filterCommands(commands, 'zzz'), []);
  });

  it('builds a frozen request with the selection and the command', () => {
    const history = [{ id: 'a', prompt: 'p', response: 'r', status: 'done' as const }];
    const request = buildRequest('Summarize', commands[0], 'Some text', history);
    assert.deepEqual(request, { prompt: 'Summarize', command: commands[0], selection: 'Some text', messages: history });
    assert.ok(Object.isFrozen(request));
    const range = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }), cloneContents: () => null, toString: () => 'ranged' };
    assert.equal(selectionText(range as unknown as Range, undefined), 'ranged', 'a Range anchor gives its text');
    assert.equal(selectionText(range as unknown as Range, 'explicit'), 'explicit', 'the selection prop wins');
    assert.equal(selectionText({ x: 1, y: 2 }, undefined), '');
  });

  it('tells points and ranges apart from elements', () => {
    assert.equal(isPoint({ x: 10, y: 20 }), true);
    assert.equal(isPoint({ getBoundingClientRect() {}, x: 1, y: 1 }), false);
    assert.equal(isRange({ getBoundingClientRect() {}, cloneContents() {} }), true);
    assert.equal(isRange({ getBoundingClientRect() {} }), false);
  });

  it('commits one message per response; Retry replaces the last one', () => {
    const first = { id: '1', prompt: 'a', response: 'A', status: 'done' as const };
    const second = { id: '2', prompt: 'a', response: 'B', status: 'done' as const };
    const one = commitMessage([], first, false);
    assert.deepEqual(one, [first]);
    assert.deepEqual(commitMessage(one, second, true), [second]);
    assert.deepEqual(commitMessage(one, second, false), [first, second]);
    assert.deepEqual(commitMessage([], second, true), [second], 'retry on an empty history appends');
  });

  it('cancelable events report preventDefault', () => {
    const event = cancelable({ action: 'accept' });
    assert.equal(event.defaultPrevented, false);
    event.preventDefault();
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.action, 'accept');
    assert.ok(Object.isFrozen(event));
  });

  it('dictation appends the transcript to the prompt present when listening started', () => {
    assert.equal(mergeTranscript('', 'hello world'), 'hello world');
    assert.equal(mergeTranscript('Rewrite', 'more formally'), 'Rewrite more formally');
    assert.equal(mergeTranscript('Rewrite ', 'more'), 'Rewrite more');
    assert.equal(mergeTranscript('Keep', ''), 'Keep');
  });

  it('the store publishes view changes only when a field changes; the stream flushes per frame', () => {
    const frames: (() => void)[] = [];
    const store = createAssistStore((cb) => {
      frames.push(cb);
      return () => undefined;
    });
    let views = 0;
    let streams = 0;
    store.subscribe(() => views++);
    store.stream.subscribe(() => streams++);
    store.setView({ phase: 'pending' });
    store.setView({ phase: 'pending' });
    assert.equal(views, 1);
    store.stream.start();
    streams = 0;
    for (let i = 0; i < 50; i++) store.stream.push('a');
    assert.equal(streams, 0);
    frames.shift()?.();
    assert.equal(streams, 1, 'one publication for 50 chunks');
    assert.equal(store.stream.end().length, 50);
    store.dispose();
  });
});
