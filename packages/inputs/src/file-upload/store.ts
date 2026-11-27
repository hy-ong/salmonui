// FileUpload state machine and transport queue. No React
// and no DOM: the component feeds it files and options and renders its
// snapshot; unit tests drive it with fake transports.
//
// Per file: queued -> uploading -> uploaded | error | canceled, plus invalid
// for files rejected by accept / minSize / maxSize / maxFiles. Progress from
// the transport is coalesced and applied once per scheduled frame.

/** Status of one file entry. */
export type FileStatus = 'queued' | 'uploading' | 'uploaded' | 'error' | 'canceled' | 'invalid';
/** Why a file is `invalid` (`type`, `tooSmall`, `tooLarge`, `tooMany`) or failed (`upload`, `remove`). */
export type FileErrorCode = 'type' | 'tooSmall' | 'tooLarge' | 'tooMany' | 'upload' | 'remove';

/** One file in the list. Entries are immutable; every change makes a new one. */
export interface FileEntry {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  /** The picked or dropped file; `null` for preloaded entries. */
  readonly file: File | null;
  /** Folder-relative path for directory picks and drops, else the name. */
  readonly path: string;
  readonly status: FileStatus;
  /** 0..1 while uploading, 1 when uploaded. */
  readonly progress: number;
  readonly error: FileErrorCode | null;
  /** The transport's rejection reason (status `error`, or error `remove`). */
  readonly reason?: unknown;
  /** The transport's resolved value (status `uploaded`). */
  readonly result?: unknown;
}

/** A preloaded entry (`defaultFiles` / `files`): status defaults to `'uploaded'`. */
export type FilePreload = Partial<FileEntry> & { readonly name: string; readonly size: number };

/** Second argument of the transport. */
export interface UploadContext {
  readonly signal: AbortSignal;
  /** Reports progress; applied at most once per frame. */
  readonly onProgress: (loaded: number, total: number) => void;
}
/** The transport: resolves when the server accepted the file. */
export type UploadTransport = (file: File, context: UploadContext) => Promise<unknown>;
/** Optional server removal of an uploaded file. */
export type RemoveTransport = (file: FileEntry, context: { readonly signal: AbortSignal }) => Promise<unknown>;

/** A cancellable event (`preventDefault()` vetoes the action). */
export interface FileUploadCancelableEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}
export interface BeforeFilesAddEvent extends FileUploadCancelableEvent {
  /** The files about to be added; mutate it to drop or add files. */
  readonly files: File[];
  readonly source: 'picker' | 'drop' | 'api';
}
export interface BeforeFileEvent extends FileUploadCancelableEvent {
  readonly file: FileEntry;
}
export interface BeforeClearEvent extends FileUploadCancelableEvent {
  readonly files: readonly FileEntry[];
}

/** Second argument of `onFilesChange`. */
export interface FilesChangeDetails {
  readonly source: 'pointer' | 'api';
  readonly reason: 'add' | 'remove' | 'clear' | 'status' | 'progress' | 'reset';
}

export interface FileStoreOptions {
  readonly accept?: string | undefined;
  readonly minSize?: number | undefined;
  readonly maxSize?: number | undefined;
  readonly maxFiles?: number | undefined;
  readonly multiple?: boolean | undefined;
  readonly upload?: UploadTransport | undefined;
  readonly remove?: RemoveTransport | undefined;
  readonly autoUpload?: boolean | undefined;
  readonly concurrency?: number | undefined;
  readonly onFilesChange?: ((files: readonly FileEntry[], details: FilesChangeDetails) => void) | undefined;
  readonly onBeforeFilesAdd?: ((event: BeforeFilesAddEvent) => void) | undefined;
  readonly onBeforeUpload?: ((event: BeforeFileEvent) => void) | undefined;
  readonly onUploadProgress?: ((file: FileEntry) => void) | undefined;
  readonly onUploadSuccess?: ((file: FileEntry, result: unknown) => void) | undefined;
  readonly onUploadError?: ((file: FileEntry, reason: unknown) => void) | undefined;
  readonly onUploadComplete?: ((files: readonly FileEntry[]) => void) | undefined;
  readonly onBeforeRemove?: ((event: BeforeFileEvent) => void) | undefined;
  readonly onBeforeClear?: ((event: BeforeClearEvent) => void) | undefined;
}

export interface FileStoreSnapshot {
  readonly files: readonly FileEntry[];
  /** Last announcement: the entry whose status changed, or the number of files added. */
  readonly announce: FileEntry | number | null;
}

/** Frame scheduler; the component passes requestAnimationFrame. */
export type Schedule = (flush: () => void) => () => void;

