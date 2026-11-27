// QueryBuilder reorder: keyboard move commands and the pointer drag
// controller. Drag state never touches React state: the drop indicator is a
// DOM element positioned in a requestAnimationFrame, and only the drop
// commits a change.

import { startPointerSession } from '@salmonui/core/internal/pointer-drag';
import { findNode, isGroupNode, type TreeGroup } from '@salmonui/core/internal/query/model';

export interface DropTarget {
  readonly groupId: string;
  /** Insertion index in the group before the move. */
  readonly index: number;
}

/**
 * Where Alt+ArrowUp (`-1`) / Alt+ArrowDown (`1`) moves a node: past its
 * sibling, into an adjacent unlocked group, or out of its group at the
 * ends. Null at the edges of the root.
 */
export function keyboardTarget(root: TreeGroup, id: string, dir: -1 | 1): DropTarget | null {
  const at = findNode(root, id);
  if (!at || !at.parent) return null;
  const { parent, index } = at;
  const sibling = parent.filters[index + dir];
  if (sibling) {
    if (isGroupNode(sibling) && !sibling.locked) return { groupId: sibling.id, index: dir < 0 ? sibling.filters.length : 0 };
    return { groupId: parent.id, index: dir < 0 ? index - 1 : index + 2 };
  }
  const grand = at.ancestors[at.ancestors.length - 2];
  if (!grand) return null;
  const parentIndex = grand.filters.indexOf(parent);
  return { groupId: grand.id, index: dir < 0 ? parentIndex : parentIndex + 1 };
}

export interface PointerDragOptions {
  readonly root: HTMLElement;
  readonly nodeId: string;
  readonly cls: string;
  onDrag(target: DropTarget | null): void;
  onDrop(target: DropTarget): void;
}

/**
 * Starts a reorder drag from a handle's `pointerdown` on the shared
 * pointer-drag session (internal/pointer-drag.ts: capture, one hit test per
 * frame, Escape cancels); returns a cancel function.
 */
export function startReorderDrag(handle: HTMLElement, event: PointerEvent, options: PointerDragOptions): () => void {
  const { root, nodeId, cls } = options;
  const doc = root.ownerDocument;
  const dragged = root.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  const indicator = doc.createElement('div');
  indicator.className = `${cls}__drop-indicator`;
  indicator.hidden = true;
  root.append(indicator);
  dragged?.setAttribute('data-dragging', '');
  let target: DropTarget | null = null;
  const measure = (x: number, y: number): void => {
    const hit = doc.elementFromPoint(x, y)?.closest<HTMLElement>('[data-node-id]');
    target = null;
    if (hit && root.contains(hit) && !(dragged && dragged.contains(hit))) {
      const box = root.getBoundingClientRect();
      const rect = hit.getBoundingClientRect();
      const isGroup = hit.classList.contains(`${cls}__group`);
      let line: number;
      if (isGroup) {
        // Over a group's header: first position in the group.
        target = { groupId: hit.dataset['nodeId'] as string, index: 0 };
        line = (hit.querySelector(`:scope > .${cls}__bar`)?.getBoundingClientRect().bottom ?? rect.top) - box.top;
      } else {
        const group = hit.parentElement?.closest<HTMLElement>(`.${cls}__group`);
        const members = group ? [...group.children].filter((c) => (c as HTMLElement).dataset['nodeId'] !== undefined) : [];
        const after = y > rect.top + rect.height / 2;
        target = group ? { groupId: group.dataset['nodeId'] as string, index: members.indexOf(hit) + (after ? 1 : 0) } : null;
        line = (after ? rect.bottom : rect.top) - box.top;
      }
      indicator.hidden = target === null;
      indicator.style.insetBlockStart = `${line}px`;
    } else indicator.hidden = true;
    options.onDrag(target);
  };
  const session = startPointerSession(
    handle,
    event,
    {
      onMove: (e) => measure(e.clientX, e.clientY),
      onEnd: (e, _rect, canceled) => {
        if (!canceled) measure(e.clientX, e.clientY);
        indicator.remove();
        dragged?.removeAttribute('data-dragging');
        if (!canceled && target) options.onDrop(target);
      },
    },
    { rect: NO_RECT, coalesced: false, escape: true },
  );
  if (!session) {
    indicator.remove();
    dragged?.removeAttribute('data-dragging');
    return () => {};
  }
  return session.cancel;
}

const NO_RECT = Object.freeze({ left: 0, top: 0, width: 0, height: 0 });
