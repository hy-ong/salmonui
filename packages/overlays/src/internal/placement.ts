// Public placement vocabulary of the Layout overlays: twelve logical placements in camel case, resolved
// against `dir` by `internal/position.ts`. `start` / `end` are the
// inline-start / inline-end sides; the second word aligns along the edge.

import type { Placement } from '@salmonui/core/internal/position';

export type OverlayPlacement =
  | 'top'
  | 'topStart'
  | 'topEnd'
  | 'bottom'
  | 'bottomStart'
  | 'bottomEnd'
  | 'start'
  | 'startTop'
  | 'startBottom'
  | 'end'
  | 'endTop'
  | 'endBottom';

/**
 * The positioning primitive's placement for a public placement:
 * `topStart` -> `top-start`; on the inline sides the block word maps to the
 * alignment (`startTop` -> `start-start`, `endBottom` -> `end-end`).
 */
export function toPlacement(placement: OverlayPlacement | undefined, fallback: OverlayPlacement): Placement {
  return (placement ?? fallback).replace(/[A-Z]/, (c) => `-${c.toLowerCase()}`).replace('-top', '-start').replace('-bottom', '-end') as Placement;
}

/** `offset` prop form shared by Tooltip and Popover. */
export type OverlayOffset = number | { readonly mainAxis?: number | undefined; readonly crossAxis?: number | undefined };

export function splitOffset(offset: OverlayOffset | undefined, fallback: number): { main: number; cross: number } {
  if (offset === undefined) return { main: fallback, cross: 0 };
  if (typeof offset === 'number') return { main: offset, cross: 0 };
  return { main: offset.mainAxis ?? fallback, cross: offset.crossAxis ?? 0 };
}
