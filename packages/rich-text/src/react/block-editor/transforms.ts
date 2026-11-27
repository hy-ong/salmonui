// Pure block-level edits of BlockEditor (turnInto, duplicate /
// delete / move, keyboard moves, change events). Server-safe;
// the controller applies the results through blocksToHtml.
import { findBlock, insertBlocks, removeBlocks, updateBlock } from '../../blocks/ops.js';
import type { Block, BlockPosition, BlockType, InlineContent } from '../../blocks/types.js';
import type { BlockEditorBlockChangeEvent, BlockEditorBlockLocation, BlockEditorTransformId } from './types.js';

export const TRANSFORMS: readonly BlockEditorTransformId[] = ['paragraph', 'heading1', 'heading2', 'heading3', 'bulletList', 'numberedList', 'checklist', 'quote', 'callout', 'code', 'toggle'];

const WITH_CHILDREN: ReadonlySet<BlockType> = new Set(['bulletListItem', 'numberedListItem', 'checklistItem', 'quote', 'callout', 'toggle']);
const TEXT_TYPES: ReadonlySet<BlockType> = new Set(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checklistItem', 'quote', 'callout', 'code', 'toggle']);

/** The transform id that describes a block (for the menus' checked entry). */
export function transformOf(block: Block): BlockEditorTransformId | null {
  switch (block.type) {
    case 'paragraph':
      return 'paragraph';
    case 'heading': {
      const level = block.props?.level;
      return level === 1 ? 'heading1' : level === 2 ? 'heading2' : level === 3 ? 'heading3' : null;
    }
    case 'bulletListItem':
      return 'bulletList';
    case 'numberedListItem':
      return 'numberedList';
    case 'checklistItem':
      return 'checklist';
    case 'quote':
      return 'quote';
    case 'callout':
      return 'callout';
    case 'code':
      return 'code';
    case 'toggle':
      return 'toggle';
    default:
      return null;
  }
}

function target(type: BlockEditorTransformId): { type: BlockType; props?: Record<string, unknown> } {
  switch (type) {
    case 'heading1':
      return { type: 'heading', props: { level: 1 } };
    case 'heading2':
      return { type: 'heading', props: { level: 2 } };
    case 'heading3':
      return { type: 'heading', props: { level: 3 } };
    case 'bulletList':
      return { type: 'bulletListItem' };
    case 'numberedList':
      return { type: 'numberedListItem' };
    case 'checklist':
      return { type: 'checklistItem', props: { checked: false } };
    case 'quote':
      return { type: 'quote' };
    case 'callout':
      return { type: 'callout', props: { tone: 'info' } };
    case 'code':
      return { type: 'code' };
    case 'toggle':
      return { type: 'toggle' };
    default:
      return { type: 'paragraph' };
  }
}

function plainText(content: readonly InlineContent[] | undefined): string {
  return (content ?? [])
    .map((c) => (c.type === 'text' ? c.text : c.type === 'link' ? c.content.map((t) => t.text).join('') : c.type === 'hardBreak' ? '\n' : c.trigger + c.label))
    .join('');
}

/** Turns a block into another type, keeping its text; children the new type cannot hold follow it. */
export function turnInto(blocks: readonly Block[], id: string, type: BlockEditorTransformId): Block[] {
  const block = findBlock(blocks, id);
  if (!block || !TEXT_TYPES.has(block.type)) return blocks as Block[];
  const t = target(type);
  const next: Block = { id: block.id, type: t.type };
  const keep = block.type === 'paragraph' || block.type === 'heading' ? { ...block.props } : {};
  delete keep.level;
  const props = t.type === 'paragraph' || t.type === 'heading' ? { ...(keep.textAlign ? { textAlign: keep.textAlign } : {}), ...t.props } : { ...t.props };
  if (Object.keys(props).length) next.props = props;
  if (t.type === 'code') {
    const text = plainText(block.content);
    next.content = text ? [{ type: 'text', text }] : [];
  } else if (block.type === 'code') {
    const text = plainText(block.content);
    next.content = text ? [{ type: 'text', text }] : [];
  } else next.content = block.content ?? [];
  const children = block.children ?? [];
  if (WITH_CHILDREN.has(t.type)) {
    if (children.length) next.children = children;
    return updateBlock(blocks, id, () => next);
  }
  const replaced = updateBlock(blocks, id, () => next);
  return children.length ? insertBlocks(replaced, children, { after: id }) : replaced;
}

/** A copy with fresh ids for the block and all its descendants. */
export function cloneWithIds(block: Block, nextId: () => string): Block {
  const copy: Block = { ...block, id: nextId() };
  if (block.children) copy.children = block.children.map((c) => cloneWithIds(c, nextId));
  return copy;
}

export function duplicate(blocks: readonly Block[], id: string, nextId: () => string): { blocks: Block[]; id: string | null } {
  const block = findBlock(blocks, id);
  if (!block) return { blocks: blocks as Block[], id: null };
  const copy = cloneWithIds(block, nextId);
  return { blocks: insertBlocks(blocks, [copy], { after: id }), id: copy.id };
}

/** Removes blocks; an emptied document keeps one empty paragraph. */
export function remove(blocks: readonly Block[], ids: readonly string[], nextId: () => string): Block[] {
  const next = removeBlocks(blocks, ids);
  return next.length ? next : [{ id: nextId(), type: 'paragraph', content: [] }];
}

/** Parent id and index of a block. */
export function locate(blocks: readonly Block[], id: string, parentId: string | null = null): BlockEditorBlockLocation | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i] as Block;
    if (b.id === id) return { parentId, index: i };
    if (b.children) {
      const found = locate(b.children, id, b.id);
      if (found) return found;
    }
  }
  return null;
}

