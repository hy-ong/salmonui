// Remote writes of the Gantt: with a `@salmonui/data` / Data Grid source
// that has `write`, every committed change (taskbar edit, dialog, grid edit,
// API) is written back as one `WriteRequest` with the changed rows and their
// computed dates, and a `signal`. The affected tasks are pending
// (`data-pending` on their chart rows) until the write settles; a newer write
// that touches one of them supersedes it (the older request is aborted and
// its tasks join the newer one); unmount aborts every write. A rejection (or
// a `rejected` result) reverts the change through the engine's change records
// (the undo mechanism) and calls `onError`. A `#gantt-modules` module, loaded
// only for a writable source.

import type { RowId } from '@salmonui/core/data';
import type { ChangeRecord } from '../internal/timeline/project/engine.js';
import { GRID_PARENT_FIELD, RESOURCE_KEY, ROW_KEY, TASK_KEY } from './fields.js';
import type { GanttInstance } from './instance.js';

type Row = Record<string, unknown>;

/** The source shape the Gantt writes to (structural `DataSource` `write`). */
interface WritableSource {
  write(request: unknown): Promise<{ readonly status?: string; readonly changed?: readonly { readonly rowId: RowId; readonly row: unknown }[]; readonly added?: readonly { readonly tempId: RowId; readonly row: unknown }[] } | undefined>;
}

interface Write {
  readonly ctrl: AbortController;
  readonly ids: Set<string>;
  readonly records: ChangeRecord[];
  readonly action: string;
}

export interface RemoteWriter {
  /** Rows the grid read (the confirmed server state). */
  confirm(rows: readonly unknown[]): void;
  /** Called by `commit` with the ids the change touched. */
  committed(changed: ReadonlySet<string> | null, action: string, ids: readonly string[]): void;
  /** Change records since the last commit that are not user changes (rows adopted from the source). */
  discard(): void;
  /** Aborts every write (unmount). */
  abort(): void;
  /** Aborts and stops recording (the source was replaced). */
  dispose(): void;
}

export const writableSource = (data: unknown): boolean => !!data && !Array.isArray(data) && typeof (data as { write?: unknown }).write === 'function';

