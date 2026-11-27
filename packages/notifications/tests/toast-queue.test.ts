// Toast queue store: framework-agnostic, so
// every timing rule is asserted in Node with an injected fake clock.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createToastQueue, type ToastCloseEvent, type ToastQueue, type ToastQueueOptions } from '@salmonui/notifications/toast';

const EXIT_MS = 200;

// A fake clock: timers fire in time order when `advance()` passes them.
function fakeClock() {
  let time = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const options: ToastQueueOptions = {
    now: () => time,
    setTimeout: (cb, ms) => {
      timers.set(++seq, { at: time + ms, cb });
      return seq;
    },
    clearTimeout: (h) => void timers.delete(h as number),
  };
  const advance = (ms: number): void => {
    const end = time + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      time = next[1].at;
      next[1].cb();
    }
    time = end;
  };
  return { options, advance, pending: () => timers.size };
}

const ids = (q: ToastQueue) => q.getSnapshot().toasts.map((t) => t.id);
const visible = (q: ToastQueue) => q.getSnapshot().visible.filter((t) => !t.closing).map((t) => t.id);

// The queue is client-only: `add()` checks for a document at call time.
const g = globalThis as { document?: unknown };
beforeEach(() => {
  g.document = {};
});
afterEach(() => {
  delete g.document;
});

