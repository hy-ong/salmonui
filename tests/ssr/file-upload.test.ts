// test:ssr for `@salmonui/inputs/file-upload` and `/file-upload/xhr`:
// both entries evaluate in
// Node with the DOM-like globals removed; FileUpload renders preloaded files
// deterministically and the live region is present but empty.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'CSS', 'DataTransfer', 'XMLHttpRequest'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { FileUpload, formatFileSize } = await import('@salmonui/inputs/file-upload');
const { createXhrUploader } = await import('@salmonui/inputs/file-upload/xhr');

describe('FileUpload SSR without DOM globals', () => {
  it('renders the input, trigger, preloaded list and an empty live region deterministically', () => {
    const el = h(StrictMode, null, h(FileUpload, { name: 'files', label: 'Attachments', description: 'PDF only', multiple: true, accept: '.pdf', defaultFiles: [{ name: 'a.pdf', size: 1024 }, { name: 'b.pdf', size: 3 * 1024 * 1024 }], upload: async () => null }));
    const a = renderToString(el);
    assert.equal(renderToString(el), a);
    assert.match(a, /type="file"/);
    assert.match(a, /class="salmon-file-upload-trigger"/);
    assert.equal([...a.matchAll(/<li /g)].length, 2);
    assert.match(a, /1 kB · Uploaded/);
    assert.match(a, /3 MB · Uploaded/);
    assert.match(a, /role="status" aria-live="polite"><\/div>/);
    assert.equal(formatFileSize(10), '10 bytes');
    assert.equal(typeof createXhrUploader({ url: '/u' }), 'function');
  });

  it('showFileList false renders no list', () => {
    assert.doesNotMatch(renderToString(h(FileUpload, { 'aria-label': 'x', showFileList: false, defaultFiles: [{ name: 'a', size: 1 }] })), /<ul/);
  });
});
