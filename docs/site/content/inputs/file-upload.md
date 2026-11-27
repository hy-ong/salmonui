---
title: FileUpload
description: File picker with a drop zone, validation, a file list and an optional upload queue from @salmonui/inputs/file-upload, on a native file input so files submit with the form.
category: Components
order: 60
demos: [file-upload-basics, file-upload-queue, file-upload-custom, file-upload-events, file-upload-large]
---

`FileUpload` is a file picker with an optional upload queue. It renders a real
`<input type="file">` (visually hidden; it carries the files), a drop zone
`<button>` that opens the picker and accepts drops, the file list and one
polite live region. The label, description and error come from the shared
[Field](/docs/inputs/field) parts.

```tsx
import { FileUpload } from '@salmonui/inputs/file-upload';
import '@salmonui/inputs/file-upload/styles.css';

// Files submit with the form: no upload request.
<FileUpload name="attachments" label="Attachments" multiple accept=".pdf,image/*" maxSize={2_000_000} />
```

<!-- demo: file-upload-basics -->

## Two modes

- **Without `upload`** the component is a styled native file input. Picked
  and dropped files are mirrored into the input's `files`, so `FormData`,
  `<form action={fn}>` and React 19 server actions receive them; removed and
  invalid files are taken out of the input. `required`
  is the native constraint: it is met by files in the input, not by
  preloaded entries.
- **With `upload`** every valid file goes through a transport queue:
`upload(file, { signal, onProgress })` returns a promise that
  resolves when the server accepted the file. Omit `name` when you upload
  with a transport, or the files are also submitted with the form.

```tsx
import { createXhrUploader } from '@salmonui/inputs/file-upload/xhr';

const upload = createXhrUploader({ url: '/api/files', fieldName: 'file', headers: { 'X-CSRF-Token': token } });

<FileUpload label="Photos" multiple accept="image/*" upload={upload} concurrency={2} />
```

<!-- demo: file-upload-queue -->

## File states

Each entry (`FileEntry`: `id`, `name`, `size`, `type`, `file`, `path`,
`status`, `progress`, `error`, `reason`, `result`) moves through
`queued` → `uploading` → `uploaded` | `error` | `canceled`; files rejected by
validation are `invalid` with an `error` code:

| Error code | Cause |
| --- | --- |
| `type` | not matched by `accept` (extensions such as `.pdf`, `image/*`, exact MIME types) |
| `tooSmall` / `tooLarge` | below `minSize` / above `maxSize` bytes |
| `tooMany` | beyond `maxFiles` valid files |
| `upload` | the transport rejected (status `error`) |
| `remove` | the `remove` hook rejected; the file stays |

## Queue

- `autoUpload` (default `true`) starts valid files as soon as they are
  added; with `false` an Upload button and `api.upload(ids?)` start them.
- `concurrency` limits parallel uploads; `1` is sequential, the default is
  unlimited.
- Progress from `onProgress(loaded, total)` is applied at most once per
  animation frame and shown as a `<progress>` per file.
- `api.cancel(id)` and the per-file cancel button abort the transport's
  `AbortSignal`; `api.retry(id)` and the retry button re-run the
  transport for an `error` or `canceled` file.
- `onUploadComplete(files)` fires when the queue drains.

## Drop zone and folders

The drop zone button accepts drops; `dropTarget` (a ref) makes another
element the drop area. `dropEffect` (`'copy'`, `'move'`, `'link'`,
`'none'`; default `'copy'`) is set on `dataTransfer` while dragging, and
`'none'` refuses drops. The root carries `data-dragging` during a
drag; it is a DOM attribute, so dragging never re-renders React.
`directory` adds `webkitdirectory` to the input and walks dropped folders
recursively with `webkitGetAsEntry()`; each entry's `path` is
folder-relative. On touch devices the button opens the mobile
picker; `capture` passes through for camera capture.

## File list

