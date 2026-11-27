// Range source: rows for a chart's visible range, fed from
// `onVisibleRangeChange`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRangeSource } from '@salmonui/data';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createRangeSource', () => {
  it('loads the overscanned range, caches it, aborts superseded loads and reports errors', async () => {
    const calls: { range: readonly [number, number]; aborted: () => boolean }[] = [];
    const pending: ((rows: { x: number }[]) => void)[] = [];
    const source = createRangeSource<{ x: number }>({
      overscan: 0.5,
      load: (range, { signal }) => {
        calls.push({ range, aborted: () => signal.aborted });
        return new Promise((resolve) => pending.push(resolve));
      },
    });
    const seen: boolean[] = [];
    const off = source.subscribe(() => seen.push(source.getSnapshot().loading));
    assert.deepEqual(source.getSnapshot(), { rows: [], range: null, loading: false, error: null });

    source.request([100, 200]);
    assert.deepEqual(calls[0]?.range, [50, 250], 'half the span on both sides');
    assert.equal(source.getSnapshot().loading, true);
    // A second request before the first resolves aborts it; its late result is ignored.
    source.request([400, 500]);
    assert.equal(calls[0]?.aborted(), true);
    pending[0]?.([{ x: 1 }]);
    pending[1]?.([{ x: 450 }]);
    await tick();
    assert.deepEqual(source.getSnapshot(), { rows: [{ x: 450 }], range: [350, 550], loading: false, error: null });

    // A range inside a cached one is served without a load.
    source.request([380, 520]);
    assert.equal(calls.length, 2);
    assert.deepEqual(source.getSnapshot().rows, [{ x: 450 }]);

    // invalidate() drops the cache.
    source.invalidate();
    source.request([380, 520]);
    assert.equal(calls.length, 3);
    off();
    assert.ok(seen.includes(true) && seen.includes(false));

    const failing = createRangeSource({ load: () => Promise.reject(new Error('down')) });
    failing.request([0, 1]);
    await tick();
    assert.equal((failing.getSnapshot().error as Error).message, 'down');
    assert.equal(failing.getSnapshot().loading, false);
  });
});
