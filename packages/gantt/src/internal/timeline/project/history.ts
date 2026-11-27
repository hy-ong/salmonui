// Undo and redo: a bounded stack of engine change
// records. Attached to an engine it records every committed user-level change
// (one entry per `update`, `add`, `remove`, dependency change, split / merge,
// tree edit, id change, or one `engine.batch`), optionally filtered by action
// name; undo / redo reapply a record's other side through the engine as one
// change; a new change clears the redo stack. Pure: no React, no DOM globals,
// zero dependencies, state lives in the returned object.

import type { ChangeRecord, ProjectEngine } from './engine.js';
import type { UpdateResult } from './types.js';

export interface ProjectHistory {
  /** Undoes the newest entry; null when there is nothing to undo or no engine is attached. */
  undo(): UpdateResult | null;
  redo(): UpdateResult | null;
  /** Action names, newest first. */
  getUndoActions(): string[];
  getRedoActions(): string[];
  clearUndo(): void;
  clearRedo(): void;
  /** Clears both stacks (after a full data reload). */
  clear(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly limit: number;
  /** Pushes a record (what an attached engine does on every commit). */
  record(record: ChangeRecord): void;
  /** Internal: the engine undo / redo apply to. */
  engine: ProjectEngine | null;
}

export function createHistory(limit = 50): ProjectHistory {
  const max = Math.max(1, Math.floor(limit));
  const undo: ChangeRecord[] = [];
  const redo: ChangeRecord[] = [];
  const h: ProjectHistory = {
    engine: null,
    limit: max,
    get canUndo() {
      return undo.length > 0;
    },
    get canRedo() {
      return redo.length > 0;
    },
    record(r) {
      undo.push(r);
      if (undo.length > max) undo.splice(0, undo.length - max);
      redo.length = 0;
    },
    undo() {
      const r = undo.pop();
      if (!r || !h.engine) {
        if (r) undo.push(r);
        return null;
      }
      const result = h.engine.applyRecord(r, 'before');
      redo.push(r);
      return result;
    },
    redo() {
      const r = redo.pop();
      if (!r || !h.engine) {
        if (r) redo.push(r);
        return null;
      }
      const result = h.engine.applyRecord(r, 'after');
      undo.push(r);
      return result;
    },
    getUndoActions: () => undo.map((r) => r.action).reverse(),
    getRedoActions: () => redo.map((r) => r.action).reverse(),
    clearUndo: () => void (undo.length = 0),
    clearRedo: () => void (redo.length = 0),
    clear() {
      undo.length = 0;
      redo.length = 0;
    },
  };
  return h;
}

/** Records the engine's committed changes into `history` (only `actions` when given); returns the detach function. */
export function attachHistory(engine: ProjectEngine, history: ProjectHistory, options?: { readonly actions?: readonly string[] }): () => void {
  const allowed = options?.actions ? new Set(options.actions) : null;
  history.engine = engine;
  const off = engine.onCommit((r) => {
    if (!allowed || allowed.has(r.action)) history.record(r);
  });
  return () => {
    off();
    if (history.engine === engine) history.engine = null;
  };
}
