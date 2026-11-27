// ImageEditor logic in Node: the
// pure geometry, history, filter ops, pixel fallback and annotation
// reducers. DOM behavior is in tests/browser/image-editor*.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clamp, clampPan, cropOf, fitView, normRotation, normStraighten, orientedSize, outputSize, straightenScale } from '../dist/image-editor/geometry.js';
import { fitRatio, flipRect, panForZoom, ratioValue, resizeFromHandle, resizeKeepingAspect, rotatePoint90, rotateRect90 } from '../dist/image-editor/transform.js';
import { emptyHistory, pushHistory, redoHistory, undoHistory } from '../dist/image-editor/history.js';
import { cssFilter, FILTER_PRESETS, filterOps, IMAGE_EDITOR_FILTERS } from '../dist/image-editor/adjust.js';
import { applyFilterOps, blurPixels, boxRadius, pixelatePixels } from '../dist/image-editor/pixels.js';
import {
  boundsOf,
  cloneAnnotation,
  flipAnnotations,
  hitTest,
  hitTopmost,
  moveAnnotation,
  nextId,
  removeAnnotation,
  reorderAnnotation,
  resizeAnnotation,
  rotateAnnotation,
  rotateAnnotations90,
  setBounds,
  updateAnnotation,
} from '../dist/image-editor/annotations.js';
import { IMAGE_EDITOR_DEFAULT_LOCALE_TEXT, IMAGE_EDITOR_DEFAULT_TOOLBAR } from '../dist/image-editor/items.js';
import type { ImageEditorAnnotation } from '../dist/image-editor/types.js';

