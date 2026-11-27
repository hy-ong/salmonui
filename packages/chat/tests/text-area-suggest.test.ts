// TextArea `suggest` logic in Node: request
// position, context, the debounced abortable scheduler, prefix keeping and the
// cancellable before-show event. The DOM glue (overlay, Tab/Escape, native
// insertion) is covered by the browser tests of the TextArea component.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ACCEPT_HINT,
  DEFAULT_SUGGEST_DELAY,
  allowSuggestion,
  createBeforeShowEvent,
  createSuggestScheduler,
  isSuggestPosition,
  isWordChar,
  keepRemainder,
  suggestContext,
  typedSince,
  type SchedulerTimers,
  type SuggestContext,
  type SuggestFunction,
} from '../dist/internal/suggest.js';

/** Manual timers: `run()` fires every pending callback once. */
function fakeTimers(): SchedulerTimers & { run(): void; pending(): number; delays: number[] } {
  let next = 0;
  const queue = new Map<number, () => void>();
  const delays: number[] = [];
  return {
    delays,
    setTimeout(callback, ms) {
      delays.push(ms);
      queue.set(++next, callback);
      return next;
    },
    clearTimeout(handle) {
      queue.delete(handle as number);
    },
    run() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback();
    },
    pending: () => queue.size,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('TextArea suggest request position', () => {
  it('passes value, textBeforeCaret and textAfterCaret to suggest', () => {
    assert.deepEqual(suggestContext('Hello wor, bye', 9), { value: 'Hello wor, bye', textBeforeCaret: 'Hello wor', textAfterCaret: ', bye' });
  });

  it('treats letters of any script, digits and underscore as word characters', () => {
    for (const ch of ['a', 'Z', '7', '_', 'é', 'ש', '漢']) assert.equal(isWordChar(ch), true, ch);
    for (const ch of [' ', '\n', ',', '.', '-', undefined]) assert.equal(isWordChar(ch), false, String(ch));
  });

  it('requests only at a word boundary: the character after the caret is not a word character', () => {
    assert.equal(isSuggestPosition('Hello wor', 9, 9, false), true, 'end of text, completing a word');
    assert.equal(isSuggestPosition('Hello ', 6, 6, false), true, 'after whitespace, next word');
    assert.equal(isSuggestPosition('Hello wor, bye', 9, 9, false), true, 'before punctuation');
    assert.equal(isSuggestPosition('Hello world', 8, 8, false), false, 'inside a word');
    assert.equal(isSuggestPosition('Hello world', 6, 6, false), false, 'right before a word');
  });

  it('never requests with a selection, while composing or with only blank text before the caret', () => {
    assert.equal(isSuggestPosition('Hello wor', 6, 9, false), false, 'selection');
    assert.equal(isSuggestPosition('Hello wor', 9, 9, true), false, 'IME composition');
    assert.equal(isSuggestPosition('', 0, 0, false), false, 'empty');
    assert.equal(isSuggestPosition('   \n', 4, 4, false), false, 'blank');
  });
});

describe('TextArea suggest scheduler', () => {
  const ctx = (value: string): SuggestContext => suggestContext(value, value.length);

  it('requests only after suggestDelay of idle time, default 300 ms', async () => {
    const timers = fakeTimers();
    const calls: SuggestContext[] = [];
    const results: string[] = [];
    const suggest: SuggestFunction = async (context) => {
      calls.push(context);
      return 'ld';
    };
    const scheduler = createSuggestScheduler(() => suggest, () => DEFAULT_SUGGEST_DELAY, (text) => results.push(text), timers);
    scheduler.schedule(ctx('wo'));
    scheduler.schedule(ctx('wor'));
    assert.equal(calls.length, 0, 'nothing before the timer fires');
    assert.equal(timers.pending(), 1, 'each keystroke restarts the single idle timer');
    assert.deepEqual(timers.delays, [300, 300]);
    timers.run();
    await flush();
    assert.deepEqual(calls.map((c) => c.value), ['wor']);
    assert.deepEqual(results, ['ld']);
  });

  it('aborts the previous request on each keystroke', async () => {
    const timers = fakeTimers();
    const signals: AbortSignal[] = [];
    const suggest: SuggestFunction = (_context, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    };
    const scheduler = createSuggestScheduler(() => suggest, () => 10, () => {}, timers);
    scheduler.schedule(ctx('a'));
    timers.run();
    assert.equal(signals[0]?.aborted, false);
    scheduler.schedule(ctx('ab'));
    assert.equal(signals[0]?.aborted, true, 'keystroke aborts the request in flight');
    timers.run();
    scheduler.cancel();
    assert.equal(signals[1]?.aborted, true, 'cancel aborts too');
  });

  it('drops late and stale responses, even when suggest ignores the signal', async () => {
    const timers = fakeTimers();
    const pending: { resolve(value: string | null): void }[] = [];
    const results: [string, string][] = [];
    const suggest: SuggestFunction = () => {
      const d = deferred<string | null>();
      pending.push(d);
      return d.promise;
    };
    const scheduler = createSuggestScheduler(() => suggest, () => 10, (text, context) => results.push([text, context.value]), timers);
    scheduler.schedule(ctx('he'));
    timers.run();
    scheduler.schedule(ctx('hel'));
    timers.run();
    pending[1]?.resolve('lo');
    pending[0]?.resolve('llo');
    await flush();
    assert.deepEqual(results, [['lo', 'hel']], 'the first response arrived late and was dropped');
    scheduler.schedule(ctx('hello '));
    timers.run();
    scheduler.cancel();
    pending[2]?.resolve('world');
    await flush();
    assert.equal(results.length, 1, 'a response after cancel is dropped');
  });

  it('shows nothing for null, empty results and rejections', async () => {
    const timers = fakeTimers();
    const results: string[] = [];
    let answer: () => Promise<string | null> = async () => null;
    const scheduler = createSuggestScheduler(() => () => answer(), () => 10, (text) => results.push(text), timers);
    scheduler.schedule(ctx('a'));
    timers.run();
    answer = async () => '';
    scheduler.schedule(ctx('ab'));
    timers.run();
    answer = async () => {
      throw new Error('offline');
    };
    scheduler.schedule(ctx('abc'));
    timers.run();
    answer = () => {
      throw new Error('sync throw');
    };
    scheduler.schedule(ctx('abcd'));
    timers.run();
    await flush();
    assert.deepEqual(results, []);
  });

  it('reads the latest suggest function and delay on each schedule', async () => {
    const timers = fakeTimers();
    let delay = 300;
    let suggest: SuggestFunction = async () => 'old';
    const results: string[] = [];
    const scheduler = createSuggestScheduler(() => suggest, () => delay, (text) => results.push(text), timers);
    delay = 50;
    suggest = async () => 'new';
    scheduler.schedule(ctx('x'));
    timers.run();
    await flush();
    assert.deepEqual(timers.delays, [50]);
    assert.deepEqual(results, ['new']);
  });
});

describe('TextArea suggest typing and events', () => {
  it('typing the next characters of the suggestion keeps the remainder', () => {
    assert.equal(keepRemainder('world', 'w'), 'orld');
    assert.equal(keepRemainder('world', 'wor'), 'ld');
    assert.equal(keepRemainder('world', 'x'), null, 'a different character dismisses');
    assert.equal(keepRemainder('world', 'world'), null, 'fully typed: nothing left');
    assert.equal(keepRemainder('world', ''), null);
  });

  it('detects a plain insertion at the suggestion anchor, nothing else', () => {
    assert.equal(typedSince('Hello ', 6, 'Hello w', 7), 'w');
    assert.equal(typedSince('Hello , bye', 6, 'Hello wo, bye', 8), 'wo');
    assert.equal(typedSince('Hello ', 6, 'Hello', 5), null, 'deletion');
    assert.equal(typedSince('Hello ', 6, 'xHello ', 1), null, 'edit before the anchor');
    assert.equal(typedSince('Hello ', 6, 'Hello w!', 7), null, 'text after the caret changed');
  });

  it('onBeforeSuggestionShow: preventDefault hides the suggestion', () => {
    const seen: string[] = [];
    assert.equal(allowSuggestion(undefined, 'x'), true, 'no handler: shown');
    assert.equal(allowSuggestion((e) => seen.push(e.text), 'world'), true);
    assert.equal(allowSuggestion((e) => e.preventDefault(), 'world'), false);
    assert.deepEqual(seen, ['world']);
    const event = createBeforeShowEvent('t');
    assert.equal(event.defaultPrevented, false);
    event.preventDefault();
    assert.equal(event.defaultPrevented, true);
  });

  it('exposes the default "Tab to accept" hint text', () => {
    assert.equal(DEFAULT_ACCEPT_HINT, 'Tab to accept');
  });
});
