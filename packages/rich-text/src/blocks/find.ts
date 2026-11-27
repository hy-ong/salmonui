// findBlock on its own module, so the BlockEditor shell imports it without the other helpers.
import type { Block } from './types.js';

/** Finds a block by id anywhere in the tree (depth-first, document order). */
export function findBlock(blocks: readonly Block[], id: string): Block | undefined {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBlock(b.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