`showFileList` (default `true`) shows the list. `renderFile(ctx)`
renders the content of each item with `{ file, status, progress, error,
statusText, sizeText, remove, retry, cancel }`. `renderTrigger({ open, text })`
replaces the drop zone content and `localeText` renames every string.
The order is the order of `files`: sort a controlled list to sort
the view (see below).

`files` / `defaultFiles` / `onFilesChange(files, { source, reason })` hold
the list. Without `files` the component keeps the
list itself (uncontrolled, starting from `defaultFiles`); with `files` you
own it and write back what `onFilesChange` reports. Preloaded entries need
only `name` and `size` and default to status `'uploaded'`; `source` is
`'pointer'` or `'api'` and `reason` is `'add'`, `'remove'`, `'clear'`,
`'status'`, `'progress'` or `'reset'`. A form `reset` aborts uploads and
restores `defaultFiles`.

`localeText` keys are the drop zone text (`browse`), the
toolbar buttons (`uploadAll`, `clearAll`), the per-file button names
(`removeFile`, `cancelFile`, `retryFile`), the live-region count
(`filesAdded`), one per status (`queued`, `uploading`, `uploaded`,
`error`, `canceled`) and one per error code (`type`, `tooSmall`,
`tooLarge`, `tooMany`, `upload`, `remove`); `{0}` is the file name, the
limit or the count.

<!-- demo: file-upload-custom -->

`formatFileSize(bytes, locale)` formats sizes with 1024 steps and
`Intl.NumberFormat` unit names (`formatFileSize(1536)` is `"1.5 kB"`); the component uses it with its `locale` prop (default `'en-US'`,
never the host locale, so server and client agree).

## Events

| Event | Cancellable | When |
| --- | --- | --- |
| `onBeforeFilesAdd({ files, source })` | yes; `files` is mutable | before picked or dropped files join the list |
| `onFilesChange(files, details)` | no | after every list change |
| `onBeforeUpload({ file })` | yes | before the transport starts for a file; request parameters belong to the transport |
| `onUploadProgress(file)` | no | once per frame while uploading |
| `onUploadSuccess(file, result)`, `onUploadError(file, reason)` | no | when a file settles |
| `onUploadComplete(files)` | no | when the queue drains |
| `onBeforeRemove({ file })` | yes | before a file is removed; then the optional `remove(file, { signal })` hook runs for uploaded files |
| `onBeforeClear({ files })` | yes | before Clear or `api.clear()` |

`onBeforeFilesAdd` reports `source` (`'picker'`, `'drop'` or `'api'`);
remove entries from its `files` array to drop them from the batch, or call
`preventDefault()` to drop the whole batch. A file whose `onBeforeUpload`
was prevented stays `queued`. `api.getFiles()` returns the current entries
 and `api.remove(id)` / `api.clear()` run the same cancellable
events as the buttons.

<!-- demo: file-upload-events -->

## Keyboard

| Key | Action |
| --- | --- |
| Tab | Moves to the drop zone button, then Upload, Clear and each file's retry, cancel and remove buttons |
| Enter / Space on the drop zone | Opens the file picker |
| Enter / Space on a file button | Retries, cancels or removes that file |

