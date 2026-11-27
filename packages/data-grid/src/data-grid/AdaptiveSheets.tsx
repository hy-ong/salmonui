'use client';

// Adaptive sort and filter-column sheets, in the lazy
// adaptive chunk (`adaptive-chunk.ts`). `DataGridAdaptiveOverlays` renders them
// while a sheet is open; they never render on the server.

import type { ColumnId } from '@salmonui/data-grid/engine';
import { useLayoutEffect, useRef, useState } from 'react';
import type { AdaptiveDialog, DataGridAdaptiveController } from './adaptive-controller.js';
import { useDataGridText } from './context.js';
import type { DataGridInstance } from './instance.js';
import { DataGridPopover } from './popover.js';

type Direction = 'asc' | 'desc' | null;

export function SortSheet({ instance, dialog }: { instance: DataGridInstance<unknown>; dialog: AdaptiveDialog }) {
  const adaptive = instance.adaptive as DataGridAdaptiveController<unknown>;
  const text = useDataGridText();
  const chromeText = text;
  const engine = instance.engine;
  const snapshot = engine.getSnapshot();
  const columns = snapshot.columns.visible.filter((c) => c.flags.allowSorting && !instance.interaction.isSelectionColumn(c));
  const multiple = engine.getModuleState<{ mode?: string }>('sort')?.mode !== 'single';
  // Draft lives in the open dialog only and is discarded on close.
  const [draft, setDraft] = useState<readonly { columnId: ColumnId; direction: 'asc' | 'desc' }[]>(() =>
    snapshot.query.sorting.map((s) => ({ columnId: s.columnId, direction: s.direction })),
  );
  const firstRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);
  const directionOf = (id: ColumnId): Direction => draft.find((d) => d.columnId === id)?.direction ?? null;
  const set = (id: ColumnId, direction: Direction): void => {
    setDraft((prev) => {
      const rest = multiple ? prev.filter((d) => d.columnId !== id) : [];
      if (direction === null) return rest;
      const at = prev.findIndex((d) => d.columnId === id);
      const next = [...rest];
      // Keep the column's sort position when only its direction changes.
      if (multiple && at >= 0) next.splice(Math.min(at, next.length), 0, { columnId: id, direction });
      else next.push({ columnId: id, direction });
      return next;
    });
  };
  const apply = (): void => {
    adaptive.close();
    instance.dispatchFrom('pointer', { type: 'sort.set', sorting: draft.map((d) => ({ columnId: d.columnId, direction: d.direction })) } as never);
  };
  const choices: readonly [Direction, string][] = [
    [null, text('adaptiveSortNone')],
    ['asc', text('adaptiveSortAscending')],
    ['desc', text('adaptiveSortDescending')],
  ];
  let first = true;
  return (
    <DataGridPopover
      anchor={dialog.anchor}
      container={dialog.container}
      rtl={instance.rtl}
      role="dialog"
      label={text('sortDialogTitle')}
      className="salmon-data-grid-adaptive-dialog salmon-data-grid-sort-dialog"
      onDismiss={() => adaptive.close()}
    >
      <div className="salmon-data-grid-sort-dialog__list">
        {columns.map((column) => {
          const current = directionOf(column.columnId);
          const order = multiple && draft.length > 1 ? draft.findIndex((d) => d.columnId === column.columnId) + 1 : 0;
          return (
            <fieldset key={column.columnId} className="salmon-data-grid-sort-dialog__column" data-sorted={current ?? undefined}>
              <legend className="salmon-data-grid-sort-dialog__legend">
                {column.headerText}
                {order > 0 ? <span className="salmon-data-grid-adaptive-bar__badge">{order}</span> : null}
              </legend>
              <div className="salmon-data-grid-sort-dialog__choices">
                {choices.map(([direction, label]) => {
                  const ref = first ? firstRef : undefined;
                  first = false;
                  return (
                    <label key={direction ?? 'none'} className="salmon-data-grid-sort-dialog__choice">
                      <input
                        ref={ref}
                        type="radio"
                        className="salmon-data-grid-check"
                        name={`${instance.gridId}-sort-${column.columnId}`}
                        checked={current === direction}
                        onChange={() => set(column.columnId, direction)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="salmon-data-grid-dialog__actions">
        <button type="button" className="salmon-data-grid-button salmon-data-grid-button--primary" onClick={apply}>
          {text('adaptiveApply')}
        </button>
        <button type="button" className="salmon-data-grid-button" onClick={() => setDraft([])}>
          {chromeText('clear')}
        </button>
        <button type="button" className="salmon-data-grid-button" onClick={() => adaptive.close()}>
          {chromeText('cancel')}
        </button>
      </div>
    </DataGridPopover>
  );
}

export function FilterColumnsSheet({ instance, dialog }: { instance: DataGridInstance<unknown>; dialog: AdaptiveDialog }) {
  const adaptive = instance.adaptive as DataGridAdaptiveController<unknown>;
  const chrome = instance.chrome;
  const text = useDataGridText();
  const columns = instance.engine.getSnapshot().columns.visible.filter((c) => chrome.filterable(c));
  const firstRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <DataGridPopover
      anchor={dialog.anchor}
      container={dialog.container}
      rtl={instance.rtl}
      role="dialog"
      label={text('filterDialogTitle')}
      className="salmon-data-grid-adaptive-dialog salmon-data-grid-filter-columns"
      onDismiss={() => adaptive.close()}
    >
      <ul className="salmon-data-grid-filter-columns__list">
        {columns.map((column, i) => {
          const filtered = chrome.isFiltered(column.columnId);
          return (
            <li key={column.columnId}>
              <button
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className="salmon-data-grid-filter-columns__item"
                data-filtered={filtered ? '' : undefined}
                onClick={() => adaptive.pickFilterColumn(column.columnId)}
              >
                <span>{column.headerText}</span>
                {filtered ? <span className="salmon-data-grid-adaptive-bar__badge">{text('adaptiveFiltered')}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="salmon-data-grid-dialog__actions">
        <button type="button" className="salmon-data-grid-button" onClick={() => adaptive.close()}>
          {text('cancel')}
        </button>
      </div>
    </DataGridPopover>
  );
}
