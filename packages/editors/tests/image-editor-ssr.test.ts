// ImageEditor server rendering: renders through
// react-dom/server with DOM globals removed. The shell (toolbar, canvas,
// keyboard hint, live region, status message) is stable and reads no browser
// global during render.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'OffscreenCanvas', 'ImageData', 'createImageBitmap']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement } = await import('react');
const h = createElement as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => import('react').ReactElement;
const { renderToString } = await import('react-dom/server');
const { ImageEditor, IMAGE_EDITOR_DEFAULT_TOOLBAR } = await import('@salmonui/editors/image-editor');

describe('ImageEditor SSR', () => {
  it('renders a stable shell: toolbar, labelled canvas, keyboard hint, live region, loading message', () => {
    const props = { src: '/photo.png', className: 'extra', style: { width: 640, height: 400 }, 'data-testid': 'ie' };
    const html = renderToString(h(ImageEditor, props));
    assert.equal(html, renderToString(h(ImageEditor, props)));
    assert.match(html, /^<div (?=[^>]*data-testid="ie")(?=[^>]*style="width:640px;height:400px")[^>]*class="salmon-image-editor extra" data-status="loading" data-tool="select">/);
    assert.match(html, /role="toolbar" aria-orientation="horizontal" aria-label="Image editing"|aria-label="Image editing"[^>]*role="toolbar"/);
    assert.match(html, /<canvas class="salmon-image-editor-canvas" role="img" aria-label="Edited image" aria-describedby="[^"]+" tabindex="0">/);
    assert.match(html, /class="salmon-visually-hidden">Arrow keys move the selection/);
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(html, /<div class="salmon-image-editor-message" data-status="loading">Loading image<\/div>/);
    // Tools are disabled until the image loads; Open stays enabled.
    assert.match(html, /aria-label="Crop" title="Crop" aria-pressed="false" data-item="crop"[^>]*disabled=""/);
    assert.doesNotMatch(html, /aria-label="Open image"[^>]*disabled/);
    // No panel, no quick toolbar and no text editor on the server.
    assert.doesNotMatch(html, /salmon-image-editor-panel|salmon-image-editor-quick|<textarea/);
  });

  it('localeText, part classNames, an empty editor and the save item only with onSave', () => {
    const html = renderToString(h(ImageEditor, { localeText: { toolbar: 'Bildbearbeitung', canvas: 'Bild', empty: 'Kein Bild', crop: 'Zuschneiden' }, classNames: { toolbar: 'tb', canvas: 'cv', stage: 'st' } }));
    assert.match(html, /aria-label="Bildbearbeitung"/);
    assert.match(html, /class="salmon-image-editor-canvas cv" role="img" aria-label="Bild"/);
    assert.match(html, /salmon-image-editor-stage st/);
    assert.match(html, /aria-label="Zuschneiden"/);
    assert.match(html, /data-status="empty">Kein Bild</);
    assert.doesNotMatch(html, /aria-label="Save"/);
    assert.match(renderToString(h(ImageEditor, { onSave: () => {} })), /aria-label="Save"/);
  });

  it('toolbar={false}, custom items and renderToolbar', () => {
    assert.doesNotMatch(renderToString(h(ImageEditor, { toolbar: false })), /role="toolbar"/);
    const custom = renderToString(h(ImageEditor, { toolbar: ['crop', '|', { id: 'stamp', label: 'Stamp' }] }));
    assert.match(custom, /data-item="stamp"[^>]*><span class="salmon-button__label">Stamp<\/span><\/button>/);
    assert.match(custom, /role="separator"/);
    assert.doesNotMatch(custom, /aria-label="Rotate left"/);
    const replaced = renderToString(h(ImageEditor, { renderToolbar: (toolbar: unknown) => h('header', { className: 'mine' }, toolbar as never) }));
    assert.match(replaced, /<header class="mine"><div role="toolbar"|<header class="mine"><div[^>]*role="toolbar"/);
    assert.ok(IMAGE_EDITOR_DEFAULT_TOOLBAR.length > 20);  });
});
