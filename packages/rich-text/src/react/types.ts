// RichTextEditor public props and actions.
import type { CSSProperties, ReactNode, Ref, RefObject } from 'react';
import type { MentionItem, MentionProps, MentionRenderItemContext } from '@salmonui/dropdowns/mention';
import type { SanitizeHook } from '../html/index.js';
import type { PasteCleanupOptions } from '../html/index.js';
import type { HighlightFn, RichTextEngine, UploadHandler } from '../engine/index.js';
import type { RichTextCommands, RichTextExtension, RichTextKeyBindings, RichTextSelection, RichTextToolbarState } from '../engine/types.js';
import type { RichTextEditorLocaleText } from './locale.js';

/** Built-in toolbar item ids (shared names with MarkdownEditor where they overlap); `'|'` is a separator. */
export type RichTextToolbarItemId =
  | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript' | 'inlineCode' | 'uppercase' | 'lowercase'
  | 'fontName' | 'fontSize' | 'fontColor' | 'backgroundColor'
  | 'formats' | 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'blockquote' | 'codeBlock'
  | 'alignments' | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify'
  | 'orderedList' | 'unorderedList' | 'checklist' | 'indent' | 'outdent' | 'lineHeight' | 'horizontalRule' | 'clearFormat'
  | 'link' | 'openLink' | 'editLink' | 'removeLink'
  | 'image' | 'editImage' | 'audio' | 'video' | 'embed' | 'removeNode'
  | 'table' | 'addRowBefore' | 'addRowAfter' | 'deleteRow' | 'addColumnBefore' | 'addColumnAfter' | 'deleteColumn'
  | 'mergeCells' | 'splitCell' | 'toggleHeaderRow' | 'tableStyle' | 'deleteTable'
  | 'undo' | 'redo' | 'sourceCode' | 'fullscreen' | 'print' | 'findReplace' | 'formatPainter' | 'emoji' | 'import' | 'aiAssistant'
  | '|';

/** A custom toolbar item. */
export interface RichTextToolbarCustomItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** A command or action id run on click (built-in, alias or extension command). */
  readonly command?: string;
  readonly onClick?: (actions: RichTextEditorActions) => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
}

/** A built-in item with per-item options (per-item `disabled`). */
export interface RichTextToolbarItemOptions {
  readonly id: Exclude<RichTextToolbarItemId, '|'>;
  readonly disabled?: boolean;
  readonly label?: string;
}

/** A built-in id, the id of an extension's `toolbarItems` entry, item options or a custom item. */
export type RichTextToolbarItem = RichTextToolbarItemId | (string & Record<never, never>) | RichTextToolbarItemOptions | RichTextToolbarCustomItem;

export type RichTextDialogId = 'link' | 'image' | 'audio' | 'video' | 'embed' | 'table' | 'findReplace' | 'aiAssistant' | 'pastePrompt';
export type RichTextPopupId = 'emoji' | 'slash' | 'floating' | 'link' | 'image' | 'table' | 'audio' | 'video' | 'text';

export interface RichTextQuickToolbars {
  readonly link?: readonly RichTextToolbarItem[] | false;
  readonly image?: readonly RichTextToolbarItem[] | false;
  readonly table?: readonly RichTextToolbarItem[] | false;
  readonly audio?: readonly RichTextToolbarItem[] | false;
  readonly video?: readonly RichTextToolbarItem[] | false;
  /** Shown on a non-empty text selection; off unless `toolbar="floating"` or set. */
  readonly text?: readonly RichTextToolbarItem[] | false;
}

export interface RichTextPasteCleanup extends Omit<PasteCleanupOptions, 'embedHosts' | 'sanitize'> {}

export interface RichTextEmoji {
  readonly emoji: string;
  readonly name: string;
  readonly keywords?: readonly string[];
}

export type RichTextSlashItemId =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'unorderedList' | 'orderedList' | 'checklist' | 'blockquote' | 'codeBlock'
  | 'table' | 'image' | 'horizontalRule' | 'emoji';

export interface RichTextSlashCustomItem {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly onSelect: (actions: RichTextEditorActions) => void;
}

export type RichTextSlashItem = RichTextSlashItemId | RichTextSlashCustomItem;

export interface RichTextMentions<T = MentionItem> {
  /** Trigger character (default `'@'`). */
  readonly trigger?: string;
  readonly items?: readonly T[];
  /** Remote suggestions for the typed text. */
  readonly onSearch?: (text: string) => Promise<readonly T[]>;
  readonly renderItem?: (context: MentionRenderItemContext<T>) => ReactNode;
  /** Further Mention props (labels, search options, events). */
  readonly mentionProps?: Omit<MentionProps<T>, 'editor' | 'children' | 'target' | 'data' | 'triggers' | 'renderItem'>;
}

export interface RichTextAiRequest {
  readonly prompt: string;
  /** The selected content as HTML ('' when the selection is empty). */
  readonly selectionHtml: string;
  readonly signal: AbortSignal;
}

