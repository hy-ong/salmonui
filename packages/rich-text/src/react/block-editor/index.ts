// Barrel of src/react/block-editor: BlockEditor. Server-safe: the
// controller and UI load with dynamic import() on the client.
export { BlockEditor } from './BlockEditor.js';
export { BLOCK_EDITOR_DEFAULT_LOCALE_TEXT, type BlockEditorLocaleText } from './locale.js';
export type {
  BlockEditorProps,
  BlockEditorActions,
  BlockEditorSelection,
  BlockEditorTransformId,
  BlockEditorSlashItemId,
  BlockEditorSlashItem,
  BlockEditorCustomItem,
  BlockEditorItemContext,
  BlockEditorInlineToolbarItemId,
  BlockEditorInlineToolbarItem,
  BlockEditorBlockActionId,
  BlockEditorBlockAction,
  BlockEditorContextMenuItemId,
  BlockEditorContextMenuItem,
  BlockEditorCommandId,
  BlockEditorBlockChangeEvent,
  BlockEditorBlockLocation,
  BlockEditorBlockMoveEvent,
  BlockEditorBeforeBlockMoveEvent,
  BlockEditorBeforePasteEvent,
  BlockEditorPasteEvent,
  BlockEditorMentions,
  BlockEditorLabels,
} from './types.js';