const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe('ImageEditor geometry', () => {
  it('normalizes rotation and straighten; swaps the oriented size at 90 and 270 degrees', () => {
    assert.deepEqual([normRotation(-90), normRotation(450), normRotation(91), normRotation(undefined)], [270, 90, 90, 0]);
    assert.deepEqual([normStraighten(60), normStraighten(-60), normStraighten(10)], [45, -45, 10]);
    assert.deepEqual(orientedSize({ width: 200, height: 100 }, 90), { width: 100, height: 200 });
    assert.deepEqual(orientedSize({ width: 200, height: 100 }, 180), { width: 200, height: 100 });
  });

  it('straighten scales up so the rotated image covers its box', () => {
    close(straightenScale({ width: 100, height: 100 }, 0), 1);
    const k = straightenScale({ width: 200, height: 100 }, 30);
    // A 200 x 100 box rotated 30 degrees and scaled by k contains the unrotated box.
    const t = Math.PI / 6;
    assert.ok(200 * Math.cos(t) + 100 * Math.sin(t) <= 200 * k + 1e-9);
    assert.ok(200 * Math.sin(t) + 100 * Math.cos(t) <= 100 * k + 1e-9);
  });

  it('crop clamps into the oriented image; output size follows crop and resize', () => {
    assert.deepEqual(cropOf({}, { width: 200, height: 100 }), { x: 0, y: 0, width: 200, height: 100, shape: 'rect' });
    assert.deepEqual(cropOf({ crop: { x: 180, y: -5, width: 50, height: 50, shape: 'circle' } }, { width: 200, height: 100 }), { x: 150, y: 0, width: 50, height: 50, shape: 'circle' });
    assert.deepEqual(outputSize({ crop: { x: 10, y: 10, width: 40, height: 30 } }, { width: 200, height: 100 }), { width: 40, height: 30 });
    assert.deepEqual(outputSize({ rotation: 90 }, { width: 200, height: 100 }), { width: 100, height: 200 });
    assert.deepEqual(outputSize({ resize: { width: 50.4, height: 25 } }, { width: 200, height: 100 }), { width: 50, height: 25 });
  });

  it('ratio presets and the largest centered rect of a ratio', () => {
    assert.deepEqual(['free', 'square', 'circle', '3:2', '4:3', '16:9'].map((r) => ratioValue(r as never)), [null, 1, 1, 1.5, 4 / 3, 16 / 9]);
    assert.equal(ratioValue({ label: 'Banner', ratio: 4 }), 4);
    assert.deepEqual(fitRatio({ x: 0, y: 0, width: 200, height: 100 }, 1, { width: 200, height: 100 }), { x: 50, y: 0, width: 100, height: 100 });
    assert.deepEqual(fitRatio({ x: 0, y: 0, width: 200, height: 100 }, 4, { width: 200, height: 100 }), { x: 0, y: 25, width: 200, height: 50 });
  });

  it('resize keeps the aspect ratio by default', () => {
    assert.deepEqual(resizeKeepingAspect({ width: 200, height: 100 }, { width: 100 }, true), { width: 100, height: 50 });
    assert.deepEqual(resizeKeepingAspect({ width: 200, height: 100 }, { height: 30 }, true), { width: 60, height: 30 });
    assert.deepEqual(resizeKeepingAspect({ width: 200, height: 100 }, { height: 30 }, false), { width: 200, height: 30 });
  });

  it('90-degree turns and flips map oriented coordinates', () => {
    const size = { width: 200, height: 100 };
    assert.deepEqual(rotatePoint90({ x: 0, y: 0 }, size, 1), { x: 100, y: 0 });
    assert.deepEqual(rotatePoint90({ x: 0, y: 0 }, size, -1), { x: 0, y: 200 });
    assert.deepEqual(rotateRect90({ x: 10, y: 10, width: 40, height: 30 }, size, 1), { x: 60, y: 10, width: 30, height: 40 });
    assert.deepEqual(flipRect({ x: 10, y: 10, width: 40, height: 30 }, size, 'horizontal'), { x: 150, y: 10, width: 40, height: 30 });
    assert.deepEqual(flipRect({ x: 10, y: 10, width: 40, height: 30 }, size, 'vertical'), { x: 10, y: 60, width: 40, height: 30 });
  });

  it('handles resize with the opposite corner fixed, rotated, and with a locked ratio', () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };
    assert.deepEqual(resizeFromHandle(box, 0, 'se', { x: 150, y: 80 }), { x: 0, y: 0, width: 150, height: 80 });
    assert.deepEqual(resizeFromHandle(box, 0, 'w', { x: 20, y: 999 }), { x: 20, y: 0, width: 80, height: 50 });
    const locked = resizeFromHandle(box, 0, 'se', { x: 200, y: 60 }, 2);
    close(locked.width / locked.height, 2);
    // Rotated 90 degrees: dragging the local east handle grows along screen y; the west edge stays.
    const r = resizeFromHandle(box, 90, 'e', { x: 50, y: 85 });
    close(r.width, 110);
    close(r.height, 50);
  });

  it('fits the scene, clamps pan and zooms around a point', () => {
    assert.deepEqual(fitView({ width: 200, height: 100 }, { width: 400, height: 400 }, 1, { x: 0, y: 0 }), { scale: 2, x: 0, y: 100 });
    assert.deepEqual(clampPan({ width: 200, height: 100 }, { width: 400, height: 400 }, 2, { x: 50, y: 50 }), { x: 0, y: 0 });
    const pan = panForZoom({ width: 200, height: 100 }, { width: 400, height: 400 }, { zoom: 1, pan: { x: 0, y: 0 } }, 2, { x: 100, y: 200 });
    // The point under the cursor stays put.
    const v = fitView({ width: 200, height: 100 }, { width: 400, height: 400 }, 2, pan);
    close((100 - v.x) / v.scale, 50);
    assert.equal(clamp(5, 0, 3), 3);
  });
});

describe('ImageEditor history', () => {
  it('pushes the state before an edit, undoes, redoes and respects the limit', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 0, 2);
    h = pushHistory(h, 1, 2);
    h = pushHistory(h, 2, 2);
    assert.deepEqual(h.past, [1, 2]);
    const u = undoHistory(h, 3)!;
    assert.equal(u.state, 2);
    assert.deepEqual(u.history.future, [3]);
    const r = redoHistory(u.history, 2)!;
    assert.equal(r.state, 3);
    assert.equal(undoHistory(emptyHistory<number>(), 0), null);
    assert.equal(redoHistory(h, 0), null);
    assert.deepEqual(pushHistory(h, 9, 0), emptyHistory());
  });

  it('merges pushes with the same key inside the window (keyboard nudges)', () => {
    let h = pushHistory(emptyHistory<number>(), 0, 10, 'k', 100);
    h = pushHistory(h, 1, 10, 'k', 500);
    assert.deepEqual(h.past, [0]);
    h = pushHistory(h, 2, 10, 'k', 2000);
    assert.deepEqual(h.past, [0, 2]);
    h = pushHistory(h, 3, 10, 'other', 2100);
    assert.deepEqual(h.past, [0, 2, 3]);
  });
});

