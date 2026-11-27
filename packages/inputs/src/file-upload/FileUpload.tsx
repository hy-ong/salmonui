'use client';

// FileUpload. A native `<input type="file">` carries the files
// (they submit with the form), a `<button>` drop zone opens the
// picker and accepts drops, and an optional `upload` transport sends each
// file through the queue in ./store.ts. The drag highlight is a DOM
// attribute, never React state.

import { memo, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { useFormReset } from '@salmonui/core/internal/form';
import { formatValidationMessage as fill } from '@salmonui/core/validation';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { droppedFiles } from './drop.js';
import { formatFileSize } from './format.js';
import { counted, createFileStore, toEntry, type BeforeClearEvent, type BeforeFileEvent, type BeforeFilesAddEvent, type FileEntry, type FileErrorCode, type FilePreload, type FilesChangeDetails, type FileStatus, type FileStore, type RemoveTransport, type UploadTransport } from './store.js';

type TextKey = 'browse' | 'uploadAll' | 'clearAll' | 'removeFile' | 'cancelFile' | 'retryFile' | 'filesAdded' | Exclude<FileStatus, 'invalid'> | FileErrorCode;

/**
 * Strings: the trigger and buttons, one per status and one
 * per error code; `{0}` is the file name, the limit or the count.
 */
export type FileUploadLocaleText = FieldValidationText & { readonly [K in TextKey]?: string };

/** @internal English defaults (read by the locale coverage test). */
export const FILE_UPLOAD_DEFAULT_LOCALE_TEXT: { readonly [K in TextKey]: string } = {
  browse: 'Browse or drop files',
  uploadAll: 'Upload',
  clearAll: 'Clear',
  removeFile: 'Remove {0}',
  cancelFile: 'Cancel {0}',
  retryFile: 'Retry {0}',
  filesAdded: '{0} files added',
  queued: 'Ready',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  error: 'Upload failed',
  canceled: 'Canceled',
  type: 'File type not allowed',
  tooSmall: 'Smaller than {0}',
  tooLarge: 'Larger than {0}',
  tooMany: 'More than {0} files',
  upload: 'Upload failed',
  remove: 'Remove failed',
};
type Text = typeof FILE_UPLOAD_DEFAULT_LOCALE_TEXT;

/** Argument of `renderFile`. */
export interface FileRenderContext {
  readonly file: FileEntry;
  readonly status: FileStatus;
  readonly progress: number;
  readonly error: FileErrorCode | null;
  /** Localized status or error text. */
  readonly statusText: string;
  /** `formatFileSize(file.size, locale)`. */
  readonly sizeText: string;
  readonly remove: () => void;
  readonly retry: () => void;
  readonly cancel: () => void;
}

/** The `ref` of `FileUpload`. */
export interface FileUploadApi {
  /** The root element. */
  readonly element: HTMLDivElement | null;
  /** Starts queued files (all, or the given ids). */
  upload(ids?: readonly string[]): void;
  cancel(id: string): void;
  retry(id: string): void;
  remove(id: string): void;
  /** Removes every file (`onBeforeClear` can veto). */
  clear(): void;
  getFiles(): readonly FileEntry[];
  /** Opens the file picker. */
  open(): void;
  /** Focuses the drop zone button. */
  focus(): void;
}

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'size' | 'className' | 'style' | 'children' | 'accept' | 'multiple'>;

export interface FileUploadProps extends FieldCommonProps, NativeInput {
  /** Controlled list; preloaded entries default to status `'uploaded'`. */
  readonly files?: readonly (FileEntry | FilePreload)[] | undefined;
  readonly defaultFiles?: readonly (FileEntry | FilePreload)[] | undefined;
  readonly onFilesChange?: ((files: readonly FileEntry[], details: FilesChangeDetails) => void) | undefined;
  /** Extensions and MIME types (`'.pdf,image/*'`); other files are `invalid` with error `type`. */
  readonly accept?: string | undefined;
  readonly multiple?: boolean | undefined;
  /** Picks and drops folders (`webkitdirectory`, drops walked recursively). */
  readonly directory?: boolean | undefined;
  /** Bytes; smaller files get error `tooSmall`. */
  readonly minSize?: number | undefined;
  /** Bytes; larger files get error `tooLarge`. */
  readonly maxSize?: number | undefined;
  /** Files beyond the limit get error `tooMany`. */
  readonly maxFiles?: number | undefined;
  /** Transport; without it the files only submit with the form. */
  readonly upload?: UploadTransport | undefined;
  /** Server removal of uploaded files. */
  readonly remove?: RemoveTransport | undefined;
  /** Uploads as soon as files are added. Default `true`. */
  readonly autoUpload?: boolean | undefined;
  /** Parallel uploads; `1` is sequential. Default unlimited. */
  readonly concurrency?: number | undefined;
  /** Another element that accepts drops. */
  readonly dropTarget?: RefObject<Element | null> | undefined;
  /** `dataTransfer.dropEffect` while dragging over; `'none'` refuses drops. Default `'copy'`. */
  readonly dropEffect?: 'copy' | 'move' | 'link' | 'none' | undefined;
  /** Default `true`. */
  readonly showFileList?: boolean | undefined;
  /** Content of one list item. */
  readonly renderFile?: ((ctx: FileRenderContext) => ReactNode) | undefined;
  /** Content of the drop zone button. */
  readonly renderTrigger?: ((ctx: { readonly open: () => void; readonly text: string }) => ReactNode) | undefined;
  readonly localeText?: FileUploadLocaleText | undefined;
  /** Locale of file sizes. Default `'en-US'`. */
  readonly locale?: string | undefined;
  readonly onBeforeFilesAdd?: ((event: BeforeFilesAddEvent) => void) | undefined;
  readonly onBeforeUpload?: ((event: BeforeFileEvent) => void) | undefined;
  readonly onUploadProgress?: ((file: FileEntry) => void) | undefined;
  readonly onUploadSuccess?: ((file: FileEntry, result: unknown) => void) | undefined;
  readonly onUploadError?: ((file: FileEntry, reason: unknown) => void) | undefined;
  readonly onUploadComplete?: ((files: readonly FileEntry[]) => void) | undefined;
  readonly onBeforeRemove?: ((event: BeforeFileEvent) => void) | undefined;
  readonly onBeforeClear?: ((event: BeforeClearEvent) => void) | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `trigger`, `list`, `item`, `label`, `description`, `error`. */
  readonly classNames?: { readonly trigger?: string; readonly list?: string; readonly item?: string; readonly label?: string; readonly description?: string; readonly error?: string } | undefined;
  readonly ref?: Ref<FileUploadApi> | undefined;
}


/** Entries as given when complete, else filled (status `'uploaded'`). */
const normalize = (list: readonly (FileEntry | FilePreload)[], base: string): readonly FileEntry[] => (list.every((e) => e.id !== undefined && e.path !== undefined && e.status !== undefined) ? (list as readonly FileEntry[]) : list.map((e, i) => toEntry(e, `${base}p${i}`)));

const frame = (flush: () => void): (() => void) => {
  const h = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(h);
};

interface Shared {
  readonly text: Text;
  readonly locale: string;
  readonly store: FileStore;
  readonly transport: boolean;
  readonly disabled: boolean;
  readonly props: FileUploadProps;
}

/** Status or error text of an entry. */
function describe(e: FileEntry, { text, locale, props }: Shared): string {
  const key = e.error ?? e.status;
  return fill(text[key === 'invalid' ? 'type' : key], key === 'tooMany' ? (props.maxFiles ?? 1) : formatFileSize((key === 'tooSmall' ? props.minSize : props.maxSize) ?? 0, locale));
}

/** One list item; memoized so a progress update re-renders only its file. */
const FileItem = memo(function FileItem({ entry, shared }: { readonly entry: FileEntry; readonly shared: Shared }): ReactNode {
  const { text, store, transport, disabled, props } = shared;
  const { id, name, status } = entry;
  const remove = (): void => store.remove(id);
  const retry = (): void => store.retry(id);
  const cancel = (): void => store.cancel(id);
  const statusText = describe(entry, shared);
  const sizeText = formatFileSize(entry.size, shared.locale);
  const action = (kind: 'removeFile' | 'retryFile' | 'cancelFile', run: () => void, show: boolean): ReactNode =>
    show ? (
      <button type="button" className="salmon-file-upload-action" data-action={kind} aria-label={fill(text[kind], name)} disabled={disabled} onClick={run}>
        <span className="salmon-file-upload-icon" aria-hidden="true" />
      </button>
    ) : null;
  return (
    <li className={cx('salmon-file-upload-item', props.classNames?.item)} data-status={status} data-error={entry.error ?? undefined}>
      {props.renderFile ? (
        props.renderFile({ file: entry, status, progress: entry.progress, error: entry.error, statusText, sizeText, remove, retry, cancel })
      ) : (
        <>
          <span className="salmon-file-upload-name">{entry.path}</span>
          <span className="salmon-file-upload-meta">{`${sizeText} · ${statusText}`}</span>
          {status === 'uploading' ? <progress className="salmon-file-upload-progress" value={entry.progress} aria-label={name} /> : null}
          <span className="salmon-file-upload-actions">
            {action('retryFile', retry, transport && (status === 'error' || status === 'canceled'))}
            {action('cancelFile', cancel, transport && (status === 'uploading' || status === 'queued'))}
            {action('removeFile', remove, status !== 'uploading')}
          </span>
        </>
      )}
    </li>
  );
});

const DRAG = ['dragenter', 'dragover', 'dragleave', 'drop'] as const;
/** Props the component owns; the rest go to the native input. */
const OWN = 'label description errorMessage invalid validation validateOn size files defaultFiles onFilesChange accept multiple directory minSize maxSize maxFiles upload remove autoUpload concurrency dropTarget dropEffect showFileList renderFile renderTrigger localeText locale onBeforeFilesAdd onBeforeUpload onUploadProgress onUploadSuccess onUploadError onUploadComplete onBeforeRemove onBeforeClear className style classNames ref onChange disabled'.split(' ');

/**
 * File picker with a drop zone, validation, a file list and an optional
 * upload queue. `ref` is a `FileUploadApi`; unknown props go
 * to the native file input, `className` / `style` to the root.
 */
export function FileUpload(props: FileUploadProps): ReactNode {
  const { files: controlledFiles, defaultFiles, upload, autoUpload, directory, dropTarget, renderTrigger, classNames, disabled = false } = props;
  const localeText = useLocaleText('fileUpload', props.localeText);
  const locale = useLocale(props.locale) ?? 'en-US';
  const native: Record<string, unknown> = {};
  for (const key in props) if (!OWN.includes(key)) native[key] = props[key as keyof FileUploadProps];
  const base = useId();
  const controlled = useMemo(() => controlledFiles && normalize(controlledFiles, base), [controlledFiles, base]);
  const [defaults] = useState(() => normalize(defaultFiles ?? [], base));
  const [store] = useState(() => {
    let n = 0;
    return createFileStore(controlled ?? defaults, frame, () => `${base}f${n++}`);
  });
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const files = controlled ?? snap.files;
  const text = useMemo<Text>(() => ({ ...FILE_UPLOAD_DEFAULT_LOCALE_TEXT, ...localeText }), [localeText]);
  const transport = upload !== undefined;
  const shared = useMemo<Shared>(() => ({ text, locale, store, transport, disabled, props }), [text, locale, store, transport, disabled, props]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const field = useField({ ...props, localeText, value: files.filter(counted).length || null, inputRef, focusRef: triggerRef, disabled, revealOnChange: true });
  const hasLabel = props.label != null && props.label !== false;

  // Latest props for the store and the native listeners (committed, not render-time).
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
    store.setOptions({ ...props, multiple: props.multiple || directory });
  });
  useLayoutEffect(() => {
    if (controlled) store.sync(controlled);
  }, [controlled, store]);
  useEffect(() => store.stop, [store]);

  /** Mirrors the counted files into the native input, so FormData and `required` see them. */
  const syncInput = (): void => {
    const input = inputRef.current;
    const want = store.getSnapshot().files.flatMap((e) => (e.file && counted(e) ? [e.file] : []));
    const have = [...(input?.files ?? [])];
    if (!input || (want.length === have.length && want.every((f, i) => f === have[i]))) return;
    try {
      const data = new DataTransfer();
      for (const f of want) data.items.add(f);
      input.files = data.files;
    } catch {}
  };
  useLayoutEffect(syncInput, [files]);

  useFormReset(inputRef, () => store.reset(controlled ? normalize(latest.current.defaultFiles ?? [], base) : defaults));

  // Drop zone: the button, or `dropTarget`.
  useEffect(() => {
    const target = dropTarget?.current ?? triggerRef.current!;
    const marked = target === triggerRef.current ? [rootRef.current!] : [rootRef.current!, target];
    let depth = 0;
    const mark = (on: boolean): void => marked.forEach((el) => el.toggleAttribute('data-dragging', on));
    const handle = (e: Event): void => {
      const data = (e as DragEvent).dataTransfer;
      const p = latest.current;
      if (p.disabled || !data?.types.includes('Files')) return;
      e.preventDefault();
      if (e.type === 'dragover') data.dropEffect = p.dropEffect ?? 'copy';
      else if (e.type === 'dragenter') depth++ || mark(true);
      else if (e.type === 'dragleave') --depth || mark(false);
      else {
        depth = 0;
        mark(false);
        if (p.dropEffect === 'none') return;
        const out = droppedFiles(data, p.directory === true);
        if (Array.isArray(out)) store.add(out, 'drop');
        else void out.then((list) => store.add(list, 'drop'));
      }
    };
    for (const type of DRAG) target.addEventListener(type, handle);
    return () => {
      for (const type of DRAG) target.removeEventListener(type, handle);
    };
  }, [dropTarget, store]);

  const open = (): void => inputRef.current?.click();
  useImperativeHandle(
    props.ref,
    () => ({
      get element() {
        return rootRef.current;
      },
      upload: store.upload,
      cancel: store.cancel,
      retry: store.retry,
      remove: (id) => store.remove(id, true),
      clear: () => store.clear(true),
      getFiles: () => store.getSnapshot().files,
      open,
      focus: () => triggerRef.current?.focus(),
    }),
    [store],
  );

  const onInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    props.onChange?.(event);
    store.add([...(event.currentTarget.files ?? [])], 'picker');
    syncInput();
  };

  const say = snap.announce;
  const button = (key: 'uploadAll' | 'clearAll', run: () => void, show: boolean): ReactNode =>
    show ? (
      <button type="button" className="salmon-file-upload-button" data-action={key} disabled={disabled} onClick={run}>
        {text[key]}
      </button>
    ) : null;

  return (
    <FieldStateContext value={field}>
      <div ref={rootRef} className={cx('salmon-field salmon-file-upload', props.className)} style={props.style} data-size={props.size ?? 'md'} {...field.rootProps}>
        <FieldLabel field={field} className={classNames?.label}>{props.label}</FieldLabel>
        <input
          {...native}
          {...field.inputProps}
          {...(directory ? { webkitdirectory: '' } : null)}
          ref={inputRef}
          type="file"
          className="salmon-visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          accept={props.accept}
          multiple={props.multiple || directory}
          disabled={disabled}
          onChange={onInputChange}
        />
        <button
          ref={triggerRef}
          type="button"
          className={cx('salmon-file-upload-trigger', classNames?.trigger)}
          disabled={disabled}
          aria-labelledby={hasLabel ? `${field.labelId} ${base}t` : undefined}
          aria-describedby={field.inputProps['aria-describedby']}
          aria-invalid={field.inputProps['aria-invalid']}
          onClick={open}
          onBlur={field.onBlur}
        >
          <span id={`${base}t`}>{renderTrigger ? renderTrigger({ open, text: text.browse }) : text.browse}</span>
        </button>
        {files.length > 0 ? (
          <div className="salmon-file-upload-toolbar">
            {button('uploadAll', () => store.upload(), transport && autoUpload === false && files.some((e) => e.status === 'queued'))}
            {button('clearAll', () => store.clear(), true)}
          </div>
        ) : null}
        {props.showFileList !== false && files.length > 0 ? (
          <ul className={cx('salmon-file-upload-list', classNames?.list)} aria-labelledby={hasLabel ? field.labelId : undefined}>
            {files.map((entry) => (
              <FileItem key={entry.id} entry={entry} shared={shared} />
            ))}
          </ul>
        ) : null}
        <div className="salmon-visually-hidden" role="status" aria-live="polite">
          {say === null ? '' : typeof say === 'number' ? fill(text.filesAdded, say) : `${say.name}: ${describe(say, shared)}`}
        </div>
        <FieldHelp field={field} description={props.description} classNames={classNames} />
      </div>
    </FieldStateContext>
  );
}