/** Calls `handler` with a cancellable event; true when it was not vetoed. */
function allowed<T extends object>(handler: ((event: T & FileUploadCancelableEvent) => void) | undefined, fields: T): boolean {
  if (!handler) return true;
  const event = {
    ...fields,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  handler(event);
  return !event.defaultPrevented;
}

/** `accept` check: `.ext`, `type/*` and exact MIME tokens. */
export function accepts(accept: string | undefined, name: string, type: string): boolean {
  return (
    !accept ||
    accept.split(',').some((raw) => {
      const t = raw.trim().toLowerCase();
      return t !== '' && (t[0] === '.' ? name.toLowerCase().endsWith(t) : t.endsWith('/*') ? type.toLowerCase().startsWith(t.slice(0, -1)) : type.toLowerCase() === t);
    })
  );
}

/** Counts toward `maxFiles` and the native input. */
export const counted = (e: FileEntry): boolean => e.status !== 'invalid' && e.status !== 'canceled';

/** Fills a preload into an entry (status `'uploaded'` unless given). */
export function toEntry(p: FilePreload, id: string): FileEntry {
  return { file: null, type: '', path: p.name, status: 'uploaded', progress: !p.status || p.status === 'uploaded' ? 1 : 0, error: null, ...p, id: p.id ?? id };
}

export interface FileStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): FileStoreSnapshot;
  setOptions(options: FileStoreOptions): void;
  /** Adopts a controlled list (no callbacks). */
  sync(files: readonly FileEntry[]): void;
  add(files: readonly File[], source: BeforeFilesAddEvent['source']): void;
  upload(ids?: readonly string[]): void;
  cancel(id: string): void;
  retry(id: string): void;
  remove(id: string, api?: boolean): void;
  clear(api?: boolean): void;
  /** Form reset: aborts everything and restores `files`. */
  reset(files: readonly FileEntry[]): void;
  /** Aborts running transports and pending frames (unmount). */
  stop(): void;
}

