// Conflict review is a pure model: the renderer shows it, never owns it.

import type { AbortSignalLike, ColumnId, ConflictSnapshot, RowId, WriteRequest } from './types.js';

export type ConflictChoice = 'useServer' | 'keepLocal' | 'defer';

export interface ConflictReview<Row> {
  readonly conflicts: readonly ConflictSnapshot<Row>[];
  /** `${rowId}:${columnId}` -> choice. Default `defer`. */
  readonly choices: Readonly<Record<string, ConflictChoice>>;
}

export function createConflictReview<Row>(conflicts: readonly ConflictSnapshot<Row>[]): ConflictReview<Row> {
  const choices: Record<string, ConflictChoice> = {};
  for (const c of conflicts) for (const cell of c.cells) choices[`${c.rowId}:${cell.columnId}`] = 'defer';
  return Object.freeze({ conflicts, choices: Object.freeze(choices) });
}

/** Returns a new review with one cell's choice changed (`columnId` omitted: every cell of the row). */
export function setConflictChoice<Row>(review: ConflictReview<Row>, rowId: RowId, choice: ConflictChoice, columnId?: ColumnId): ConflictReview<Row> {
  const choices = { ...review.choices };
  for (const c of review.conflicts) {
    if (c.rowId !== rowId) continue;
    for (const cell of c.cells) if (columnId === undefined || cell.columnId === columnId) choices[`${rowId}:${cell.columnId}`] = choice;
  }
  return Object.freeze({ conflicts: review.conflicts, choices: Object.freeze(choices) });
}

export interface ResolveConflictsOptions<Row> {
  readonly version: number;
  readonly signal: AbortSignalLike;
  readonly mode?: WriteRequest<Row>['mode'];
  /** Writes one cell value into a row (immutably). Tuple rows: from `tupleColumns`; object rows default to `{ ...row, [columnId]: value }`. */
  readonly setValue?: (row: Row, columnId: ColumnId, value: unknown) => Row;
}

/**
 * Builds the follow-up write: rows where at least one cell is `keepLocal`
 * are re-sent on top of the server row (other cells take the server value),
 * with the server row as `previous` so its version is the expected version.
 * Rows that are all `useServer` or `defer` are not sent.
 */
export function resolveConflicts<Row>(review: ConflictReview<Row>, options: ResolveConflictsOptions<Row>): WriteRequest<Row> {
  const setValue = options.setValue ?? ((row: Row, columnId: ColumnId, value: unknown) => ({ ...(row as object), [columnId]: value }) as Row);
  const changed: { rowId: RowId; row: Row; previous: Row; changedColumnIds: ColumnId[] }[] = [];
  for (const c of review.conflicts) {
    let row = c.server;
    const ids: ColumnId[] = [];
    for (const cell of c.cells) {
      if (review.choices[`${c.rowId}:${cell.columnId}`] === 'keepLocal') {
        row = setValue(row, cell.columnId, cell.local);
        ids.push(cell.columnId);
      }
    }
    if (ids.length) changed.push({ rowId: c.rowId, row, previous: c.server, changedColumnIds: ids });
  }
  return Object.freeze({ version: options.version, added: [], changed, deleted: [], mode: options.mode ?? 'batch', signal: options.signal });
}
