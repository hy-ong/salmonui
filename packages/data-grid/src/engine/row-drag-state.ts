// The at-rest part of row drag and drop, published on
// `./row-drag-state`: the cross-grid handoff registry, the command types of
// the `rowDragDrop` module and its initial state. Small and pure, so a
// renderer that loads `./row-drag-drop` lazily can register a stand-in and
// share a handoff without it.
// `./row-drag-drop` re-exports everything here.

import type { RowDragCommand, RowDragDropOptions, RowDragDropState, RowDragHandoff, RowDragPayload } from './row-drag-drop.js';
import type { DataGridOptions } from './types.js';

/** Command types of the `rowDragDrop` module (a renderer that registers the module lazily declares them up front). */
export const ROW_DRAG_COMMANDS: readonly RowDragCommand['type'][] = Object.freeze([
  'rowDragDrop.start',
  'rowDragDrop.over',
  'rowDragDrop.overExternal',
  'rowDragDrop.leave',
  'rowDragDrop.drop',
  'rowDragDrop.receive',
  'rowDragDrop.end',
  'rowDragDrop.cancel',
  'rowDragDrop.move',
  'rowDragDrop.reorder',
  'rowDragDrop.moveBy',
  'rowDragDrop.setEnabled',
  'rowDragDrop.setOptions',
  'rowDragDrop.settled',
] as const);

/** The state `createRowDragDropModule().initialState(options)` returns: no drag, no drop. */
export function createInitialRowDragState<Row>(options: DataGridOptions<Row>): RowDragDropState {
  const o = (options['rowDragDrop'] ?? {}) as RowDragDropOptions;
  return Object.freeze({
    enabled: o.enabled ?? true,
    allowGroupChange: o.allowGroupChange ?? false,
    orderField: o.orderField ?? null,
    drag: null,
    lastDrop: null,
  });
}

export function createRowDragHandoff(): RowDragHandoff {
  const sessions = new Map<string, { payload: RowDragPayload; onDropped: (targetGridId: string) => void }>();
  let seq = 0;
  return Object.freeze({
    begin(payload: Omit<RowDragPayload, 'token'>, onDropped: (targetGridId: string) => void) {
      const token = `rdd${++seq}`;
      sessions.set(token, { payload: Object.freeze({ ...payload, token }), onDropped });
      return token;
    },
    get: (token: string) => sessions.get(token)?.payload,
    complete(token: string, targetGridId: string) {
      const s = sessions.get(token);
      if (!s) return;
      sessions.delete(token);
      s.onDropped(targetGridId);
    },
    cancel(token: string) {
      sessions.delete(token);
    },
  });
}