export interface RichTextAiAssistant {
  /** Text (plain, inserted as paragraphs) as a whole or streamed in chunks. */
  readonly onRequest: (request: RichTextAiRequest) => Promise<string> | AsyncIterable<string>;
}

export interface RichTextBeforeCommandEvent {
  readonly command: string;
  readonly args: readonly unknown[];
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface RichTextCommandEvent {
  readonly command: string;
  readonly args: readonly unknown[];
  readonly applied: boolean;
}

export interface RichTextToolbarItemClickEvent {
  readonly id: string;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface RichTextBeforeDialogOpenEvent {
  readonly dialog: RichTextDialogId;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface RichTextBeforePopupOpenEvent {
  readonly popup: RichTextPopupId;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** `actionsRef.current` once the engine is mounted. */
export interface RichTextEditorActions {
  readonly commands: RichTextCommands;
  /** Runs a command, alias, extension command or UI action by id. */
  run(id: string, ...args: unknown[]): unknown;
  getHtml(options?: { readonly xhtml?: boolean }): string;
  getText(): string;
  getSelection(): RichTextSelection;
  setSelection(anchor: number, head?: number): void;
  focus(): void;
  clearHistory(): void;
  openDialog(id: RichTextDialogId): void;
  closeDialog(): void;
  /** Inserts files through `onUpload` (or `imageInsert`) as on paste and drop. */
  insertFiles(files: readonly File[]): Promise<void>;
  /** The headless engine. */
  readonly engine: RichTextEngine;
}

/** `TMention` is the item type of `mentions` (its `renderItem` receives it). */
export interface RichTextEditorProps<TMention = MentionItem> {
  readonly value?: string;
  readonly defaultValue?: string;
  /** The HTML value after a transaction batch (`changeDelay` ms, default 0: once per batch). */
  readonly onChange?: (html: string) => void;
  readonly changeDelay?: number;
  readonly onBlur?: (html: string) => void;
  readonly onFocus?: () => void;
  readonly toolbar?: readonly RichTextToolbarItem[] | 'floating' | false;
  readonly toolbarOverflow?: 'menu' | 'scroll' | 'wrap';
  readonly toolbarPosition?: 'top' | 'bottom';
  readonly stickyToolbar?: boolean;
  readonly quickToolbars?: RichTextQuickToolbars | false;
  readonly fontFamilies?: readonly { readonly label: string; readonly value: string }[];
  readonly fontSizes?: readonly string[];
  readonly colors?: readonly { readonly label: string; readonly value: string }[];
  /** Image, audio and video upload (pending until the promise settles). */
  readonly onUpload?: UploadHandler;
  /** Without `onUpload`: inline images as data URLs or object URLs (default `'blob'`). */
  readonly imageInsert?: 'base64' | 'blob';
  readonly onUploadError?: (error: unknown, file: File) => void;
  readonly embedHosts?: readonly string[];
  readonly codeLanguages?: readonly (string | { readonly value: string; readonly label: string })[];
  readonly highlight?: HighlightFn;
  readonly pasteCleanup?: RichTextPasteCleanup;
  readonly sanitize?: SanitizeHook;
  readonly onImport?: (file: File) => Promise<string>;
  readonly importAccept?: string;
  readonly onBrowseFiles?: (kind: 'image' | 'audio' | 'video') => Promise<{ readonly src: string; readonly alt?: string } | null>;
  readonly aiAssistant?: RichTextAiAssistant;
  readonly emojiList?: readonly RichTextEmoji[];
  readonly slashMenu?: boolean | readonly RichTextSlashItem[];
  readonly mentions?: RichTextMentions<TMention>;
  readonly undoLimit?: number;
  readonly undoGroupDelay?: number;
  readonly showCount?: boolean;
  readonly maxLength?: number;
  readonly resizable?: boolean;
  readonly fullscreen?: boolean;
  readonly defaultFullscreen?: boolean;
  readonly onFullscreenChange?: (fullscreen: boolean) => void;
  readonly enterKey?: 'p' | 'div' | 'br';
  readonly shiftEnterKey?: 'p' | 'div' | 'br';
  readonly tabKey?: 'indent' | 'focus';
  readonly keyBindings?: RichTextKeyBindings;
  readonly extensions?: readonly RichTextExtension[];
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly localeText?: Partial<RichTextEditorLocaleText>;
  readonly actionsRef?: RefObject<RichTextEditorActions | null> | Ref<RichTextEditorActions>;
  readonly onReady?: (actions: RichTextEditorActions) => void;
  readonly onBeforeCommand?: (event: RichTextBeforeCommandEvent) => void;
  readonly onCommand?: (event: RichTextCommandEvent) => void;
  readonly onToolbarItemClick?: (event: RichTextToolbarItemClickEvent) => void;
  readonly onBeforeDialogOpen?: (event: RichTextBeforeDialogOpenEvent) => void;
  readonly onDialogClose?: (event: { readonly dialog: RichTextDialogId }) => void;
  readonly onBeforePopupOpen?: (event: RichTextBeforePopupOpenEvent) => void;
  readonly onToolbarStateChange?: (state: RichTextToolbarState) => void;
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-describedby'?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}
