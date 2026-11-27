// FileUpload: the state machine and
// transport queue in dist/file-upload/store.js driven with fake transports,
// formatFileSize, the reference XHR transport with a fake XMLHttpRequest,
// and the server markup. Interaction tests live in tests/browser/inputs-upload.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { FileUpload, formatFileSize, type FileEntry, type UploadContext } from '@salmonui/inputs/file-upload';
import { createXhrUploader, XhrUploadError } from '@salmonui/inputs/file-upload/xhr';
import { accepts, createFileStore, toEntry, type FileStoreOptions } from '../dist/file-upload/store.js';

const file = (name: string, size = 10, type = 'text/plain'): File => new File([new Uint8Array(size)], name, { type });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

interface Deferred {
  file: File;
  ctx: UploadContext;
  resolve(v?: unknown): void;
  reject(e: unknown): void;
}

/** A store with a manual frame scheduler and a transport whose calls are recorded. */
function setup(options: FileStoreOptions = {}, initial: FileEntry[] = []) {
  const calls: Deferred[] = [];
  const log: string[] = [];
  let frames: (() => void)[] = [];
  let n = 0;
  const store = createFileStore(initial, (flush) => (frames.push(flush), () => (frames = frames.filter((f) => f !== flush))), () => `f${n++}`);
  const upload = (f: File, ctx: UploadContext) =>
    new Promise((resolve, reject) => {
      calls.push({ file: f, ctx, resolve, reject });
    });
  store.setOptions({
    upload,
    multiple: true,
    onFilesChange: (_files, d) => log.push(`change:${d.reason}:${d.source}`),
    ...options,
  });
  const statuses = () => store.getSnapshot().files.map((e) => `${e.name}:${e.status}${e.error ? `:${e.error}` : ''}`);
  const runFrames = () => {
    const f = frames;
    frames = [];
    f.forEach((x) => x());
  };
  return { store, calls, log, statuses, runFrames, frames: () => frames.length };
}

describe('FileUpload validation', () => {
  it('accept matches extensions, wildcard and exact MIME types; other files are invalid with error type', () => {
    assert.equal(accepts('.PDF, image/*', 'a.pdf', ''), true);
    assert.equal(accepts('.pdf,image/*', 'b.png', 'image/png'), true);
    assert.equal(accepts('application/json', 'c.json', 'application/json'), true);
    assert.equal(accepts('.pdf', 'd.txt', 'text/plain'), false);
    assert.equal(accepts(undefined, 'e', ''), true);
    const { store, statuses } = setup({ accept: '.png', upload: undefined });
    store.add([file('a.png'), file('b.txt')], 'picker');
    assert.deepEqual(statuses(), ['a.png:queued', 'b.txt:invalid:type']);
  });

  it('minSize and maxSize reject with tooSmall / tooLarge', () => {
    const { store, statuses } = setup({ minSize: 5, maxSize: 20, upload: undefined });
    store.add([file('s', 2), file('m', 10), file('l', 30)], 'picker');
    assert.deepEqual(statuses(), ['s:invalid:tooSmall', 'm:queued', 'l:invalid:tooLarge']);
  });

  it('maxFiles counts kept valid files and marks the rest tooMany; single mode replaces the list', () => {
    const { store, statuses } = setup({ maxFiles: 2, upload: undefined });
    store.add([file('a'), file('b', 1, 'x/y')], 'picker');
    store.add([file('c'), file('d')], 'drop');
    assert.deepEqual(statuses(), ['a:queued', 'b:queued', 'c:invalid:tooMany', 'd:invalid:tooMany']);
    const single = setup({ multiple: false, upload: undefined });
    single.store.add([file('a'), file('b')], 'picker');
    single.store.add([file('c')], 'picker');
    assert.deepEqual(single.statuses(), ['c:queued']);
  });

  it('onBeforeFilesAdd can veto or edit the files; onFilesChange reports the add', () => {
    let veto = true;
    const { store, statuses, log } = setup({
      upload: undefined,
      onBeforeFilesAdd: (e) => {
        if (veto) e.preventDefault();
        else e.files.splice(0, 1, file('renamed'));
      },
    });
    store.add([file('a')], 'picker');
    assert.deepEqual(statuses(), []);
    veto = false;
    store.add([file('a'), file('b')], 'picker');
    assert.deepEqual(statuses(), ['renamed:queued', 'b:queued']);
    assert.deepEqual(log, ['change:add:pointer']);
  });
});

