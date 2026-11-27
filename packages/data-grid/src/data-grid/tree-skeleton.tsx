'use client';

// Skeleton row under a lazy parent whose children are loading (`virtualization.skeletonRows`, in tree mode): rendered by the tree
// cell of the loading row into the rendered rows, positioned under it with a
// gap of one row height opened before the next row. Client only (the server
// never loads children); part of the tree client chunk (tree-client-chunk.ts). The bars
// reuse the infinite scroll skeleton classes, so tree mode adds no CSS.

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RowId } from '@salmonui/data-grid/engine';
import type { DataGridInstance } from './instance.js';

const noopSubscribe = (): (() => void) => () => {};
const NONE = '';

/** `index:top` of the row after the loading parent, relative to the rendered rows; empty when not shown. */
function slotOf(instance: DataGridInstance<unknown>, rowId: RowId): string {
  const at = instance.engine.getRowIndex(rowId);
  if (at < 0) return NONE;
  const { start } = instance.layout.getRowWindow();
  const metrics = instance.layout.getRowMetrics();
  return `${at + 1}:${metrics.offsetOf(at + 1) - metrics.offsetOf(start)}`;
}

export function DataGridTreeSkeleton({ instance, rowId, loading }: { instance: DataGridInstance<unknown>; rowId: RowId; loading: boolean }): ReactNode {
  const v = instance.props.virtualization;
  const on = loading && !(typeof v === 'object' && v !== null && v.skeletonRows === false);
  const slot = useSyncExternalStore(on ? instance.layout.subscribe : noopSubscribe, () => (on ? slotOf(instance, rowId) : NONE), () => NONE);
  const rows = on && slot ? instance.getRowsElement() : null;
  if (!rows) return null;
  const [index, top] = slot.split(':') as [string, string];
  const scope = `[id=${JSON.stringify(instance.gridId)}]>.salmon-data-grid-viewport>.salmon-data-grid-body>.salmon-data-grid-rows>`;
  const columns = Math.min(8, Math.max(1, instance.engine.getSnapshot().columns.visible.length));
  const bars: ReactNode[] = [];
  for (let i = 0; i < columns; i++) bars.push(<span key={i} className="salmon-data-grid-skeleton-bar" aria-hidden="true" />);
  const style = { position: 'absolute', zIndex: 1, insetInline: 0, top: `${top}px` } as CSSProperties;
  return createPortal(
    <>
      <style>{`${scope}[data-row-index="${index}"]{margin-block-start:var(--salmon-data-grid-row-height)}`}</style>
      <div role="row" aria-hidden="true" className="salmon-data-grid-row salmon-data-grid-loading-row salmon-data-grid-skeleton-row" data-tree-loading={rowId} style={style}>
        {bars}
      </div>
    </>,
    rows,
  );
}
