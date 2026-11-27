// FileUpload sections of examples/vite-spa/inputs.html (IN7,
// tests/browser/inputs-upload.spec.ts):
//
//   upload-native  form submission without a transport, reset, required
//   upload-queue   fake transport driven by window.__upload, validation, events
//   upload-manual  autoUpload false, external dropTarget, dropEffect 'move'
//   upload-dir     directory picks and drops
//   upload-xhr     createXhrUploader against a route the test intercepts
//   upload-states  one preloaded file per status (axe-core coverage)
//   upload-perf    mounts a 500-file list on demand
import { useLayoutEffect, useRef, useState } from 'react';
import { FileUpload, type FileEntry, type FileUploadApi, type UploadTransport } from '@salmonui/inputs/file-upload';
import { createXhrUploader } from '@salmonui/inputs/file-upload/xhr';
import { Form } from '@salmonui/inputs/form';
import { entries, log, Section } from './inputs-shared.tsx';
import '@salmonui/inputs/file-upload/styles.css';
import '@salmonui/inputs/form/styles.css';

interface Pending {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  onProgress(loaded: number, total: number): void;
}

declare global {
  interface Window {
    __upload?: {
      readonly pending: () => string[];
      progress(name: string, loaded: number, total: number): void;
      resolve(name: string, value?: unknown): void;
      reject(name: string): void;
      api: () => FileUploadApi | null;
    };
    __perf?: { start: number; mount: number | null; frame?: number };
  }
}

const pending = new Map<string, Pending>();
const fake: UploadTransport = (file, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    pending.set(file.name, { resolve, reject, onProgress });
    signal.addEventListener('abort', () => {
      pending.delete(file.name);
      log({ kind: 'abort', name: file.name });
      reject(new DOMException('canceled', 'AbortError'));
    });
  });
const summary = (files: readonly FileEntry[]) => files.map((e) => `${e.name}:${e.status}${e.error ? `:${e.error}` : ''}`);

function Queue() {
  const api = useRef<FileUploadApi>(null);
  window.__upload = {
    pending: () => [...pending.keys()],
    progress: (name, loaded, total) => pending.get(name)?.onProgress(loaded, total),
    resolve: (name, value = 'ok') => (pending.get(name)?.resolve(value), pending.delete(name)),
    reject: (name) => (pending.get(name)?.reject(new Error('server said no')), pending.delete(name)),
    api: () => api.current,
  };
  return (
    <FileUpload
      ref={api}
      id="upq"
      label="Queue"
      description="Text and images up to 1 KB, three files"
      multiple
      accept=".txt,image/*"
      maxSize={1000}
      maxFiles={3}
      concurrency={2}
      upload={fake}
      onFilesChange={(files, d) => log({ kind: 'files', reason: d.reason, files: summary(files) })}
      onBeforeFilesAdd={(e) => {
        const veto = e.files.findIndex((f) => f.name === 'veto.txt');
        if (veto >= 0) e.files.splice(veto, 1);
      }}
      onUploadProgress={(e) => log({ kind: 'progress', name: e.name, progress: e.progress })}
      onUploadSuccess={(e, r) => log({ kind: 'success', name: e.name, result: r })}
      onUploadError={(e) => log({ kind: 'error', name: e.name })}
      onUploadComplete={(files) => log({ kind: 'complete', files: summary(files) })}
      onBeforeRemove={(e) => {
        log({ kind: 'beforeRemove', name: e.file.name });
        if (e.file.name === 'keep.txt') e.preventDefault();
      }}
      onBeforeClear={(e) => log({ kind: 'beforeClear', count: e.files.length })}
    />
  );
}

function Manual() {
  const zone = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={zone} id="upm-zone" style={{ padding: 24, border: '1px dashed currentColor', inlineSize: 240 }}>
        External drop area
      </div>
      <FileUpload id="upm" label="Manual" multiple autoUpload={false} upload={fake} dropTarget={zone} dropEffect="move" onFilesChange={(files, d) => log({ kind: 'manual', reason: d.reason, files: summary(files) })} />
    </>
  );
}

function Perf() {
  const [shown, setShown] = useState(false);
  const files = useRef(Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: `file-${i}.pdf`, size: 1024 * (i + 1) })));
  useLayoutEffect(() => {
    const perf = window.__perf;
    if (!shown || !perf) return;
    perf.mount = performance.now() - perf.start;
    // Style, layout and paint of the list land before the next frame.
    requestAnimationFrame(() => (perf.frame = performance.now() - perf.start));
  }, [shown]);
  return (
    <>
      <button
        type="button"
        id="perf-mount"
        onClick={() => {
          window.__perf = { start: performance.now(), mount: null };
          setShown(true);
        }}
      >
        Mount 500 files
      </button>
      {shown ? <FileUpload id="upp" label="Many files" multiple defaultFiles={files.current} /> : null}
    </>
  );
}

export function UploadSection() {
  return (
    <>
      <Section id="upload-native" title="FileUpload: native submission">
        <Form
          id="upload-form"
          onSubmit={(e) => {
            e.preventDefault();
            window.__inputForms!['upload'] = entries(e.currentTarget);
            log({ kind: 'submit', form: 'upload' });
          }}
        >
          <FileUpload id="upn" name="docs" label="Documents" multiple required defaultFiles={[{ name: 'existing.pdf', size: 2048 }]} />
          <button type="submit" id="upload-submit">
            Send
          </button>
          <button type="reset" id="upload-reset">
            Reset
          </button>
        </Form>
      </Section>
      <Section id="upload-queue" title="FileUpload: transport queue">
        <Queue />
      </Section>
      <Section id="upload-manual" title="FileUpload: manual upload and external drop area">
        <Manual />
      </Section>
      <Section id="upload-dir" title="FileUpload: directory">
        <FileUpload id="upd" label="Folder" directory onFilesChange={(files) => log({ kind: 'dir', paths: files.map((e) => e.path) })} />
      </Section>
      <Section id="upload-xhr" title="FileUpload: XHR transport">
        <FileUpload id="upx" label="XHR" upload={createXhrUploader({ url: '/__upload', fieldName: 'attachment', headers: { 'X-Test': '1' } })} onUploadSuccess={(e, r) => log({ kind: 'xhr', name: e.name, result: r })} onUploadError={(e) => log({ kind: 'xhrError', name: e.name })} />
      </Section>
      <Section id="upload-states" title="FileUpload: every status">
        <FileUpload
          id="ups"
          label="States"
          multiple
          upload={fake}
          maxSize={1000}
          defaultFiles={[
            { id: 's1', name: 'done.pdf', size: 2048 },
            { id: 's2', name: 'sending.pdf', size: 4096, status: 'uploading', progress: 0.4 },
            { id: 's3', name: 'waiting.pdf', size: 10, status: 'queued' },
            { id: 's4', name: 'failed.pdf', size: 10, status: 'error', error: 'upload' },
            { id: 's5', name: 'stopped.pdf', size: 10, status: 'canceled' },
            { id: 's6', name: 'huge.pdf', size: 5000, status: 'invalid', error: 'tooLarge' },
          ]}
        />
      </Section>
      <Section id="upload-perf" title="FileUpload: 500 files">
        <Perf />
      </Section>
    </>
  );
}
