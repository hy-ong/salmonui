import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitColumnWidths, type FitColumn } from '@salmonui/data-grid/engine';

const col = (width: number, max = Infinity, flexible = true): FitColumn => ({ width, max, flexible });
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

describe('fitColumnWidths ( resizeMode auto)', () => {
  it('expands proportionally to fill the target in whole px', () => {
    const out = fitColumnWidths([col(100), col(200), col(100)], 600);
    assert.deepEqual(out, [150, 300, 150]);
    const odd = fitColumnWidths([col(100), col(100), col(100)], 400)!;
    assert.equal(sum(odd), 400);
    assert.ok(odd.every((w) => Number.isInteger(w) && w >= 133 && w <= 134));
  });

  it('never shrinks: returns null when the columns already fill the target', () => {
    assert.equal(fitColumnWidths([col(300), col(300)], 600), null);
    assert.equal(fitColumnWidths([col(400), col(300)], 600), null);
    assert.equal(fitColumnWidths([], 600), null);
  });

  it('skips fixed columns and honours maxWidth, redistributing the rest', () => {
    const out = fitColumnWidths([col(40, Infinity, false), col(100, 120), col(100)], 400)!;
    assert.equal(out[0], 40);
    assert.equal(out[1], 120);
    assert.equal(out[2], 240);
    assert.equal(sum(out), 400);
  });

  it('stops at maxWidth when every flexible column is capped', () => {
    assert.deepEqual(fitColumnWidths([col(100, 150), col(100, 150)], 1000), [150, 150]);
    assert.equal(fitColumnWidths([col(100, Infinity, false)], 1000), null);
  });

  it('floors a fractional target', () => {
    const out = fitColumnWidths([col(100), col(100)], 301.6)!;
    assert.equal(sum(out), 301);
  });
});
