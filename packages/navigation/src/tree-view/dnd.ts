// Pointer drag and drop for TreeView, a lazy chunk loaded
// when `draggable` is set. Everything here is a DOM transient: the drop
// indicator is a `data-drop` attribute on the target row and the dragged
// rows carry `data-dragging`; React state is never touched until the drop
// reports `onMove`. Drop math from internal/dnd.

import { dropPosition, edgeScrollStep, pastThreshold, type DropPosition } from '@salmonui/core/internal/dnd';
import type { TreeKey } from '@salmonui/core/internal/tree-store';

export interface TreeDragController {
  readonly treeId: string;
  readonly group: string | undefined;
  idOf(row: Element): TreeKey | undefined;
  canDrag(id: TreeKey): boolean;
  dragIds(id: TreeKey): TreeKey[];
  itemsOf(ids: readonly TreeKey[]): readonly unknown[];
  accepts(targetId: TreeKey, ids: readonly TreeKey[], sameTree: boolean): boolean;
  drop(ids: readonly TreeKey[], items: readonly unknown[], targetId: TreeKey, position: DropPosition, sourceTreeId: string | undefined): boolean;
}

/** Every attached tree (module state of this chunk, not render state). */
const trees = new Map<Element, () => TreeDragController>();

interface Target {
  readonly root: Element;
  readonly row: HTMLElement;
  readonly id: TreeKey;
  readonly position: DropPosition;
}

export function attachTreeDrag(root: HTMLElement, controller: () => TreeDragController, held: readonly Event[] = []): () => void {
  trees.set(root, controller);
  let press: { x: number; y: number; id: TreeKey; pointerId: number; row: HTMLElement } | null = null;
  let ids: TreeKey[] | null = null;
  let target: Target | null = null;
  let lastY = 0;
  let frame = 0;
  const doc = root.ownerDocument;

  const clearTarget = (): void => {
    target?.row.removeAttribute('data-drop');
    target = null;
  };
  const end = (): void => {
    clearTarget();
    for (const el of root.querySelectorAll('[data-dragging]')) el.removeAttribute('data-dragging');
    root.removeAttribute('data-drag-active');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (press && root.hasPointerCapture?.(press.pointerId)) root.releasePointerCapture(press.pointerId);
    press = null;
    ids = null;
    doc.removeEventListener('keydown', onKey, true);
  };
  const locate = (x: number, y: number): Target | null => {
    const el = doc.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>('[role="treeitem"]');
    const tree = row?.closest('.salmon-tree-view');
    if (!row || !tree || !ids) return null;
    const get = trees.get(tree);
    if (!get) return null;
    const source = controller();
    const dest = get();
    const same = tree === root;
    if (!same && (source.group === undefined || source.group !== dest.group)) return null;
    const id = dest.idOf(row);
    if (id === undefined) return null;
    const rect = row.getBoundingClientRect();
    const position = dropPosition(rect.height > 0 ? (y - rect.top) / rect.height : 0.5, true);
    if (!dest.accepts(id, ids, same)) return null;
    return { root: tree, row, id, position };
  };
  const autoScroll = (): void => {
    frame = 0;
    if (!ids) return;
    const rect = root.getBoundingClientRect();
    const step = edgeScrollStep(lastY, rect.top, rect.bottom);
    if (step !== 0) {
      root.scrollTop += step;
      frame = requestAnimationFrame(autoScroll);
    }
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    end();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const t = event.target as HTMLElement;
    if (t.closest('[data-part], input, a')) return;
    const row = t.closest<HTMLElement>('[role="treeitem"]');
    if (!row || !root.contains(row)) return;
    const c = controller();
    const id = c.idOf(row);
    if (id === undefined || !c.canDrag(id)) return;
    press = { x: event.clientX, y: event.clientY, id, pointerId: event.pointerId, row };
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!ids) {
      if (!pastThreshold(event.clientX - press.x, event.clientY - press.y)) return;
      ids = controller().dragIds(press.id);
      // A held press replayed after a touch release has no pointer left to capture.
      try {
        root.setPointerCapture?.(press.pointerId);
      } catch {}
      root.setAttribute('data-drag-active', '');
      press.row.setAttribute('data-dragging', '');
      doc.addEventListener('keydown', onKey, true);
    }
    event.preventDefault();
    lastY = event.clientY;
    const next = locate(event.clientX, event.clientY);
    if (next?.row !== target?.row || next?.position !== target?.position) {
      clearTarget();
      target = next;
      target?.row.setAttribute('data-drop', target.position);
    }
    if (!frame) frame = requestAnimationFrame(autoScroll);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.pointerId) return;
    const t = target;
    const moved = ids;
    try {
      if (moved && t) {
        const source = controller();
        const dest = trees.get(t.root)?.();
        dest?.drop(moved, source.itemsOf(moved), t.id, t.position, t.root === root ? undefined : source.treeId);
      }
    } finally {
      // A throwing onMove must not leave the drag state (and the drop indicator) behind.
      end();
    }
  };
  const onClickCapture = (event: MouseEvent): void => {
    // The click that ends a drag does not select.
    if (root.hasAttribute('data-drag-active')) event.stopPropagation();
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', end);
  root.addEventListener('click', onClickCapture, true);
  // A press that started before this chunk loaded (held by the component) continues here.
  const on: Record<string, (event: PointerEvent) => void> = { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: end };
  for (const event of held) on[event.type]?.(event as PointerEvent);
  return () => {
    end();
    trees.delete(root);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', end);
    root.removeEventListener('click', onClickCapture, true);
  };
}
