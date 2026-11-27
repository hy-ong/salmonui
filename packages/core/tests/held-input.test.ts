import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { holdInput, replayInput } from '../dist/internal/held-input.js';

// Input held while an interaction chunk loads (held-input.ts). The DOM
// behaviour per component runs in tests/browser/lazy-input.spec.ts.

describe('held input', () => {
  it('records the events of the given types in order until taken, once', () => {
    const target = new EventTarget();
    const take = holdInput(target, ['a', 'b']);
    target.dispatchEvent(new Event('a'));
    target.dispatchEvent(new Event('c'));
    target.dispatchEvent(new Event('b'));
    assert.deepEqual(
      take().map((e) => e.type),
      ['a', 'b'],
    );
    assert.deepEqual(take(), []);
  });

  it('swallows only the accepted events: no default action, no later listener', () => {
    const target = new EventTarget();
    const later: string[] = [];
    const take = holdInput(target, ['k'], (e) => (e as CustomEvent<string>).detail === 'tree');
    target.addEventListener('k', (e) => later.push((e as CustomEvent<string>).detail));
    const tree = new CustomEvent('k', { detail: 'tree', cancelable: true });
    target.dispatchEvent(tree);
    target.dispatchEvent(new CustomEvent('k', { detail: 'other', cancelable: true }));
    assert.equal(tree.defaultPrevented, true);
    assert.deepEqual(later, ['other']);
    assert.deepEqual(
      take().map((e) => (e as CustomEvent<string>).detail),
      ['tree'],
    );
  });

  it('replays copies at the chosen target, skipping a null one', () => {
    const target = new EventTarget();
    const seen: Event[] = [];
    target.addEventListener('p', (e) => seen.push(e));
    const original = new Event('p', { cancelable: true });
    replayInput([original, new Event('q')], (e) => (e.type === 'p' ? target : null));
    assert.equal(seen.length, 1);
    assert.notEqual(seen[0], original);
    assert.equal(seen[0]?.cancelable, true);
  });
});