export function createFileStore(initial: readonly FileEntry[], schedule: Schedule, newId: () => string): FileStore {
  let o: FileStoreOptions = {};
  let snap: FileStoreSnapshot = { files: initial, announce: null };
  const listeners = new Set<() => void>();
  /** Running uploads and removals by id. */
  const running = new Map<string, AbortController>();
  const pending: string[] = [];
  const progress = new Map<string, number>();
  let unschedule: (() => void) | null = null;
  let batch = false;

  const list = (): readonly FileEntry[] => snap.files;
  const find = (id: string): FileEntry | undefined => list().find((e) => e.id === id);
  const commit = (files: readonly FileEntry[], reason: FilesChangeDetails['reason'], api = true, announce = snap.announce): void => {
    snap = { files, announce };
    listeners.forEach((l) => l());
    o.onFilesChange?.(files, { source: api ? 'api' : 'pointer', reason });
  };
  /** Replaces one entry; announces the change unless `quiet` (uploading and retried files). */
  const patch = (id: string, change: Partial<FileEntry>, quiet?: boolean): FileEntry | undefined => {
    let out: FileEntry | undefined;
    const files = list().map((e) => (e.id === id ? (out = { ...e, ...change }) : e));
    if (out) commit(files, 'status', true, quiet ? snap.announce : out);
    return out;
  };

  const flush = (): void => {
    unschedule = null;
    const changed: FileEntry[] = [];
    const files = list().map((e) => {
      const p = progress.get(e.id);
      return p === undefined || e.status !== 'uploading' || p === e.progress ? e : (changed[changed.length] = { ...e, progress: p });
    });
    progress.clear();
    if (changed.length === 0) return;
    commit(files, 'progress');
    for (const e of changed) o.onUploadProgress?.(e);
  };

  const abort = (id: string): void => {
    running.get(id)?.abort();
    running.delete(id);
    progress.delete(id);
    const at = pending.indexOf(id);
    if (at >= 0) pending.splice(at, 1);
  };

  /** Runs `task` for `id` under a fresh controller; `settle` sees results only while it is current. */
  const run = (id: string, task: (signal: AbortSignal, controller: AbortController) => Promise<unknown>, done: (ok: boolean, value: unknown) => void): void => {
    const controller = new AbortController();
    running.set(id, controller);
    const end = (ok: boolean) => (value: unknown) => {
      if (running.get(id) !== controller) return;
      running.delete(id);
      progress.delete(id);
      done(ok, value);
    };
    new Promise((resolve) => resolve(task(controller.signal, controller))).then(end(true), end(false));
  };

  const start = (entry: FileEntry): void => {
    const transport = o.upload;
    if (!transport || !entry.file || !allowed(o.onBeforeUpload, { file: entry })) return;
    if (!patch(entry.id, { status: 'uploading', progress: 0, error: null, reason: undefined }, true)) return;
    run(
      entry.id,
      (signal, controller) =>
        transport(entry.file!, {
          signal,
          onProgress: (loaded, total) => {
            if (running.get(entry.id) !== controller) return;
            progress.set(entry.id, total > 0 ? Math.min(1, loaded / total) : 0);
            unschedule ??= schedule(flush);
          },
        }),
      (ok, value) => {
        const e = patch(entry.id, ok ? { status: 'uploaded', progress: 1, result: value } : { status: 'error', error: 'upload', reason: value });
        if (e) (ok ? o.onUploadSuccess : o.onUploadError)?.(e, value);
        pump();
      },
    );
  };

  function pump(): void {
    const limit = o.concurrency! > 0 ? o.concurrency! : Infinity;
    while (running.size < limit && pending.length > 0) {
      const entry = find(pending.shift()!);
      if (entry?.status === 'queued') {
        batch = true;
        start(entry);
      }
    }
    if (batch && running.size === 0) {
      batch = false;
      o.onUploadComplete?.(list());
    }
  }

  const enqueue = (entries: readonly (FileEntry | undefined)[]): void => {
    for (const e of entries) if (e?.status === 'queued' && !pending.includes(e.id) && !running.has(e.id)) pending.push(e.id);
    pump();
  };

  const stop = (): void => {
    for (const c of running.values()) c.abort();
    running.clear();
    pending.length = 0;
    progress.clear();
    batch = false;
    unschedule?.();
    unschedule = null;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snap,
    setOptions(next) {
      o = next;
    },
    sync(files) {
      if (files !== snap.files) {
        snap = { files, announce: snap.announce };
        listeners.forEach((l) => l());
      }
    },
    add(input, source) {
      const files = [...input];
      if (!allowed(o.onBeforeFilesAdd, { files, source }) || files.length === 0) return;
      const multiple = o.multiple === true;
      if (!multiple) for (const e of list()) abort(e.id);
      const keep = multiple ? list() : [];
      const max = multiple ? (o.maxFiles ?? Infinity) : 1;
      let valid = keep.filter(counted).length;
      const added = (multiple ? files : files.slice(0, 1)).map((file): FileEntry => {
        const error =
          !accepts(o.accept, file.name, file.type) ? 'type'
          : file.size < (o.minSize ?? 0) ? 'tooSmall'
          : file.size > (o.maxSize ?? Infinity) ? 'tooLarge'
          : valid >= max ? 'tooMany'
          : (valid++, null);
        const path = (file as { webkitRelativePath?: string }).webkitRelativePath || (file as { path?: string }).path || file.name;
        return { id: newId(), name: file.name, size: file.size, type: file.type, file, path, status: error ? 'invalid' : 'queued', progress: 0, error };
      });
      commit([...keep, ...added], 'add', source === 'api', added.length === 1 ? added[0]! : (added.find((e) => e.error) ?? added.length));
      if (o.upload && o.autoUpload !== false) enqueue(added);
    },
    upload(ids) {
      enqueue(ids ? ids.map(find) : list());
    },
    cancel(id) {
      const e = find(id);
      if (e?.status !== 'uploading' && e?.status !== 'queued') return;
      abort(id);
      patch(id, { status: 'canceled' });
      pump();
    },
    retry(id) {
      const e = find(id);
      if (e?.status !== 'error' && e?.status !== 'canceled') return;
      enqueue([patch(id, { status: 'queued', progress: 0, error: null, reason: undefined }, true)]);
    },
    remove(id, api = false) {
      const e = find(id);
      if (!e || (running.has(id) && e.status !== 'uploading') || !allowed(o.onBeforeRemove, { file: e })) return;
      abort(id);
      const drop = (): void => commit(list().filter((x) => x.id !== id), 'remove', api);
      if (!o.remove || e.status !== 'uploaded') return drop();
      const hook = o.remove;
      run(id, (signal) => hook(e, { signal }), (ok, reason) => (ok ? drop() : patch(id, { error: 'remove', reason })));
    },
    clear(api = false) {
      if (list().length === 0 || !allowed(o.onBeforeClear, { files: list() })) return;
      stop();
      commit([], 'clear', api);
    },
    reset(files) {
      stop();
      if (files !== list()) commit(files, 'reset');
    },
    stop,
  };
}