function siblings(blocks: readonly Block[], parentId: string | null): readonly Block[] {
  return parentId === null ? blocks : (findBlock(blocks, parentId)?.children ?? []);
}

/** Position for a keyboard move (Mod+Shift+Arrow): past the neighbour, or out of the parent at the edge. */
export function stepPosition(blocks: readonly Block[], id: string, direction: -1 | 1): BlockPosition | null {
  const at = locate(blocks, id);
  if (!at) return null;
  const list = siblings(blocks, at.parentId);
  const neighbour = list[at.index + direction];
  if (neighbour) return direction < 0 ? { before: neighbour.id } : { after: neighbour.id };
  if (at.parentId === null) return null;
  return direction < 0 ? { before: at.parentId } : { after: at.parentId };
}

interface Entry {
  block: Block;
  parentId: string | null;
  index: number;
}

function flatten(blocks: readonly Block[], parentId: string | null, out: Map<string, Entry>): void {
  blocks.forEach((b, index) => {
    out.set(b.id, { block: b, parentId, index });
    if (b.children) flatten(b.children, b.id, out);
  });
}

function own(block: Block): string {
  return JSON.stringify([block.type, block.props ?? null, block.content ?? null]);
}

/** Indexes (into `seq`) of a longest increasing subsequence. */
function lis(seq: readonly number[]): Set<number> {
  const tails: number[] = [];
  const prev: number[] = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i] as number;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((seq[tails[mid] as number] as number) < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1] as number;
    tails[lo] = i;
  }
  const keep = new Set<number>();
  let k = tails.length ? (tails[tails.length - 1] as number) : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k] as number;
  }
  return keep;
}

/**
 * Block-level changes between two documents (`onBlockChange`): added
 * and removed ids, updated own content (type, props, text), and moves: a new
 * parent, or a block out of the longest run of siblings that kept their order.
 */
export function diffBlocks(prev: readonly Block[], next: readonly Block[]): BlockEditorBlockChangeEvent[] {
  if (prev === next) return [];
  const a = new Map<string, Entry>();
  const b = new Map<string, Entry>();
  flatten(prev, null, a);
  flatten(next, null, b);
  const events: BlockEditorBlockChangeEvent[] = [];
  for (const [id, before] of a) if (!b.has(id)) events.push({ type: 'remove', block: before.block });
  const moved = new Set<string>();
  const groups = new Map<string | null, string[]>();
  for (const [id, after] of b) {
    const before = a.get(id);
    if (!before) continue;
    if (before.parentId !== after.parentId) moved.add(id);
    else {
      const list = groups.get(after.parentId) ?? [];
      list.push(id);
      groups.set(after.parentId, list);
    }
  }
  for (const ids of groups.values()) {
    const keep = lis(ids.map((id) => (a.get(id) as Entry).index));
    ids.forEach((id, i) => {
      if (!keep.has(i)) moved.add(id);
    });
  }
  for (const [id, after] of b) {
    const before = a.get(id);
    if (!before) {
      events.push({ type: 'add', block: after.block });
      continue;
    }
    if (before.block !== after.block && own(before.block) !== own(after.block)) events.push({ type: 'update', block: after.block });
    if (moved.has(id)) events.push({ type: 'move', block: after.block });
  }
  return events;
}
