// Type contract of `@salmonui/inputs/file-upload` and `/file-upload/xhr`.
// Compiles against dist/*.d.ts.
import { useRef } from 'react';
import { FileUpload, formatFileSize, type FileEntry, type FileRenderContext, type FilesChangeDetails, type FileStatus, type FileUploadApi, type UploadTransport } from '@salmonui/inputs/file-upload';
import { createXhrUploader, type XhrUploadResult } from '@salmonui/inputs/file-upload/xhr';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

expectType<Equal<ReturnType<typeof formatFileSize>, string>>(true);
expectType<Equal<FileStatus, 'queued' | 'uploading' | 'uploaded' | 'error' | 'canceled' | 'invalid'>>(true);

// The XHR transport fits the upload prop and resolves with status and body.
const xhr = createXhrUploader({ url: '/api/files', headers: { 'X-CSRF': 't' }, fieldName: 'file', withCredentials: true });
expectType<Equal<Awaited<ReturnType<typeof xhr>>, XhrUploadResult>>(true);
export const transport: UploadTransport = xhr;

export function Api() {
  const api = useRef<FileUploadApi>(null);
  const files = (list: readonly FileEntry[], details: FilesChangeDetails) => [list.length, details.reason, details.source];
  return (
    <FileUpload
      ref={api}
      name="files"
      multiple
      accept=".pdf,image/*"
      maxSize={1024}
      maxFiles={3}
      upload={async (file, { signal, onProgress }) => (onProgress(1, file.size), signal.aborted)}
      autoUpload={false}
      concurrency={1}
      dropEffect="copy"
      capture="environment"
      defaultFiles={[{ name: 'report.pdf', size: 10 }]}
      onFilesChange={files}
      onBeforeFilesAdd={(e) => (e.files.pop(), e.preventDefault())}
      onBeforeUpload={(e) => e.file.status === 'queued' && e.preventDefault()}
      onUploadSuccess={(entry, result: unknown) => [entry.id, result]}
      renderFile={(ctx: FileRenderContext) => <span onClick={ctx.retry}>{ctx.file.name}</span>}
      localeText={{ browse: 'Pick', removeFile: 'Remove {0}', tooLarge: 'Too big: {0}' }}
    />
  );
}

// @ts-expect-error dropEffect is a closed union
export const badEffect = <FileUpload dropEffect="default" />;
// @ts-expect-error files need a name and size
export const badFiles = <FileUpload defaultFiles={[{ id: 'x' }]} />;
// @ts-expect-error unknown localeText key
export const badText = <FileUpload localeText={{ browseFiles: 'x' }} />;