export function createRemoteWriter<R>(gi: GanttInstance<R>): RemoteWriter {
  const g = gi as unknown as GanttInstance<Row>;
  /** Engine change records of the change being committed. */
  let records: ChangeRecord[] = [];
  const off = g.engine.onCommit((r) => void records.push(r));
  /** Confirmed rows by task id: what the source holds. */
  const confirmed = new Map<string, Row>();
  const writes = new Set<Write>();
  let version = 0;

  const setPending = (): void => {
    const next = new Set<string>();
    for (const w of writes) for (const id of w.ids) next.add(id);
    g.pending = next;
    g.emit();
  };

  /** The row as the source stores it: computed dates, the row's own parent field. */
  const outRow = (id: string, previous: Row | undefined): Row | undefined => {
    const row = g.getRow(id);
    const task = g.engine.getTask(id);
    if (!row || !task) return undefined;
    const out: Row = { ...row };
    delete out[GRID_PARENT_FIELD];
    delete out[ROW_KEY];
    delete out[TASK_KEY];
    delete out[RESOURCE_KEY];
    const pf = g.fields.parentId;
    const prev = previous?.[pf];
    const parent = task.parentId;
    // The parent keeps the row's own value and type (a number id stays a number).
    if (parent === null) out[pf] = prev === '' ? prev : null;
    else if (prev === undefined || prev === null || String(prev) !== parent) out[pf] = typeof out[g.fields.id] === 'number' && Number.isFinite(Number(parent)) ? Number(parent) : parent;
    else out[pf] = prev;
    return out;
  };

  const revert = (w: Write, error: unknown): void => {
    for (let i = w.records.length - 1; i >= 0; i--) g.engine.applyRecord(w.records[i] as ChangeRecord, 'before');
    records = [];
    // The source rows go back to the confirmed ones.
    for (const id of w.ids) {
      const c = confirmed.get(id);
      if (c) g.setSourceRow(id, c);
    }
    g.syncSourceFromEngine();
    g.commit(null, w.action as never, [], 'api', true);
    g.props.onError?.({ error, action: w.action, taskIds: [...w.ids] });
  };

  const send = (w: Write, src: WritableSource): void => {
    const grid = g.gridApi;
    const added: { tempId: RowId; row: Row; parentId: RowId | null }[] = [];
    const changed: { rowId: RowId; row: Row; previous: Row; changedColumnIds: string[] }[] = [];
    const deleted: { rowId: RowId; row: Row }[] = [];
    for (const id of w.ids) {
      const previous = (grid?.getRowInfo(id)?.row as Row | null | undefined) ?? confirmed.get(id);
      const row = outRow(id, previous);
      if (!row) {
        if (previous) deleted.push({ rowId: id, row: previous });
      } else if (!previous) added.push({ tempId: id, row, parentId: g.engine.getTask(id)?.parentId ?? null });
      else {
        const cols = Object.keys(row).filter((k) => {
          const a = row[k];
          const b = previous[k];
          return a instanceof Date ? !(b instanceof Date) || a.getTime() !== b.getTime() : a !== b;
        });
        if (cols.length) changed.push({ rowId: id, row, previous, changedColumnIds: cols });
      }
    }
    const signal = w.ctrl.signal;
    const done = (): void => {
      writes.delete(w);
      setPending();
    };
    if (!added.length && !changed.length && !deleted.length) return done();
    Promise.resolve()
      .then(() => src.write({ version: ++version, added, changed, deleted, mode: 'batch', signal }))
      .then(
        (res) => {
          if (signal.aborted) return;
          if (res?.status === 'rejected') {
            done();
            return revert(w, new Error('The data source rejected the change.'));
          }
          const echo = new Map<string, unknown>();
          for (const c of res?.changed ?? []) echo.set(String(c.rowId), c.row);
          for (const a of res?.added ?? []) echo.set(String(a.tempId), a.row);
          for (const x of [...added.map((a) => [String(a.tempId), a.row] as const), ...changed.map((c) => [String(c.rowId), c.row] as const)]) confirmed.set(x[0], (echo.get(x[0]) as Row | undefined) ?? x[1]);
          for (const d of deleted) confirmed.delete(String(d.rowId));
          done();
        },
        (error: unknown) => {
          if (signal.aborted) return;
          done();
          revert(w, error);
        },
      );
  };

  return {
    confirm(rows) {
      for (const r of rows) {
        const id = g.idOf(r as never);
        if (g.engine.getTask(id)) confirmed.set(id, r as Row);
      }
    },
    committed(changed, action, ids) {
      // Through the grid's data source (the tree wrapper applies the settled result to the loaded rows), else the source itself.
      const src = (g.gridApi?.engine.getDataSource() ?? g.props.data) as unknown as WritableSource;
      const touched = new Set<string>([...ids, ...(changed ?? [])]);
      const taken = records;
      records = [];
      // Every task a record touched (a deleted parent's children too).
      for (const r of taken) for (const s of [...r.before, ...r.after]) touched.add(s.id);
      if (!touched.size || !writableSource(src)) return;
      const w: Write = { ctrl: new AbortController(), ids: touched, records: taken, action };
      // A newer write of the same tasks supersedes the older one: abort it and carry its tasks and records over.
      for (const old of [...writes]) {
        if (![...old.ids].some((id) => touched.has(id))) continue;
        old.ctrl.abort();
        writes.delete(old);
        for (const id of old.ids) touched.add(id);
        w.records.unshift(...old.records);
      }
      writes.add(w);
      setPending();
      send(w, src);
    },
    discard() {
      records = [];
    },
    dispose() {
      this.abort();
      off();
    },
    abort() {
      for (const w of writes) w.ctrl.abort();
      writes.clear();
      records = [];
      if (g.pending.size) {
        g.pending = new Set();
        g.emit();
      }
    },
  };
}