describe('ImageEditor finetune and filters', () => {
  it('maps adjustments to CSS filter ops; neutral values add nothing', () => {
    assert.equal(cssFilter(filterOps({}, 'default')), 'none');
    assert.equal(cssFilter(filterOps({ opacity: 100, blur: 0 }, 'default')), 'none');
    assert.equal(cssFilter(filterOps({ brightness: 50, contrast: -20, hue: 90, saturation: 10, exposure: 100, opacity: 40, blur: 3 }, 'default')), 'brightness(1.5) brightness(2) contrast(0.8) saturate(1.1) hue-rotate(90deg) opacity(0.4) blur(3px)');
    assert.equal(cssFilter(filterOps({ brightness: 500 }, 'grayscale')), 'grayscale(1) brightness(2)');
    assert.deepEqual(IMAGE_EDITOR_FILTERS, ['default', 'chrome', 'cold', 'warm', 'grayscale', 'sepia', 'invert']);
    for (const f of IMAGE_EDITOR_FILTERS) assert.ok(Array.isArray(FILTER_PRESETS[f]));
  });

  it('the pixel fallback matches the CSS functions', () => {
    const px = (): Uint8ClampedArray => new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    let d = px();
    applyFilterOps(d, 2, 1, [{ fn: 'grayscale', v: 1 }]);
    assert.deepEqual(Array.from(d.slice(0, 4)), [54, 54, 54, 255]);
    d = px();
    applyFilterOps(d, 2, 1, [{ fn: 'invert', v: 1 }]);
    assert.deepEqual(Array.from(d), [0, 255, 255, 255, 255, 255, 0, 255]);
    d = px();
    applyFilterOps(d, 2, 1, [{ fn: 'brightness', v: 0 }, { fn: 'opacity', v: 0.5 }]);
    assert.deepEqual(Array.from(d), [0, 0, 0, 128, 0, 0, 0, 128]);
    d = px();
    applyFilterOps(d, 2, 1, [{ fn: 'hue-rotate', v: 360 }]);
    assert.deepEqual(Array.from(d), Array.from(px()));
    d = px();
    applyFilterOps(d, 2, 1, [{ fn: 'sepia', v: 1 }]);
    assert.deepEqual(Array.from(d.slice(0, 3)), [100, 89, 69]);
  });

  it('box blur approximates a Gaussian and pixelate averages blocks', () => {
    assert.equal(boxRadius(0), 0);
    assert.equal(boxRadius(4), 4);
    const w = 20;
    const d = new Uint8ClampedArray(w * 4);
    for (let x = 0; x < w; x++) d.set(x < 10 ? [255, 0, 0, 255] : [0, 0, 255, 255], x * 4);
    blurPixels(d, w, 1, 3);
    assert.ok(d[9 * 4]! < 255 && d[9 * 4 + 2]! > 0);
    assert.equal(d[0], 255);
    const p = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 50, 50, 50, 255, 50, 50, 50, 255]);
    pixelatePixels(p, 2, 2, 2);
    assert.deepEqual(Array.from(p.slice(0, 4)), [50, 50, 50, 255]);
  });
});

