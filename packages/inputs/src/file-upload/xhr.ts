// `@salmonui/inputs/file-upload/xhr`: a reference transport for `FileUpload upload`, one multipart POST
// per file with upload progress and abort through the signal. No React and
// no module-level DOM access: importing it on the server is safe;
// XMLHttpRequest is read only when a file is sent.

import type { UploadContext } from './store.js';

export interface XhrUploaderOptions {
  /** Target URL, or a function of the file. */
  readonly url: string | ((file: File) => string);
  /** Default `'POST'`. */
  readonly method?: string | undefined;
  /** Request headers, or a function of the file (auth tokens, CSRF). */
  readonly headers?: Readonly<Record<string, string>> | ((file: File) => Readonly<Record<string, string>>) | undefined;
  /** Multipart field name of the file. Default `'file'`. */
  readonly fieldName?: string | undefined;
  /** Extra multipart fields sent with each file. */
  readonly data?: Readonly<Record<string, string>> | ((file: File) => Readonly<Record<string, string>>) | undefined;
  /** Sends cookies cross-origin. Default `false`. */
  readonly withCredentials?: boolean | undefined;
}

/** What the transport resolves with: the response status and body text. */
export interface XhrUploadResult {
  readonly status: number;
  readonly body: string;
}

/** Rejection of a non-2xx response, or of a network failure (`status` 0). */
export class XhrUploadError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(status ? `Upload failed with status ${status}` : 'Upload failed: network error');
    this.name = 'XhrUploadError';
    this.status = status;
    this.body = body;
  }
}

function read<T>(value: T | ((file: File) => T) | undefined, file: File): T | undefined {
  return typeof value === 'function' ? (value as (file: File) => T)(file) : value;
}

/**
 * Creates an `upload` transport: `<FileUpload upload={createXhrUploader({ url:
 * '/api/files' })} />`. Resolves with `{ status, body }` on 2xx, rejects with
 * an `XhrUploadError` otherwise and with an `AbortError` when canceled.
 */
export function createXhrUploader(options: XhrUploaderOptions): (file: File, context: UploadContext) => Promise<XhrUploadResult> {
  return (file, { signal, onProgress }) =>
    new Promise<XhrUploadResult>((resolve, reject) => {
      const aborted = (): void => reject(new DOMException('The upload was canceled.', 'AbortError'));
      if (signal.aborted) return aborted();
      const xhr = new XMLHttpRequest();
      const cancel = (): void => xhr.abort();
      const done = (): void => signal.removeEventListener('abort', cancel);
      xhr.open(options.method ?? 'POST', read(options.url, file)!);
      xhr.withCredentials = options.withCredentials === true;
      for (const [k, v] of Object.entries(read(options.headers, file) ?? {})) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
      xhr.onload = () => {
        done();
        const body = typeof xhr.responseText === 'string' ? xhr.responseText : '';
        if (xhr.status >= 200 && xhr.status < 300) resolve({ status: xhr.status, body });
        else reject(new XhrUploadError(xhr.status, body));
      };
      xhr.onerror = () => {
        done();
        reject(new XhrUploadError(0, ''));
      };
      xhr.onabort = () => {
        done();
        aborted();
      };
      signal.addEventListener('abort', cancel);
      const body = new FormData();
      for (const [k, v] of Object.entries(read(options.data, file) ?? {})) body.append(k, v);
      body.append(options.fieldName ?? 'file', file, file.name);
      xhr.send(body);
    });
}
