'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/buttons/tag-group`: input chips. Imports no other family; the
// pointer drag is a lazy chunk.
export { Tag, TagGroup } from './tag-group/TagGroup.js';
export type { TagGroupProps, TagProps } from './tag-group/TagGroup.js';
export { moveTags } from './tag-group/move.js';
export type {
  TagDragEndEvent,
  TagDragEvent,
  TagDragStartEvent,
  TagDropEvent,
  TagEventSource,
  TagRemoveEvent,
  TagReorderEvent,
  TagSelectionEvent,
  TagSelectionMode,
  TagSize,
  TagTone,
} from './tag-group/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/buttons/tag-group', 'salmon-tag-group');
