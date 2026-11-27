// Public engine types. Type-only: the root entry
// re-exports this file and must never load ProseMirror at runtime.
import type { MarkSpec, NodeSpec, Schema } from 'prosemirror-model';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
import type { InputRule } from 'prosemirror-inputrules';
import type { EditorView } from 'prosemirror-view';

export type RichTextTextAlign = 'left' | 'center' | 'right' | 'justify';
export type RichTextBulletStyle = 'disc' | 'circle' | 'square';
export type RichTextOrderedStyle = 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';
export type RichTextTableStyle = 'bordered' | 'striped';

export interface RichTextLinkInput {
  readonly href: string;
  /** Link text inserted when the selection is empty (default the URL). */
  readonly text?: string | undefined;
  readonly title?: string | undefined;
  /** `'_blank'` opens in a new window (`rel="noopener noreferrer"` is added). */
  readonly target?: '_blank' | null | undefined;
}

export interface RichTextImageInput {
  readonly src: string;
  readonly alt?: string | undefined;
  readonly title?: string | undefined;
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
  /** A caption wraps the image in `<figure>` with `<figcaption>`. */
  readonly caption?: string | undefined;
}

export interface RichTextMediaInput {
  readonly src: string;
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
}

export interface RichTextFindOptions {
  readonly matchCase?: boolean | undefined;
  readonly wholeWord?: boolean | undefined;
}

/** Typed commands (`actionsRef.current.commands`); each returns whether it applied. */
export interface RichTextCommands {
  bold(): boolean;
  italic(): boolean;
  underline(): boolean;
  strike(): boolean;
  subscript(): boolean;
  superscript(): boolean;
  code(): boolean;
  uppercase(): boolean;
  lowercase(): boolean;
  fontFamily(value: string | null): boolean;
  fontSize(value: string | null): boolean;
  color(value: string | null): boolean;
  backgroundColor(value: string | null): boolean;
  paragraph(): boolean;
  heading(level: 1 | 2 | 3 | 4 | 5 | 6): boolean;
  blockquote(): boolean;
  codeBlock(language?: string | null): boolean;
  setCodeLanguage(language: string | null): boolean;
  textAlign(align: RichTextTextAlign | null): boolean;
  lineHeight(value: string | null): boolean;
  indent(): boolean;
  outdent(): boolean;
  bulletList(style?: RichTextBulletStyle | null): boolean;
  orderedList(style?: RichTextOrderedStyle | null): boolean;
  taskList(): boolean;
  toggleTask(): boolean;
  horizontalRule(): boolean;
  clearFormat(): boolean;
  setLink(link: RichTextLinkInput): boolean;
  unsetLink(): boolean;
  insertImage(image: RichTextImageInput): boolean;
  updateImage(image: Partial<RichTextImageInput>): boolean;
  insertAudio(media: RichTextMediaInput): boolean;
  insertVideo(media: RichTextMediaInput): boolean;
  insertEmbed(media: RichTextMediaInput): boolean;
  deleteNode(): boolean;
  insertTable(size: { readonly rows: number; readonly cols: number; readonly headerRow?: boolean | undefined }): boolean;
  addRowBefore(): boolean;
  addRowAfter(): boolean;
  deleteRow(): boolean;
  addColumnBefore(): boolean;
  addColumnAfter(): boolean;
  deleteColumn(): boolean;
  mergeCells(): boolean;
  splitCell(): boolean;
  toggleHeaderRow(): boolean;
  setTableStyle(style: RichTextTableStyle | null): boolean;
  deleteTable(): boolean;
  insertText(text: string): boolean;
  /**
   * Sanitized and parsed through the schema, replacing the selection like a
   * paste; `{ blocks: true }` inserts whole blocks after splitting the
   * current one (imports).
   */
  insertHtml(html: string, options?: { readonly blocks?: boolean }): boolean;
  selectAll(): boolean;
  undo(): boolean;
  redo(): boolean;
  /** Highlights matches and selects the first; returns the match count. */
  find(query: string, options?: RichTextFindOptions): number;
  findNext(): boolean;
  findPrevious(): boolean;
  /** Replaces the current match and moves to the next. */
  replace(text: string): boolean;
  /** Returns the number of replaced matches. */
  replaceAll(text: string): number;
  clearFind(): boolean;
  /** Format painter: copy the format at the selection (`sticky` keeps applying until `cancelFormatPainter`). */
  copyFormat(sticky?: boolean): boolean;
  applyFormat(): boolean;
  cancelFormatPainter(): boolean;
}

