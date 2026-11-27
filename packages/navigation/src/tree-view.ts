'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/tree-view`: TreeView.
// Self-contained: internal modules only (tree store, virtual list, roving,
// dnd math); rename and pointer drag are lazy chunks.
export { TreeView } from './tree-view/TreeView.js';
export { moveTreeItems } from './tree-view/move.js';
export type { MoveTreeItemsOptions } from './tree-view/move.js';
export { TREE_VIEW_DEFAULT_LOCALE_TEXT } from './tree-view/locale.js';
export type { TreeViewLocaleText } from './tree-view/locale.js';
export type {
  TreeViewApi,
  TreeViewBeforeCheckedChangeEvent,
  TreeViewBeforeExpandedChangeEvent,
  TreeViewBeforeMoveEvent,
  TreeViewBeforeRenameEvent,
  TreeViewBeforeSelectedChangeEvent,
  TreeViewCancelableEvent,
  TreeViewCheckedChangeEvent,
  TreeViewDropPosition,
  TreeViewEventSource,
  TreeViewExpandedChangeEvent,
  TreeViewItemClickEvent,
  TreeViewItemContext,
  TreeViewItemInfo,
  TreeViewKey,
  TreeViewLinkProps,
  TreeViewMoveEvent,
  TreeViewProps,
  TreeViewRenameEvent,
  TreeViewSelectedChangeEvent,
} from './tree-view/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/tree-view', 'salmon-tree-view');
