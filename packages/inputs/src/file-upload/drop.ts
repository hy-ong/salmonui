// Directory drops: walks `webkitGetAsEntry()` trees after
// the drop event. Entries must be taken synchronously inside the event; the
// walk itself is asynchronous. Each file gets a `path` (folder-relative,
// the react-dropzone / Electron convention) that the store copies into the
// entry.

interface FsEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath: string;
  file?(ok: (file: File) => void, fail: (error: unknown) => void): void;
  createReader?(): { readEntries(ok: (entries: FsEntry[]) => void, fail: (error: unknown) => void): void };
}

function walk(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    return new Promise<void>((resolve) =>
      entry.file!(
        (file) => {
          try {
            Object.defineProperty(file, 'path', { value: entry.fullPath.replace(/^\//, ''), configurable: true });
          } catch {}
          out.push(file);
          resolve();
        },
        () => resolve(),
      ),
    );
  }
  if (!entry.isDirectory || !entry.createReader) return Promise.resolve();
  const reader = entry.createReader();
  // readEntries returns batches until an empty one.
  const next = (): Promise<void> =>
    new Promise<FsEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([]))).then((batch) =>
      batch.length === 0 ? undefined : Promise.all(batch.map((child) => walk(child, out))).then(next),
    );
  return next();
}

/** The dropped files, folders walked recursively; plain files when entries are unavailable. */
export function droppedFiles(data: DataTransfer, directory: boolean): Promise<File[]> | File[] {
  const items = data.items ? [...data.items] : [];
  const entries = directory ? items.map((item) => (item.webkitGetAsEntry?.() as FsEntry | null | undefined) ?? null) : [];
  if (!directory || entries.length === 0 || entries.some((e) => e === null)) return [...data.files];
  const out: File[] = [];
  const key = (f: File): string => (f as File & { path?: string }).path ?? f.name;
  return Promise.all(entries.map((e) => walk(e!, out))).then(() => out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)));
}
