// internal/stream-run.ts: the generic
// adapter runner (Promise = one response, AsyncIterable = stream, abort
// drops late chunks, never throws) and the frame-batched text buffer.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStreamBuffer, runStream, type StreamPart } from '../dist/internal/stream-run.js';

const collect = () => {
  const texts: string[] = [];
  const parts: StreamPart[] = [];
  return { texts, parts, sink: { text: (d: string) => void texts.push(d), part: (p: StreamPart) => void parts.push(p) } };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runStream', () => {
  it('runs a Promise adapter as one final response', async () => {
    const c = collect();
    const outcome = await runStream(() => Promise.resolve('Hello'), new AbortController().signal, c.sink);
    assert.deepEqual(outcome, { status: 'done', text: 'Hello' });
    assert.deepEqual(c.texts, ['Hello']);
  });

  it('streams an AsyncIterable: strings and text parts are deltas, other parts go to part()', async () => {
    const c = collect();
    async function* source() {
      yield 'Hel';
      yield { type: 'reasoning', delta: 'thinking' } as const;
      yield { type: 'text', delta: 'lo' } as const;
      yield '';
      yield { type: 'tool', id: 't1', name: 'search', input: {} } as const;
    }
    const outcome = await runStream(source, new AbortController().signal, c.sink);
    assert.deepEqual(outcome, { status: 'done', text: 'Hello' });
    assert.deepEqual(c.texts, ['Hel', 'lo']);
    assert.deepEqual(
      c.parts.map((p) => p.type),
      ['reasoning', 'tool'],
    );
  });

  it('abort resolves at once and drops late chunks of a stream', async () => {
    const c = collect();
    const controller = new AbortController();
    let release!: () => void;
    let cleaned = false;
    async function* source() {
      try {
        yield 'first ';
        await new Promise<void>((resolve) => (release = resolve));
        yield 'late';
      } finally {
        cleaned = true;
      }
    }
    const pending = runStream(source, controller.signal, c.sink);
    await tick();
    controller.abort();
    const outcome = await pending;
    assert.deepEqual(outcome, { status: 'aborted', text: 'first ' });
    release();
    await tick();
    assert.deepEqual(c.texts, ['first '], 'the chunk after abort is dropped');
    assert.equal(cleaned, true, 'the adapter generator is closed');
  });

  it('abort drops a Promise result that settles later', async () => {
    const c = collect();
    const controller = new AbortController();
    let resolve!: (value: string) => void;
    const pending = runStream(() => new Promise<string>((r) => (resolve = r)), controller.signal, c.sink);
    controller.abort();
    assert.deepEqual(await pending, { status: 'aborted', text: '' });
    resolve('late');
    await tick();
    assert.deepEqual(c.texts, []);
  });

  it('never throws: sync throws, rejections and stream errors become status error with the partial text', async () => {
    const signal = new AbortController().signal;
    const boom = new Error('boom');
    const sync = await runStream(() => {
      throw boom;
    }, signal, collect().sink);
    assert.equal(sync.status, 'error');
    const rejected = await runStream(() => Promise.reject(boom), signal, collect().sink);
    assert.deepEqual(rejected, { status: 'error', error: boom, text: '' });
    async function* failing() {
      yield 'part';
      throw boom;
    }
    assert.deepEqual(await runStream(failing, signal, collect().sink), { status: 'error', error: boom, text: 'part' });
  });

  it('a non-adapter result ends as an empty response', async () => {
    assert.deepEqual(await runStream(() => undefined, new AbortController().signal, collect().sink), { status: 'done', text: '' });
  });
});

describe('createStreamBuffer', () => {
  it('publishes once per frame and synchronously on end', () => {
    const frames: (() => void)[] = [];
    const buffer = createStreamBuffer((cb) => {
      frames.push(cb);
      return () => frames.splice(frames.indexOf(cb), 1);
    });
    let publications = 0;
    buffer.subscribe(() => publications++);
    buffer.start();
    assert.deepEqual(buffer.getSnapshot(), { text: '', streaming: true });
    publications = 0;
    for (let i = 0; i < 200; i++) buffer.push('x');
    assert.equal(frames.length, 1, 'one scheduled flush for 200 chunks');
    assert.equal(publications, 0);
    frames.shift()?.();
    assert.equal(publications, 1);
    assert.equal(buffer.getSnapshot().text.length, 200);
    buffer.push('y');
    assert.equal(buffer.end(), `${'x'.repeat(200)}y`);
    assert.equal(frames.length, 0, 'end cancels the pending flush');
    assert.deepEqual(buffer.getSnapshot(), { text: `${'x'.repeat(200)}y`, streaming: false });
    buffer.push('ignored');
    assert.equal(buffer.getSnapshot().text.endsWith('ignored'), false, 'a closed stream ignores chunks');
    buffer.dispose();
  });
});
