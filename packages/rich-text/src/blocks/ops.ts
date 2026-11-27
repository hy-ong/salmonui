// Immutable block array helpers for the controlled value API: the
// value is the block API, these are the array edits. Unchanged subtrees keep
// their identity (structural sharing); a no-op returns the input array.

import type { Block, BlockPatch, BlockPosition } from './types.js';
import { findBlock } from './find.js';

export { findBlock };


/** Id of the block's parent (`null` at the top level, `undefined` when not found). */
export function findParentId(blocks: readonly Block[], id: string, parent: string | null = null): string | null | undefined {
  for (const b of blocks) {
    if (b.id === id) return parent;
    if (b.children) {
      const found = findParentId(b.children, id, b.id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Calls `fn` on every block in document order. */
export function forEachBlock(blocks: readonly Block[], fn: (block: Block, parent: Block | null, index: number) => void, parent: Block | null = null): void {
  blocks.forEach((b, i) => {
    fn(b, parent, i);
    if (b.children) forEachBlock(b.children, fn, b);
  });
}

// Rebuilds the list with `edit` applied to the array that `match` selects.
function editLists(blocks: readonly Block[], edit: (list: readonly Block[]) => readonly Block[] | null): readonly Block[] {
  const direct = edit(blocks);
  if (direct) return direct;
  let changed: Block[] | null = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i] as Block;
    if (!b.children) continue;
    const next = editLists(b.children, edit);
    if (next !== b.children) {
      changed ??= blocks.slice();
      const copy: Block = { ...b };
      if (next.length) copy.children = next as Block[];
      else delete copy.children;
      changed[i] = copy;
      return changed;
    }
  }
  return blocks;
}

function withChildren(block: Block, children: Block[]): Block {
  const copy: Block = { ...block };
  if (children.length) copy.children = children;
  else delete copy.children;
  return copy;
}

/**
 * Inserts blocks before or after the block `before` / `after`, or into
 * `parent`'s children at `index` (default: last). Without a position they go
 * at the end. Returns the input unchanged when the anchor does not exist.
 */
export function insertBlocks(blocks: readonly Block[], inserted: readonly Block[], position?: BlockPosition): Block[] {
  if (inserted.length === 0) return blocks as Block[];
  if (!position) return [...blocks, ...inserted];
  if ('parent' in position) {
    return updateIn(blocks, position.parent, (b) => {
      const kids = b.children ?? [];
      const at = position.index === undefined ? kids.length : Math.max(0, Math.min(kids.length, position.index));
      return withChildren(b, [...kids.slice(0, at), ...inserted, ...kids.slice(at)]);
    });
  }
  const anchor = 'before' in position ? position.before : position.after;
  const after = !('before' in position);
  return editLists(blocks, (list) => {
    const i = list.findIndex((b) => b.id === anchor);
    if (i < 0) return null;
    const at = after ? i + 1 : i;
    return [...list.slice(0, at), ...inserted, ...list.slice(at)];
  }) as Block[];
}

/** Removes the blocks with these ids (with their children). */
export function removeBlocks(blocks: readonly Block[], ids: readonly string[]): Block[] {
  if (ids.length === 0) return blocks as Block[];
  const set = new Set(ids);
  const walk = (list: readonly Block[]): readonly Block[] => {
    let out: Block[] | null = null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Block;
      if (set.has(b.id)) {
        out ??= list.slice(0, i);
        continue;
      }
      let next = b;
      if (b.children) {
        const kids = walk(b.children);
        if (kids !== b.children) next = withChildren(b, kids as Block[]);
      }
      if (out) out.push(next);
      else if (next !== b) {
        out = list.slice(0, i);
        out.push(next);
      }
    }
    return out ?? list;
  };
  return walk(blocks) as Block[];
}

function updateIn(blocks: readonly Block[], id: string, fn: (block: Block) => Block): Block[] {
  return editLists(blocks, (list) => {
    const i = list.findIndex((b) => b.id === id);
    if (i < 0) return null;
    const next = fn(list[i] as Block);
    if (next === list[i]) return list;
    const copy = list.slice();
    copy[i] = next;
    return copy;
  }) as Block[];
}

/**
 * Updates one block: `props` are merged, `type`, `content` and `children`
 * replace; or pass a function returning the new block (its id is kept).
 */
export function updateBlock(blocks: readonly Block[], id: string, patch: BlockPatch | ((block: Block) => Block)): Block[] {
  return updateIn(blocks, id, (b) => {
    if (typeof patch === 'function') {
      const next = patch(b);
      return next === b ? b : { ...next, id: b.id };
    }
    const next: Block = { ...b };
    if (patch.type !== undefined) next.type = patch.type;
    if (patch.props !== undefined) next.props = { ...b.props, ...patch.props };
    if (patch.content !== undefined) next.content = patch.content;
    if (patch.children !== undefined) {
      if (patch.children.length) next.children = patch.children;
      else delete next.children;
    }
    return next;
  });
}

/**
 * Moves a block (with its children) before or after another block, or into
 * another block's children. Moving a block into itself or its own subtree,
 * or relative to a missing block, returns the input unchanged.
 */
export function moveBlock(blocks: readonly Block[], id: string, position: BlockPosition): Block[] {
  const block = findBlock(blocks, id);
  if (!block) return blocks as Block[];
  const anchor = 'parent' in position ? position.parent : 'before' in position ? position.before : position.after;
  if (anchor === id || findBlock(block.children ?? [], anchor)) return blocks as Block[];
  if (!findBlock(blocks, anchor)) return blocks as Block[];
  const removed = removeBlocks(blocks, [id]);
  return insertBlocks(removed, [block], position);
}
