import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { DataGridAdaptiveInteraction, LONG_PRESS_MS } from '../dist/data-grid/adaptive-interaction.js';

// touch gestures in the lazy adaptive chunk: a held touch is a
// long-press (multi-select on a record here), while a swipe is native touch
// scrolling. Movement past the slop cancels the pending long-press, so a
// slow swipe never selects; mouse and pen pointers never start one.

interface Calls {
  dispatched: unknown[];
  multi: boolean[];
}

function setup(): { touch: DataGridAdaptiveInteraction<unknown>; calls: Calls } {
  const calls: Calls = { dispatched: [], multi: [] };
  let multiOn = false;
  const instance = {
    props: {},
    chrome: { column: () => undefined, columnMenuEnabled: () => false },
    dispatchFrom: (_source: string, action: unknown) => calls.dispatched.push(action),
  };
  const host = {
    multiSelectAvailable: () => true,
    multiSelectOn: () => multiOn,
    setMultiSelect: (on: boolean) => {
      multiOn = on;
      calls.multi.push(on);
    },
    markTouchSelected: () => {},
  };
  return { touch: new DataGridAdaptiveInteraction(instance as never, host as never), calls };
}

const target = { isConnected: true, closest: (selector: string) => (selector.includes('[data-row-id]') ? { dataset: { rowId: 'r7' } } : null) };
const down = (x: number, y: number, pointerType = 'touch') => ({ pointerType, isPrimary: true, pointerId: 1, clientX: x, clientY: y, target }) as never;
const move = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y }) as never;

describe('touch long-press and swipe', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  it('a held touch on a record is a long-press: multi-select on, that record toggled', () => {
    const { touch, calls } = setup();
    touch.onPointerDown(down(100, 200));
    touch.onPointerMove(move(104, 203));
    mock.timers.tick(LONG_PRESS_MS);
    assert.deepEqual(calls.multi, [true]);
    assert.deepEqual(calls.dispatched, [{ type: 'selection.toggleRow', rowId: 'r7' }]);
  });

  it('a vertical or horizontal swipe past the slop cancels the long-press, even when slower than the delay', () => {
    for (const [dx, dy] of [[0, -40], [0, 40], [-40, 0], [40, 0]] as const) {
      const { touch, calls } = setup();
      touch.onPointerDown(down(100, 200));
      mock.timers.tick(LONG_PRESS_MS / 2);
      touch.onPointerMove(move(100 + dx, 200 + dy));
      mock.timers.tick(LONG_PRESS_MS * 2);
      assert.deepEqual(calls.dispatched, [], `swipe ${dx},${dy}`);
      assert.deepEqual(calls.multi, []);
    }
  });

  it('lifting the finger before the delay is a tap, not a long-press; mouse and pen never start one', () => {
    const { touch, calls } = setup();
    touch.onPointerDown(down(100, 200));
    touch.onPointerEnd({ pointerId: 1 } as never);
    mock.timers.tick(LONG_PRESS_MS * 2);
    for (const type of ['mouse', 'pen']) {
      touch.onPointerDown(down(100, 200, type));
      mock.timers.tick(LONG_PRESS_MS * 2);
    }
    assert.deepEqual(calls.dispatched, []);
  });
});
