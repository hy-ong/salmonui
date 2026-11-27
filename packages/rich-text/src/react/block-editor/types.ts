// BlockEditor public types.
import type { CSSProperties, Ref } from 'react';
import type { MentionData, MentionItem } from '@salmonui/dropdowns/mention';
import type { Block, BlockPatch, BlockPosition, BlockType } from '../../blocks/types.js';
import type { PasteCleanupOptions } from '../../html/paste.js';
import type { SanitizeHook } from '../../html/sanitize.js';
import type { HighlightFn } from '../../engine/plugins.js';
import type { RichTextExtension } from '../../engine/types.js';
import type { BlockEditorLocaleText } from './locale.js';

/** Block types a block can be turned into (`'turnInto'`, `transforms`). */
export type BlockEditorTransformId =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'checklist'
  | 'quote'
  | 'callout'
  | 'code'
  | 'toggle';

/** Built-in slash menu entries: the transforms plus inserted blocks. */
export type BlockEditorSlashItemId = BlockEditorTransformId | 'image' | 'table' | 'divider';

/** What a custom menu entry receives. */
export interface BlockEditorItemContext {
  /** The block the menu belongs to (the caret's block for the slash menu and toolbar). */
  readonly block: Block | null;
  readonly actions: BlockEditorActions;
}

/** A custom entry of the slash menu, block action menu, context menu or inline toolbar. */
export interface BlockEditorCustomItem {
  readonly id: string;
  readonly label: string;
  /** Extra search words (slash menu). */
  readonly keywords?: readonly string[];
  /** Group heading in the slash menu (default: the built-in groups). */
  readonly group?: string;
  readonly disabled?: boolean;
  readonly onSelect: (context: BlockEditorItemContext) => void;
}

export type BlockEditorSlashItem = BlockEditorSlashItemId | BlockEditorCustomItem;
/** Inline (selection) toolbar entries. */
export type BlockEditorInlineToolbarItemId = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link' | 'turnInto';
export type BlockEditorInlineToolbarItem = BlockEditorInlineToolbarItemId | BlockEditorCustomItem;
/** Block action menu entries; image and table blocks add their own. */
export type BlockEditorBlockActionId = 'duplicate' | 'delete' | 'moveUp' | 'moveDown' | 'turnInto';
export type BlockEditorBlockAction = BlockEditorBlockActionId | BlockEditorCustomItem;
/** Context menu entries. */
export type BlockEditorContextMenuItemId = 'cut' | 'copy' | 'duplicate' | 'delete' | 'moveUp' | 'moveDown' | 'turnInto';
export type BlockEditorContextMenuItem = BlockEditorContextMenuItemId | BlockEditorCustomItem;

/** Commands `keyBindings` can rebind: the block commands plus every RichTextEditor command id. */
export type BlockEditorCommandId = 'moveBlockUp' | 'moveBlockDown' | 'duplicateBlock' | 'deleteBlock' | 'blockMenu' | 'contextMenu' | 'print' | (string & {});

/** Caret position: the block and the character offset in its text. */
export interface BlockEditorSelection {
  readonly blockId: string;
  readonly offset: number;
}

/** `onBlockChange`. */
export interface BlockEditorBlockChangeEvent {
  readonly type: 'add' | 'update' | 'remove' | 'move';
  readonly block: Block;
}

/** Where a block is: parent block id (null at the top level) and index among its siblings. */
export interface BlockEditorBlockLocation {
  readonly parentId: string | null;
  readonly index: number;
}

/** `onBlockMove`. */
export interface BlockEditorBlockMoveEvent {
  readonly block: Block;
  readonly from: BlockEditorBlockLocation;
  readonly position: BlockPosition;
  readonly source: 'pointer' | 'keyboard' | 'api';
}