Screen readers hear the drop zone as a button named by the label and its
text, described by the description and error. Per-file buttons are named
with the file name ("Remove report.pdf"), and settled statuses ("report.pdf:
Uploaded", "photo.png: File type not allowed") are announced through one
polite live region.

## Performance

A list of 500 files mounts within 50 ms (`tests/browser/inputs-upload.spec.ts`); a progress update re-renders only
its file's item. The subpath is about 6.5 KB gzip including the shared
field code (over the 6 KB design cap, gated at 6.8 KB; see the bundle
report), the stylesheet 1.5 KB and `file-upload/xhr` 0.7 KB.

<!-- demo: file-upload-large -->

## Server rendering

The label, drop zone, preloaded file list and live region render on the
server with the same markup as the first client render: ids come from
`useId`, sizes are formatted with the `locale` prop (default `'en-US'`,
never the host locale) and drag state is a DOM attribute, never React
state. Picked files exist only on the client. `@salmonui/inputs/file-upload/xhr`
has no React or DOM code at import time, so a server module can import it.

## Design notes

- (the upload server
  protocol: save and remove URLs, chunking, pause and resume, retries,
  chunk events). There is no Salmon-defined wire format: it would be one
  more protocol to version and host, while resumable uploads already have
  mature protocols (tus, S3 multipart, GCS resumable). The component owns
  the queue, progress and cancellation; the transport owns the wire. For a
  plain POST, pass `upload={createXhrUploader({ url })}`; for chunking,
  pause, resume and retries, use a resumable-upload client inside a custom
  `upload` function (it receives the `AbortSignal` and reports
  `onProgress`); delete files on the server in the `remove(file, { signal })`
  hook or the `onFilesChange` handler.
- there is no sort method. Sorting is a view of the `files` array
  the owner controls, so the list follows the order of `files`; sort it
  with `setFiles((f) => [...f].sort(byName))` on a controlled `files`.

## API

Every exported symbol and type is listed in the reference:
[`@salmonui/inputs/file-upload`](/docs/reference/inputs/file-upload) and
[`@salmonui/inputs/file-upload/xhr`](/docs/reference/inputs/file-upload-xhr).

| Prop | Type | Default |
| --- | --- | --- |
| `files`, `defaultFiles` | `(FileEntry \| { name, size, ... })[]` | `[]` |
| `onFilesChange` | `(files, { source, reason }) => void` | |
| `accept` | `string` | any |
| `multiple`, `directory` | `boolean` | `false` |
| `minSize`, `maxSize` | `number` (bytes) | |
| `maxFiles` | `number` | unlimited (`1` without `multiple`) |
| `upload` | `(file, { signal, onProgress }) => Promise<unknown>` | none: files submit with the form |
| `remove` | `(file, { signal }) => Promise<unknown>` | |
| `autoUpload` | `boolean` | `true` |
| `concurrency` | `number` | unlimited |
| `dropTarget` | `RefObject<Element \| null>` | the drop zone |
| `dropEffect` | `'copy' \| 'move' \| 'link' \| 'none'` | `'copy'` |
| `showFileList` | `boolean` | `true` |
| `renderFile`, `renderTrigger` | see above | |
| `label`, `description`, `errorMessage`, `invalid`, `validation`, `validateOn`, `size` | as in [Field](/docs/inputs/field) | |
| `localeText` | `{ browse, uploadAll, clearAll, removeFile, cancelFile, retryFile, filesAdded, queued, uploading, uploaded, error, canceled, type, tooSmall, tooLarge, tooMany, upload, remove, validation* }` | English |
| `onBeforeFilesAdd`, `onBeforeUpload`, `onBeforeRemove`, `onBeforeClear`, `onUploadProgress`, `onUploadSuccess`, `onUploadError`, `onUploadComplete` | see [Events](#events) | |
| `locale` | `string` | `'en-US'` |
| `classNames` | `{ trigger, list, item, label, description, error }` | |
| `ref` | `Ref<FileUploadApi>` | |
| other props | `name`, `form`, `required`, `disabled`, `capture`, `id`, `aria-*`, `data-*`, `onChange` | on the native input |

`FileUploadApi`: `element`, `upload(ids?)`, `cancel(id)`, `retry(id)`,
`remove(id)`, `clear()`, `getFiles()`, `open()`, `focus()`.

`createXhrUploader({ url, method, headers, fieldName, data, withCredentials })`
sends one multipart request per file with upload progress, aborts through
the signal, resolves with `{ status, body }` on 2xx and rejects with an
`XhrUploadError` (`status`, `body`) otherwise. `url`, `headers` and `data`
may be functions of the file.