describe('FileUpload queue', () => {
  it('autoUpload starts the transport; success and error settle each file, then onUploadComplete fires once', async () => {
    const events: string[] = [];
    const { store, calls, statuses } = setup({
      onUploadSuccess: (e, r) => events.push(`ok:${e.name}:${String(r)}`),
      onUploadError: (e, r) => events.push(`err:${e.name}:${String(r)}`),
      onUploadComplete: (files) => events.push(`complete:${files.length}`),
    });
    store.add([file('a'), file('b')], 'picker');
    assert.deepEqual(statuses(), ['a:uploading', 'b:uploading']);
    assert.equal(calls.length, 2);
    assert.ok(calls[0]!.ctx.signal instanceof AbortSignal);
    calls[0]!.resolve('id-1');
    calls[1]!.reject('boom');
    await tick();
    assert.deepEqual(statuses(), ['a:uploaded', 'b:error:upload']);
    assert.equal(store.getSnapshot().files[0]!.result, 'id-1');
    assert.equal(store.getSnapshot().files[1]!.reason, 'boom');
    assert.deepEqual(events, ['ok:a:id-1', 'err:b:boom', 'complete:2']);
  });

  it('concurrency 1 uploads sequentially; default is unlimited', async () => {
    const { store, calls, statuses } = setup({ concurrency: 1 });
    store.add([file('a'), file('b'), file('c')], 'picker');
    assert.deepEqual(statuses(), ['a:uploading', 'b:queued', 'c:queued']);
    calls[0]!.resolve();
    await tick();
    assert.deepEqual(statuses(), ['a:uploaded', 'b:uploading', 'c:queued']);
    calls[1]!.resolve();
    await tick();
    calls[2]!.resolve();
    await tick();
    assert.deepEqual(statuses(), ['a:uploaded', 'b:uploaded', 'c:uploaded']);
  });

  it('autoUpload false keeps files queued until upload(ids?)', () => {
    const { store, calls, statuses } = setup({ autoUpload: false });
    store.add([file('a'), file('b')], 'picker');
    assert.deepEqual(statuses(), ['a:queued', 'b:queued']);
    store.upload([store.getSnapshot().files[1]!.id]);
    assert.deepEqual(statuses(), ['a:queued', 'b:uploading']);
    store.upload();
    assert.equal(calls.length, 2);
  });

  it('onBeforeUpload can veto one file', () => {
    const { store, statuses } = setup({ onBeforeUpload: (e) => e.file.name === 'b' && e.preventDefault() });
    store.add([file('a'), file('b')], 'picker');
    assert.deepEqual(statuses(), ['a:uploading', 'b:queued']);
  });

  it('progress is coalesced to one update per frame and fires onUploadProgress', () => {
    const seen: number[] = [];
    const { store, calls, runFrames, frames, log } = setup({ onUploadProgress: (e) => seen.push(e.progress) });
    store.add([file('a', 100)], 'picker');
    log.length = 0;
    calls[0]!.ctx.onProgress(10, 100);
    calls[0]!.ctx.onProgress(30, 100);
    calls[0]!.ctx.onProgress(50, 100);
    assert.equal(frames(), 1);
    assert.equal(store.getSnapshot().files[0]!.progress, 0);
    runFrames();
    assert.equal(store.getSnapshot().files[0]!.progress, 0.5);
    assert.deepEqual(seen, [0.5]);
    assert.deepEqual(log, ['change:progress:api']);
  });

  it('cancel aborts the signal and marks canceled; retry re-runs the transport', async () => {
    const { store, calls, statuses } = setup();
    store.add([file('a')], 'picker');
    const id = store.getSnapshot().files[0]!.id;
    store.cancel(id);
    assert.equal(calls[0]!.ctx.signal.aborted, true);
    calls[0]!.reject(new Error('aborted'));
    await tick();
    assert.deepEqual(statuses(), ['a:canceled']);
    store.retry(id);
    assert.deepEqual(statuses(), ['a:uploading']);
    assert.equal(calls.length, 2);
    calls[1]!.reject('x');
    await tick();
    store.retry(id);
    calls[2]!.resolve();
    await tick();
    assert.deepEqual(statuses(), ['a:uploaded']);
  });

  it('onBeforeRemove can veto; the remove hook runs for uploaded files and failures keep the file with error remove', async () => {
    let veto = true;
    const removed: string[] = [];
    let fail = false;
    const { store, statuses } = setup({
      onBeforeRemove: (e) => veto && e.preventDefault(),
      remove: async (e, { signal }) => {
        assert.ok(signal instanceof AbortSignal);
        removed.push(e.name);
        if (fail) throw new Error('nope');
      },
    }, [toEntry({ name: 'done.pdf', size: 3 }, 'p0'), toEntry({ name: 'two.pdf', size: 3 }, 'p1')]);
    store.remove('p0');
    assert.deepEqual(statuses(), ['done.pdf:uploaded', 'two.pdf:uploaded']);
    veto = false;
    store.remove('p0');
    await tick();
    assert.deepEqual(statuses(), ['two.pdf:uploaded']);
    fail = true;
    store.remove('p1');
    await tick();
    assert.deepEqual(statuses(), ['two.pdf:uploaded:remove']);
    assert.deepEqual(removed, ['done.pdf', 'two.pdf']);
  });

  it('clear honors onBeforeClear and aborts uploads; getSnapshot lists the files', () => {
    let veto = true;
    const { store, calls, log } = setup({ onBeforeClear: (e) => (assert.equal(e.files.length, 1), veto && e.preventDefault()) });
    store.add([file('a')], 'picker');
    store.clear();
    assert.equal(store.getSnapshot().files.length, 1);
    veto = false;
    store.clear(true);
    assert.equal(store.getSnapshot().files.length, 0);
    assert.equal(calls[0]!.ctx.signal.aborted, true);
    assert.equal(log.at(-1), 'change:clear:api');
  });

  it('preloaded entries default to status uploaded with progress 1; reset restores them', () => {
    const pre = toEntry({ name: 'report.pdf', size: 2048 }, 'p0');
    assert.deepEqual(pre, { file: null, type: '', path: 'report.pdf', status: 'uploaded', progress: 1, error: null, name: 'report.pdf', size: 2048, id: 'p0' });
    const { store, statuses, log } = setup({}, [pre]);
    store.add([file('a')], 'picker');
    store.reset([pre]);
    assert.deepEqual(statuses(), ['report.pdf:uploaded']);
    assert.equal(log.at(-1), 'change:reset:api');
  });
});