describe('ImageEditor annotations', () => {
  const rect: ImageEditorAnnotation = { id: 'r', kind: 'rectangle', x: 10, y: 10, width: 40, height: 30 };
  const line: ImageEditorAnnotation = { id: 'l', kind: 'line', points: [0, 0, 100, 100], strokeWidth: 4 };
  const text: ImageEditorAnnotation = { id: 't', kind: 'text', x: 0, y: 0, text: 'ab\nc', fontSize: 10 };
  const list = [rect, line, text];

  it('bounds, hit tests and the topmost hit (array order is z-order)', () => {
    assert.deepEqual(boundsOf(line), { x: 0, y: 0, width: 100, height: 100 });
    assert.deepEqual(boundsOf(text, () => 7), { x: 0, y: 0, width: 7, height: 24 });
    assert.ok(hitTest(rect, { x: 30, y: 25 }));
    assert.ok(!hitTest(rect, { x: 80, y: 80 }));
    assert.ok(hitTest(line, { x: 51, y: 49 }));
    assert.ok(!hitTest(line, { x: 80, y: 20 }));
    assert.ok(hitTest({ ...rect, rotation: 90 }, { x: 30, y: 43 }));
    assert.ok(!hitTest({ ...rect, rotation: 90 }, { x: 8, y: 25 }));
    assert.equal(hitTopmost([rect, { ...rect, id: 'top' }], { x: 30, y: 25 })?.id, 'top');
    assert.ok(hitTest({ id: 'e', kind: 'ellipse', x: 0, y: 0, width: 100, height: 50 }, { x: 50, y: 25 }));
    assert.ok(!hitTest({ id: 'e', kind: 'ellipse', x: 0, y: 0, width: 100, height: 50 }, { x: 2, y: 2 }));
  });

  it('move, resize, rotate, clone', () => {
    assert.deepEqual(moveAnnotation(rect, 5, -5), { ...rect, x: 15, y: 5 });
    assert.deepEqual(moveAnnotation(line, 1, 2), { ...line, points: [1, 2, 101, 102] });
    assert.deepEqual(resizeAnnotation(rect, 'se', { x: 70, y: 60 }), { ...rect, width: 60, height: 50 });
    assert.deepEqual(setBounds(line, { x: 0, y: 0, width: 50, height: 200 }), { ...line, points: [0, 0, 50, 200] });
    assert.equal((setBounds(text, { x: 0, y: 0, width: 7, height: 48 }, () => 7) as { fontSize: number }).fontSize, 20);
    assert.equal(rotateAnnotation(rotateAnnotation(rect, 300), 90).rotation, 30);
    assert.deepEqual(cloneAnnotation(rect, 'r2'), { ...rect, id: 'r2', x: 26, y: 26 });
    assert.equal(nextId(list, 'rectangle'), 'rectangle-4');
  });

  it('update, delete and z-order moves reorder the array', () => {
    assert.equal(updateAnnotation(list, 'zz', (a) => a), list);
    assert.equal((updateAnnotation(list, 'r', (a) => ({ ...a, opacity: 0.5 }))[0] as { opacity: number }).opacity, 0.5);
    assert.deepEqual(removeAnnotation(list, 'l').map((a) => a.id), ['r', 't']);
    assert.equal(removeAnnotation(list, 'zz'), list);
    assert.deepEqual(reorderAnnotation(list, 'r', 'forward').map((a) => a.id), ['l', 'r', 't']);
    assert.deepEqual(reorderAnnotation(list, 'r', 'front').map((a) => a.id), ['l', 't', 'r']);
    assert.deepEqual(reorderAnnotation(list, 't', 'backward').map((a) => a.id), ['r', 't', 'l']);
    assert.deepEqual(reorderAnnotation(list, 't', 'back').map((a) => a.id), ['t', 'r', 'l']);
    assert.equal(reorderAnnotation(list, 'r', 'back'), list);
  });

  it('annotations follow a 90-degree turn and a flip of the image', () => {
    const size = { width: 200, height: 100 };
    assert.deepEqual(rotateAnnotations90([rect], size, 1)[0], { ...rect, x: 60, y: 10, width: 30, height: 40 });
    assert.deepEqual((rotateAnnotations90([line], size, 1)[0] as unknown as { points: number[] }).points, [100, 0, 0, 100]);
    const img: ImageEditorAnnotation = { id: 'i', kind: 'image', x: 0, y: 0, width: 20, height: 10, src: 'x' };
    assert.deepEqual(rotateAnnotations90([img], size, 1)[0], { ...img, x: 85, y: 5, rotation: 90 });
    assert.deepEqual(flipAnnotations([rect], size, 'horizontal')[0], { ...rect, x: 150, rotation: undefined });
    assert.deepEqual(flipAnnotations([{ ...rect, rotation: 30 }], size, 'vertical')[0], { ...rect, y: 60, rotation: 330 });
  });
});

describe('ImageEditor defaults', () => {
  it('exports a frozen default toolbar and locale text with an announce function', () => {
    assert.ok(Object.isFrozen(IMAGE_EDITOR_DEFAULT_TOOLBAR));
    assert.ok(Object.isFrozen(IMAGE_EDITOR_DEFAULT_LOCALE_TEXT));
    assert.ok(IMAGE_EDITOR_DEFAULT_TOOLBAR.includes('redact'));
    assert.equal(IMAGE_EDITOR_DEFAULT_LOCALE_TEXT.announce('rotate', '90°'), 'Image rotated: 90°');
  });
});
