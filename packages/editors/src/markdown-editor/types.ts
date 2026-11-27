import type { CSSProperties, ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import type { MarkdownSyntax, MarkdownTextCommand } from './commands.js';

/** Built-in toolbar item ids. */
export type MarkdownToolbarItemId =
  | MarkdownTextCommand
  | 'heading'
  | 'link'
  | 'image'
  | 'table'
  | 'undo'
  | 'redo'
  | 'preview'
  | 'fullscreen';

/** Input that ran a command. */
export type MarkdownEditorSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** A custom toolbar item. */
export interface MarkdownToolbarCustomItem {
  readonly id: string;
  /** Accessible name and tooltip. */
  readonly label: string;
  /** Icon (decorative); without one the label is shown. */
  readonly icon?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly onSelect: (api: MarkdownEditorApi) => void;
}

/** A toolbar entry: a built-in id, `'|'` for a separator, or a custom item. */
export type MarkdownToolbarItem = MarkdownToolbarItemId | '|' | MarkdownToolbarCustomItem;

/** Preview state: hidden, instead of the source (tab), or beside it (split). */
export type MarkdownPreviewMode = 'off' | 'tab' | 'split';

export interface MarkdownCommandEvent {
  readonly id: string;
  readonly source: MarkdownEditorSource;
}

export interface MarkdownBeforeCommandEvent extends MarkdownCommandEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Second argument of `onValueChange` (frozen). */
export interface MarkdownValueChangeEvent {
  readonly source: MarkdownEditorSource;
  readonly reason: 'input' | 'command' | 'reset';
}

/** Second argument of `onPreviewChange` / `onFullscreenChange` (frozen). */
export interface MarkdownToggleEvent {
  readonly source: MarkdownEditorSource;
}

/** Upload hook result. */
export interface MarkdownUploadResult {
  readonly src: string;
  readonly alt?: string | undefined;
}

/** Ref handle. */
export interface MarkdownEditorApi {
  /** The textarea. */
  readonly element: HTMLTextAreaElement | null;
  /** Runs a toolbar item by id (built-in or custom). */
  runCommand(id: string): void;
  /** Replaces the selection with `text` (undoable). */
  insertText(text: string): void;
  /** Toggles `before` / `after` around the selection. */
  wrapSelection(before: string, after: string): void;
  focus(): void;
  blur(): void;
  getSelection(): { readonly start: number; readonly end: number; readonly text: string };
  setSelection(start: number, end: number): void;
}

/** Text of the toolbar, dialogs and count. `{0}` is the heading level or column number. */
export interface MarkdownEditorLocaleText {
  readonly toolbar: string;
  readonly editor: string;
  readonly previewRegion: string;
  readonly more: string;
  readonly bold: string;
  readonly italic: string;
  readonly strikethrough: string;
  readonly superscript: string;
  readonly subscript: string;
  readonly uppercase: string;
  readonly lowercase: string;
  readonly heading: string;
  readonly headingLevel: string;
  readonly paragraph: string;
  readonly blockquote: string;
  readonly code: string;
  readonly codeBlock: string;
  readonly orderedList: string;
  readonly unorderedList: string;
  readonly link: string;
  readonly image: string;
  readonly table: string;
  readonly undo: string;
  readonly redo: string;
  readonly preview: string;
  readonly fullscreen: string;
  readonly linkText: string;
  readonly linkUrl: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly imageFile: string;
  readonly uploading: string;
  readonly uploadFailed: string;
  readonly tableRows: string;
  readonly tableColumns: string;
  readonly tableHeader: string;
  readonly insert: string;
  readonly cancel: string;
  readonly countNearLimit: string;
  readonly countAtLimit: string;
}

export type MarkdownEditorPart = 'toolbar' | 'textarea' | 'preview' | 'count';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'className' | 'style' | 'children'>;

export interface MarkdownEditorProps extends TextareaProps {
  /** Markdown source (controlled). */
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  /** Every edit: typing, a command, a form reset. */
  readonly onValueChange?: ((value: string, event: MarkdownValueChangeEvent) => void) | undefined;
  /** Toolbar entries; default `MARKDOWN_DEFAULT_TOOLBAR`. An empty array hides the toolbar. */
  readonly toolbar?: readonly MarkdownToolbarItem[] | undefined;
  /** Items that do not fit: in a More menu (default), wrapped, or scrolled. */
  readonly toolbarOverflow?: 'menu' | 'wrap' | 'scroll' | undefined;
  /** Keeps the toolbar visible while the page scrolls. */
  readonly stickyToolbar?: boolean | undefined;
  readonly preview?: MarkdownPreviewMode | undefined;
  readonly defaultPreview?: MarkdownPreviewMode | undefined;
  readonly onPreviewChange?: ((mode: MarkdownPreviewMode, event: MarkdownToggleEvent) => void) | undefined;
  /** Renders the preview; receives the deferred source. No parser is bundled. */
  readonly renderPreview?: ((markdown: string) => ReactNode) | undefined;
  readonly fullscreen?: boolean | undefined;
  readonly defaultFullscreen?: boolean | undefined;
  readonly onFullscreenChange?: ((fullscreen: boolean, event: MarkdownToggleEvent) => void) | undefined;
  /** Uploads an image file from the image dialog or a paste. */
  readonly onUpload?: ((file: File, options: { readonly signal: AbortSignal }) => PromiseLike<MarkdownUploadResult>) | undefined;
  /** Marker overrides per command. */
  readonly syntax?: Partial<MarkdownSyntax> | undefined;
  /** Shows the character count (with `maxLength`, `n / max`). */
  readonly showCount?: boolean | undefined;
  /** Vertical resize handle on the textarea. Default true. */
  readonly resizable?: boolean | undefined;
  /** Tab and Shift+Tab indent instead of moving focus. Default false. */
  readonly tabIndents?: boolean | undefined;
  /** Steps of the internal history used where native undo is unavailable. Default 100. */
  readonly undoLimit?: number | undefined;
  /** Locale of uppercase / lowercase. */
  readonly locale?: string | undefined;
  readonly localeText?: Partial<MarkdownEditorLocaleText> | undefined;
  readonly onBeforeCommand?: ((event: MarkdownBeforeCommandEvent) => void) | undefined;
  readonly onCommand?: ((event: MarkdownCommandEvent) => void) | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: Partial<Record<MarkdownEditorPart, string>> | undefined;
  readonly styles?: Partial<Record<MarkdownEditorPart, CSSProperties>> | undefined;
  readonly ref?: Ref<MarkdownEditorApi> | undefined;
}
