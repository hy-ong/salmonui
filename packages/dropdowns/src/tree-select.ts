'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/dropdowns/tree-select`: TreeSelect (a dropdown with a tree popup).
// Composes the shared dropdown trigger and popup
// shell (dropdown/) with the internal tree store; the tree popup is a lazy chunk.
export { TreeSelect } from './tree-select/TreeSelect.js';
export { TREE_SELECT_DEFAULT_LOCALE_TEXT } from './tree-select/locale.js';
export type {
  TreeSelectExpandedChangeEvent,
  TreeSelectExpandOn,
  TreeSelectItemRenderProps,
  TreeSelectLocaleText,
  TreeSelectMultipleProps,
  TreeSelectPart,
  TreeSelectProps,
  TreeSelectSingleProps,
  TreeSelectValue,
} from './tree-select/types.js';
export type {
  DropdownEventSource as TreeSelectEventSource,
  DropdownOpenChangeEvent as TreeSelectOpenChangeEvent,
  DropdownOpenChangeReason as TreeSelectOpenChangeReason,
  DropdownPartProps as TreeSelectPartProps,
  DropdownValueChangeEvent as TreeSelectValueChangeEvent,
  DropdownValueChangeReason as TreeSelectValueChangeReason,
} from './dropdown/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/dropdowns/tree-select', 'salmon-tree-select');
