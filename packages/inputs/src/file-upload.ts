'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/file-upload`: file picker, drop
// zone, validation, file list and upload queue. CSS:
// `@salmonui/inputs/file-upload/styles.css`. The reference XMLHttpRequest
// transport is `@salmonui/inputs/file-upload/xhr`.
export { FileUpload } from './file-upload/FileUpload.js';
export type { FileRenderContext, FileUploadApi, FileUploadLocaleText, FileUploadProps } from './file-upload/FileUpload.js';
export { formatFileSize } from './file-upload/format.js';
export type {
  BeforeClearEvent,
  BeforeFileEvent,
  BeforeFilesAddEvent,
  FileEntry,
  FileErrorCode,
  FilePreload,
  FilesChangeDetails,
  FileStatus,
  FileUploadCancelableEvent,
  RemoveTransport,
  UploadContext,
  UploadTransport,
} from './file-upload/store.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/file-upload', 'salmon-file-upload');