describe('toast queue', () => {
  it('add returns deterministic ids per queue and notifies subscribers', () => {
    const q = createToastQueue();
    let calls = 0;
    const off = q.subscribe(() => calls++);
    assert.equal(q.add({ title: 'A' }), 't1');
    assert.equal(q.add({ title: 'B' }), 't2');
    assert.equal(createToastQueue().add({ title: 'C' }), 't1');
    assert.equal(calls, 2);
    off();
    q.add({ title: 'D' });
    assert.equal(calls, 2);
    assert.deepEqual(ids(q), ['t1', 't2', 't3']);
    q.dismiss();
  });

  it('a queue is an ordinary object; on the server add() is a no-op that warns once', () => {
    delete g.document;
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
    try {
      const q = createToastQueue();
      assert.equal(q.add({ title: 'Server' }), '');
      assert.equal(q.add({ title: 'Server' }), '');
      assert.deepEqual(q.getSnapshot().toasts, []);
      assert.equal(warnings.length, 1);
      assert.match(String(warnings[0]), /server/);
    } finally {
      console.warn = warn;
    }
  });

  it('duration defaults to 5000 ms, Infinity keeps the toast, a toast with actions waits unless duration is set', () => {
    const clock = fakeClock();
    const q = createToastQueue(clock.options);
    q.add({ title: 'default' });
    q.add({ title: 'forever', duration: Infinity });
    q.add({ title: 'action', actions: [{ label: 'Undo', altText: 'Undo with F6' }] });
    q.add({ title: 'action timed', duration: 8000, actions: [{ label: 'Undo', altText: 'Undo with F6' }] });
    clock.advance(4999);
    assert.deepEqual(visible(q), ['t1', 't2', 't3', 't4']);
    clock.advance(1);
    assert.deepEqual(visible(q), ['t2', 't3', 't4']);
    clock.advance(3000);
    assert.deepEqual(visible(q), ['t2', 't3']);
    clock.advance(60_000);
    assert.deepEqual(visible(q), ['t2', 't3']);
    assert.deepEqual(ids(q), ['t2', 't3'], 'closed toasts leave after the exit transition');
  });

  it('pause keeps the remaining time; resume continues it; pauses nest', () => {
    const clock = fakeClock();
    const q = createToastQueue(clock.options);
    q.add({ title: 'A', duration: 1000 });
    clock.advance(600);
    q.pause();
    assert.equal(q.getSnapshot().paused, true);
    clock.advance(10_000);
    assert.deepEqual(visible(q), ['t1']);
    q.pause();
    q.resume();
    clock.advance(10_000);
    assert.deepEqual(visible(q), ['t1'], 'still paused by the outer pause');
    q.resume();
    assert.equal(q.getSnapshot().paused, false);
    clock.advance(399);
    assert.deepEqual(visible(q), ['t1']);
    clock.advance(1);
    assert.deepEqual(visible(q), []);
  });

  it('only max toasts are visible; the rest wait and start their timer when shown', () => {
    const clock = fakeClock();
    const q = createToastQueue({ ...clock.options, max: 2 });
    q.add({ title: 'A', duration: 1000 });
    q.add({ title: 'B', duration: 3000 });
    q.add({ title: 'C', duration: 1000 });
    assert.deepEqual(visible(q), ['t1', 't2']);
    assert.equal(q.getSnapshot().toasts.length, 3);
    clock.advance(1000);
    // t1 is closing and keeps its slot during the exit transition.
    assert.deepEqual(visible(q), ['t2']);
    clock.advance(EXIT_MS);
    assert.deepEqual(visible(q), ['t2', 't3']);
    clock.advance(999);
    assert.deepEqual(visible(q), ['t2', 't3'], 't3 counts from when it became visible');
    clock.advance(1);
    assert.deepEqual(visible(q), ['t2']);
    q.setMax(1);
    assert.equal(q.getSnapshot().visible.length, 1);
  });

  it('the visible array keeps its identity while only waiting toasts change', () => {
    const q = createToastQueue({ max: 1, ...fakeClock().options });
    q.add({ title: 'A' });
    const before = q.getSnapshot().visible;
    q.add({ title: 'B' });
    q.add({ title: 'C' });
    assert.equal(q.getSnapshot().visible, before);
  });

  it('update merges options; a new duration restarts the timer; dismiss(id) and dismiss() close', () => {
    const clock = fakeClock();
    const q = createToastQueue({ ...clock.options, max: 2 });
    const id = q.add({ title: 'Uploading', duration: Infinity, progress: true });
    q.update(id, { title: 'Uploaded', tone: 'success', duration: 1000 });
    const t = q.getSnapshot().visible[0]!;
    assert.equal(t.title, 'Uploaded');
    assert.equal(t.tone, 'success');
    assert.equal(t.progress, true);
    assert.equal(t.run, 1);
    clock.advance(1000);
    assert.deepEqual(visible(q), []);
    const a = q.add({ title: 'A' });
    q.add({ title: 'B' });
    q.add({ title: 'C (waiting)' });
    q.dismiss(a);
    assert.equal(q.getSnapshot().toasts.find((x) => x.id === a)?.closing, true);
    q.dismiss();
    clock.advance(EXIT_MS);
    assert.deepEqual(ids(q), [], 'dismiss() closes the visible toasts and drops the waiting ones');
    assert.equal(clock.pending(), 0);
  });

  it('onOpen runs when the toast enters the visible stack', () => {
    const clock = fakeClock();
    const q = createToastQueue({ ...clock.options, max: 1 });
    const opened: string[] = [];
    q.add({ title: 'A', duration: 100, onOpen: (id) => opened.push(id) });
    q.add({ title: 'B', onOpen: (id) => opened.push(id) });
    assert.deepEqual(opened, ['t1']);
    clock.advance(100 + EXIT_MS);
    assert.deepEqual(opened, ['t1', 't2']);
    q.dismiss();
  });

  it('onBeforeClose can veto; onClose reports timeout, dismiss, action and programmatic', () => {
    const clock = fakeClock();
    const q = createToastQueue(clock.options);
    const closed: ToastCloseEvent[] = [];
    let veto = true;
    const id = q.add({
      title: 'Kept',
      duration: 100,
      onBeforeClose: (event) => {
        assert.equal(event.defaultPrevented, false);
        if (veto) event.preventDefault();
        assert.equal(event.defaultPrevented, veto);
      },
      onClose: (event) => closed.push(event),
    });
    clock.advance(1000);
    assert.deepEqual(visible(q), [id], 'a vetoed timeout keeps the toast');
    q.dismiss(id);
    assert.deepEqual(visible(q), [id]);
    veto = false;
    q.dismiss(id, 'dismiss');
    for (const reason of ['action', 'programmatic'] as const) {
      const other = q.add({ title: reason, onClose: (event) => closed.push(event) });
      q.dismiss(other, reason === 'programmatic' ? undefined : reason);
    }
    const timed = q.add({ title: 'timed', duration: 50, onClose: (event) => closed.push(event) });
    clock.advance(50);
    assert.deepEqual(closed, [
      { id, reason: 'dismiss' },
      { id: 't2', reason: 'action' },
      { id: 't3', reason: 'programmatic' },
      { id: timed, reason: 'timeout' },
    ]);
  });

  it('100 adds in one task show max toasts and keep one timer per visible toast', () => {
    const clock = fakeClock();
    const q = createToastQueue(clock.options);
    for (let i = 0; i < 100; i++) q.add({ title: `Toast ${i}` });
    assert.equal(q.getSnapshot().visible.length, 5);
    assert.equal(q.getSnapshot().toasts.length, 100);
    assert.equal(clock.pending(), 5);
    q.dismiss();
    clock.advance(EXIT_MS);
    assert.deepEqual(ids(q), []);
  });
});