describe('formatFileSize', () => {
  it('binary steps with Intl unit names in the given locale', () => {
    assert.equal(formatFileSize(0), '0 bytes');
    assert.equal(formatFileSize(1536, 'en-US'), '1.5 kB');
    assert.equal(formatFileSize(5 * 1024 * 1024), '5 MB');
    assert.match(formatFileSize(2.5 * 1024 ** 3, 'de-DE'), /^2,5\sGB$/);
    assert.match(formatFileSize(1, 'de-DE'), /^1\sByte$/);
    assert.equal(formatFileSize(Number.NaN), '0 bytes');
  });
});

describe('createXhrUploader', () => {
  class FakeXhr {
    static last: FakeXhr | null = null;
    method = '';
    url = '';
    headers: Record<string, string> = {};
    withCredentials = false;
    body: FormData | null = null;
    status = 0;
    responseText = '';
    aborted = false;
    upload: { onprogress: ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send(body: FormData) {
      this.body = body;
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
  }
  const g = globalThis as { XMLHttpRequest?: unknown };

  it('posts multipart with the field name, headers and extra data; progress, 2xx resolve, errors reject, abort cancels', async () => {
    g.XMLHttpRequest = FakeXhr;
    try {
      const send = createXhrUploader({ url: (f) => `/files/${f.name}`, headers: { 'X-Token': 't' }, fieldName: 'doc', data: { folder: 'x' }, withCredentials: true });
      const progress: number[][] = [];
      const ok = send(file('a.txt', 4), { signal: new AbortController().signal, onProgress: (l, t) => progress.push([l, t]) });
      const xhr = FakeXhr.last!;
      assert.equal(xhr.method, 'POST');
      assert.equal(xhr.url, '/files/a.txt');
      assert.deepEqual(xhr.headers, { 'X-Token': 't' });
      assert.equal(xhr.withCredentials, true);
      assert.equal((xhr.body!.get('doc') as File).name, 'a.txt');
      assert.equal(xhr.body!.get('folder'), 'x');
      xhr.upload.onprogress!({ loaded: 2, total: 4, lengthComputable: true });
      xhr.status = 201;
      xhr.responseText = '{"id":1}';
      xhr.onload!();
      assert.deepEqual(await ok, { status: 201, body: '{"id":1}' });
      assert.deepEqual(progress, [[2, 4]]);

      const bad = send(file('b'), { signal: new AbortController().signal, onProgress: () => {} });
      FakeXhr.last!.status = 500;
      FakeXhr.last!.onload!();
      await assert.rejects(bad, (e: unknown) => e instanceof XhrUploadError && e.status === 500);

      const net = send(file('c'), { signal: new AbortController().signal, onProgress: () => {} });
      FakeXhr.last!.onerror!();
      await assert.rejects(net, (e: unknown) => e instanceof XhrUploadError && e.status === 0);

      const controller = new AbortController();
      const canceled = send(file('d'), { signal: controller.signal, onProgress: () => {} });
      controller.abort();
      assert.equal(FakeXhr.last!.aborted, true);
      await assert.rejects(canceled, { name: 'AbortError' });
    } finally {
      delete g.XMLHttpRequest;
    }
  });
});

describe('FileUpload markup', () => {
  it('a native file input with name, multiple, accept and capture behind a drop zone button', () => {
    const out = renderToString(h(FileUpload, { name: 'docs', label: 'Documents', multiple: true, accept: '.pdf', capture: 'environment', required: true }));
    assert.match(out, /<input[^>]*type="file"[^>]*name="docs"/);
    assert.match(out, /<input[^>]*multiple=""/);
    assert.match(out, /<input[^>]*accept=".pdf"/);
    assert.match(out, /<input[^>]*capture="environment"/);
    assert.match(out, /<input[^>]*required=""/);
    assert.match(out, /<button type="button" class="salmon-file-upload-trigger"[^>]*aria-labelledby="[^"]*label [^"]*t"/);
    assert.match(out, /Browse or drop files/);
    assert.match(out, /role="status" aria-live="polite"/);  });

  it('directory adds webkitdirectory and multiple', () => {
    const out = renderToString(h(FileUpload, { 'aria-label': 'x', directory: true }));
    assert.match(out, /webkitdirectory=""/);
    assert.match(out, /multiple=""/);
  });

  it('preloaded files render as uploaded; showFileList false hides the list', () => {
    const defaultFiles = [{ name: 'report.pdf', size: 1536 }];
    const out = renderToString(h(FileUpload, { label: 'Files', defaultFiles }));
    assert.match(out, /<li class="salmon-file-upload-item" data-status="uploaded">/);
    assert.match(out, /report\.pdf/);
    assert.match(out, /1\.5 kB · Uploaded/);
    assert.match(out, /aria-label="Remove report\.pdf"/);
    assert.doesNotMatch(renderToString(h(FileUpload, { label: 'Files', defaultFiles, showFileList: false })), /<ul/);
  });

  it('renderFile renders each item from its context', () => {
    const out = renderToString(h(FileUpload, { 'aria-label': 'x', defaultFiles: [{ name: 'a.txt', size: 2 }], renderFile: (c) => h('b', null, `${c.file.name}|${c.status}|${c.progress}|${c.sizeText}|${typeof c.retry}`) }));
    assert.match(out, /<b>a\.txt\|uploaded\|1\|2 bytes\|function<\/b>/);
  });

  it('localeText renames the trigger, buttons and statuses; renderTrigger replaces the trigger content', () => {
    const out = renderToString(
      h(FileUpload, {
        label: 'Dateien',
        locale: 'de-DE',
        defaultFiles: [{ name: 'a.txt', size: 2048 }, { name: 'b.exe', size: 1, status: 'invalid', error: 'type' }],
        localeText: { browse: 'Dateien wählen', clearAll: 'Leeren', removeFile: '{0} entfernen', uploaded: 'Hochgeladen', type: 'Dateityp nicht erlaubt' },
      }),
    );
    assert.match(out, /Dateien wählen/);
    assert.match(out, />Leeren</);
    assert.match(out, /aria-label="a\.txt entfernen"/);
    assert.match(out, /2 kB · Hochgeladen/);
    assert.match(out, /Dateityp nicht erlaubt/);
    assert.match(renderToString(h(FileUpload, { 'aria-label': 'x', renderTrigger: ({ text }) => h('i', null, `[${text}]`) })), /<i>\[Browse or drop files\]<\/i>/);
  });

  it('the upload button shows only with a transport, autoUpload false and queued files', () => {
    const queued = [{ id: 'q', name: 'a', size: 1, status: 'queued' as const }];
    const upload = async () => undefined;
    assert.match(renderToString(h(FileUpload, { 'aria-label': 'x', defaultFiles: queued, upload, autoUpload: false })), /data-action="uploadAll"/);
    assert.doesNotMatch(renderToString(h(FileUpload, { 'aria-label': 'x', defaultFiles: queued, upload })), /data-action="uploadAll"/);
    assert.match(renderToString(h(FileUpload, { 'aria-label': 'x', defaultFiles: queued, upload })), /aria-label="Cancel a"/);
  });

  it('per-file buttons are named with the file name; the error state is tied to the trigger', () => {
    const out = renderToString(h(FileUpload, { label: 'F', invalid: true, errorMessage: 'Pick a file', upload: async () => 1, defaultFiles: [{ id: 'e', name: 'x.png', size: 1, status: 'error', error: 'upload' }] }));
    assert.match(out, /aria-label="Retry x\.png"/);
    assert.match(out, /aria-label="Remove x\.png"/);
    assert.match(out, /Upload failed/);
    assert.match(out, /<button type="button" class="salmon-file-upload-trigger"[^>]*aria-invalid="true"/);
    assert.match(out, /Pick a file/);
  });
});