export type RichTextCommandName = keyof RichTextCommands;

export interface RichTextSelection {
  readonly anchor: number;
  readonly head: number;
  readonly from: number;
  readonly to: number;
  readonly empty: boolean;
  /** Selected plain text. */
  readonly text: string;
}

/** What an extension's plugin factory receives. */
export interface RichTextExtensionContext {
  readonly schema: Schema;
  /** The engine's current state (after mount the view's state). */
  getState(): EditorState;
  /** The view once mounted. */
  getView(): EditorView | null;
}

/** A toolbar item an extension contributes (`toolbar` refers to it by `id`). */
export interface RichTextExtensionToolbarItem {
  readonly id: string;
  readonly label: string;
  /** Command id (an extension or built-in command) run on click. */
  readonly command: string;
  readonly icon?: unknown;
}

/**
 * An editor extension: schema nodes and marks, ProseMirror plugins
 * (a factory may be async, for example the `/collab` Yjs binding), key
 * bindings, input rules, commands and toolbar items. Keep the array stable.
 */
export interface RichTextExtension {
  readonly name: string;
  readonly nodes?: Readonly<Record<string, NodeSpec>>;
  readonly marks?: Readonly<Record<string, MarkSpec>>;
  readonly plugins?: (context: RichTextExtensionContext) => readonly Plugin[] | Promise<readonly Plugin[]>;
  /** Key -> command id or ProseMirror command, before the built-in table (ProseMirror key names, `Mod-` for Ctrl/Cmd). */
  readonly keyBindings?: Readonly<Record<string, string | Command>>;
  readonly inputRules?: (schema: Schema) => readonly InputRule[];
  /** Command id -> factory of a ProseMirror command; run with `actionsRef.current.run(id, ...args)`. */
  readonly commands?: Readonly<Record<string, (...args: never[]) => Command>>;
  readonly toolbarItems?: readonly RichTextExtensionToolbarItem[];
  /**
   * Elements and attributes the extension's nodes and marks write, added to
   * the always-on sanitizer for value in, paste and HTML out. Active content
   * (script, style, iframe, object, embed, forms), `on*` handlers, `style` and
   * URL attributes other than href / cite / src / poster are never allowed;
   * those four are checked by the URL rules.
   */
  readonly html?: { readonly tags?: readonly string[]; readonly attributes?: Readonly<Record<string, readonly string[]>> };
  /** Turns off history in the engine (the Yjs undo manager replaces it). */
  readonly replacesHistory?: boolean;
  /**
   * The undo and redo that replace the engine's (with `replacesHistory`):
   * `commands.undo` / `redo`, the toolbar and its enabled state use them.
   * Called without `dispatch` they answer whether a step is available.
   */
  readonly history?: { readonly undo: Command; readonly redo: Command };
}

/** Derived toolbar state (`onToolbarStateChange`). */
export interface RichTextToolbarState {
  readonly marks: Readonly<Record<'bold' | 'italic' | 'underline' | 'strike' | 'subscript' | 'superscript' | 'code', boolean>>;
  readonly fontFamily: string | null;
  readonly fontSize: string | null;
  readonly color: string | null;
  readonly backgroundColor: string | null;
  /** `'p'`, `'h1'`..`'h6'`, `'code'` or `'blockquote'`. */
  readonly block: string;
  readonly textAlign: RichTextTextAlign | null;
  readonly lineHeight: string | null;
  readonly list: 'bullet' | 'ordered' | 'task' | null;
  /** The href of the link at the selection. */
  readonly link: string | null;
  readonly inTable: boolean;
  /** The selected node (or the figure around the caret). */
  readonly node: 'image' | 'figure' | 'audio' | 'video' | 'embed' | 'horizontal_rule' | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Character count (text and inline atoms, no block separators). */
  readonly count: number;
  readonly empty: boolean;
  readonly selectionEmpty: boolean;
  readonly painter: boolean;
  readonly findCount: number;
  readonly findIndex: number;
  /** The active slash or emoji trigger. */
  readonly suggest: { readonly id: string; readonly query: string; readonly from: number } | null;
}

/** `keyBindings` prop: key -> command or action id, a function, or `false` to remove a default. */
export type RichTextKeyBindings = Readonly<Record<string, string | false | (() => boolean)>>;