/** `onBeforeBlockMove`: `preventDefault()` cancels the move. */
export interface BlockEditorBeforeBlockMoveEvent extends BlockEditorBlockMoveEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** `onBeforePaste`: `preventDefault()` cancels the paste. */
export interface BlockEditorBeforePasteEvent {
  readonly html: string;
  readonly text: string;
  readonly files: readonly File[];
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** `onPaste`: after pasted content was applied. */
export interface BlockEditorPasteEvent {
  readonly html: string;
  readonly text: string;
  /** The document after the paste. */
  readonly blocks: Block[];
}

/** Mentions through the contenteditable `Mention` target. */
export interface BlockEditorMentions<T = MentionItem> {
  /** Trigger (default `'@'`). */
  readonly trigger?: string;
  readonly items: MentionData<T>;
}

/** Labels: inserted as label atoms. An item's `tone` colors the label. */
export interface BlockEditorLabels<T = MentionItem & { readonly tone?: string }> {
  /** Trigger (default `'#'`). */
  readonly trigger?: string;
  readonly items: MentionData<T>;
}

/** `actionsRef`. */
export interface BlockEditorActions {
  /** The current document. */
  getBlocks(): Block[];
  getBlock(id: string): Block | undefined;
  insertBlocks(blocks: readonly Block[], position?: BlockPosition): void;
  removeBlocks(ids: readonly string[]): void;
  updateBlock(id: string, patch: BlockPatch): void;
  /** Returns false when cancelled by `onBeforeBlockMove` or not possible. */
  moveBlock(id: string, position: BlockPosition): boolean;
  turnInto(id: string, type: BlockEditorTransformId): void;
  getSelection(): BlockEditorSelection | null;
  setSelection(selection: BlockEditorSelection): void;
  focus(): void;
  /** Runs a toolbar action or command by id (`bold`, `heading2`, `insertTable`, `undo`, `print`, ...). */
  runCommand(id: string, ...args: unknown[]): boolean;
  getHtml(): string;
  print(): void;
}

export interface BlockEditorProps {
  /** Controlled document. Pass back what `onChange` gave to keep the editor in sync. */
  readonly value?: readonly Block[];
  readonly defaultValue?: readonly Block[];
  readonly onChange?: (blocks: Block[]) => void;
  readonly onBlockChange?: (event: BlockEditorBlockChangeEvent) => void;
  readonly onSelectionChange?: (selection: BlockEditorSelection | null) => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly readOnly?: boolean;
  /** Shown in an empty document. */
  readonly placeholder?: string;
  /** Slash menu entries (default: every built-in); `false` turns the menu off. */
  readonly slashMenu?: false | readonly BlockEditorSlashItem[];
  /** Selection toolbar entries (default bold, italic, underline, strike, code, link, turnInto); `false` hides it. */
  readonly inlineToolbar?: false | readonly BlockEditorInlineToolbarItem[];
  /** Types offered by `'turnInto'` (default: all). */
  readonly transforms?: readonly BlockEditorTransformId[];
  /** Block action menu entries (default duplicate, delete, moveUp, moveDown, turnInto). */
  readonly blockActions?: readonly BlockEditorBlockAction[];
  /** Context menu entries (default: all built-in); `false` keeps the browser menu. */
  readonly contextMenu?: false | readonly BlockEditorContextMenuItem[];
  /** Drag handles reorder and nest blocks (default true). */
  readonly draggable?: boolean;
  readonly onBeforeBlockMove?: (event: BlockEditorBeforeBlockMoveEvent) => void;
  readonly onBlockMove?: (event: BlockEditorBlockMoveEvent) => void;
  /** Uploads an image, audio or video file; the block is pending until it settles. Default: a blob URL. */
  readonly onUpload?: (file: File) => Promise<{ readonly src: string; readonly alt?: string }>;
  /** Code block languages. */
  readonly codeLanguages?: readonly { readonly value: string; readonly label: string }[];
  /** Code highlighting hook. */
  readonly highlight?: HighlightFn;
  /** Paste cleanup. Default mode `'clean'`. */
  readonly pasteCleanup?: Omit<PasteCleanupOptions, 'embedHosts' | 'sanitize'>;
  readonly onBeforePaste?: (event: BlockEditorBeforePasteEvent) => void;
  readonly onPaste?: (event: BlockEditorPasteEvent) => void;
  /** Undo steps kept (default 30). */
  readonly undoLimit?: number;
  /** Command id -> key chord (ProseMirror key names, `Mod-` = Ctrl/Cmd); `false` removes the default. */
  readonly keyBindings?: Readonly<Partial<Record<BlockEditorCommandId, string | false>>>;
  readonly mentions?: BlockEditorMentions;
  readonly labels?: BlockEditorLabels;
  /** Engine extensions, for example `createCollaboration()` from `/collab`. Keep the array stable. */
  readonly extensions?: readonly RichTextExtension[];
  /** Hosts whose iframe embeds are kept by the sanitizer. */
  readonly embedHosts?: readonly string[];
  /** Further sanitizer restriction. Keep it stable. */
  readonly sanitize?: SanitizeHook;
  readonly localeText?: Partial<BlockEditorLocaleText>;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly id?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly actionsRef?: Ref<BlockEditorActions | null>;
}

export type { Block, BlockPatch, BlockPosition, BlockType };
