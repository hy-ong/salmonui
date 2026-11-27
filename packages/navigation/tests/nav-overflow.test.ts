import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeHiddenFrom, computeOverflow, type OverflowEntry } from '../dist/internal/overflow.js';

// Pure fit math of internal/overflow; the DOM binding runs in tests/browser/toolbar.spec.ts.

const flags = (entries: OverflowEntry[], available: number, reserve = 10): number[] => [...computeOverflow(entries, available, reserve)];
const sized = (...sizes: number[]): OverflowEntry[] => sizes.map((size) => ({ size }));

describe('internal/overflow: computeHiddenFrom (Data Grid prefix rule)', () => {
  it('returns the length when everything fits, without reserving the trigger', () => {
    assert.equal(computeHiddenFrom([30, 30, 30], 90, 40), 3);
  });
  it('reserves the trigger once something overflows', () => {
    assert.equal(computeHiddenFrom([30, 30, 30], 89, 40), 1);
    assert.equal(computeHiddenFrom([30, 30, 30], 70, 0), 2);
    assert.equal(computeHiddenFrom([], 0, 40), 0);
  });
});

describe('internal/overflow: computeOverflow', () => {
  it('hides nothing when every item fits', () => {
    assert.deepEqual(flags(sized(20, 20, 20), 60), [0, 0, 0]);
  });
  it('equal priorities hide a suffix, matching computeHiddenFrom', () => {
    for (const available of [30, 45, 59, 61, 79, 100]) {
      const sizes = [20, 20, 20, 20];
      const from = computeHiddenFrom(sizes, available, 10);
      assert.deepEqual(flags(sized(...sizes), available), sizes.map((_, i) => (i >= from ? 1 : 0)), `available ${available}`);
    }
  });
  it('lower overflowPriority hides first; higher stays longer', () => {
    const entries: OverflowEntry[] = [{ size: 20, priority: 1 }, { size: 20 }, { size: 20, priority: 2 }, { size: 20 }];
    assert.deepEqual(flags(entries, 70), [0, 0, 0, 1]);
    assert.deepEqual(flags(entries, 59), [0, 1, 0, 1]);
    assert.deepEqual(flags(entries, 40), [1, 1, 0, 1]);
  });
  it("'never' items stay even when nothing else fits; 'always' items are hidden and force the trigger", () => {
    assert.deepEqual(flags([{ size: 50, mode: 'never' }, { size: 50 }, { size: 50, mode: 'never' }], 60), [0, 1, 0]);
    // Fits without the always item, but the trigger needs room too: 20 + 20 + 10 > 45.
    assert.deepEqual(flags([{ size: 20 }, { size: 20 }, { size: 5, mode: 'always' }], 45), [0, 1, 1]);
    assert.deepEqual(flags([{ size: 20 }, { size: 20 }, { size: 5, mode: 'always' }], 50), [0, 0, 1]);
  });
  it('separators are never leading, trailing or doubled among visible items', () => {
    const sep = { size: 5, separator: true };
    assert.deepEqual(flags([{ size: 20 }, sep, { size: 20 }, sep, { size: 20 }], 100), [0, 0, 0, 0, 0]);
    // The last item overflows: its separator would be trailing.
    assert.deepEqual(flags([{ size: 20 }, sep, { size: 20 }, sep, { size: 20 }], 60), [0, 0, 0, 1, 1]);
    // A middle item overflows (lower priority): the two separators would touch.
    assert.deepEqual(flags([{ size: 20, priority: 1 }, sep, { size: 20 }, sep, { size: 20, priority: 1 }], 69), [0, 0, 1, 1, 0]);
    assert.deepEqual(flags([sep, { size: 20 }], 100), [1, 0]);
  });
  it('a pinned item (modelled as never) keeps the selected tab visible', () => {
    assert.deepEqual(flags([{ size: 30 }, { size: 30 }, { size: 30, mode: 'never' }], 70), [0, 1, 0]);
  });
});
