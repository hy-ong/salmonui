// BlockEditor JSON model:
// server-safe plain data. The value of a BlockEditor is `Block[]`.

/** Block types. */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bulletListItem'
  | 'numberedListItem'
  | 'checklistItem'
  | 'quote'
  | 'callout'
  | 'code'
  | 'image'
  | 'table'
  | 'divider'
  | 'toggle'
  | 'audio'
  | 'video';

/** Inline formatting of text (shared with RichTextEditor marks). */
export type InlineMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'subscript' | 'superscript' | 'code' }
  | { type: 'color' | 'backgroundColor' | 'fontFamily' | 'fontSize'; value: string };

export interface InlineText {
  type: 'text';
  text: string;
  marks?: InlineMark[];
}

export interface InlineLink {
  type: 'link';
  href: string;
  target?: '_blank';
  content: InlineText[];
}

export interface InlineMention {
  type: 'mention';
  id: string;
  label: string;
  trigger: string;
}

export interface InlineLabel {
  type: 'label';
  id: string;
  label: string;
  trigger: string;
  tone?: string;
}

export interface InlineHardBreak {
  type: 'hardBreak';
}

/** Inline content of a block: text with marks, link, mention, label, hard break. */
export type InlineContent = InlineText | InlineLink | InlineMention | InlineLabel | InlineHardBreak;

/**
 * One block. `props` by type:
 * - paragraph: `textAlign?`; heading: `level` (1..6), `textAlign?`;
 * - numberedListItem: `start?` (starts a new numbered list); checklistItem: `checked`;
 * - callout: `tone` (`info` | `success` | `warning` | `danger` | `neutral`);
 * - code: `language?`; toggle: `open?`;
 * - image: `src`, `alt?`, `caption?`, `width?`, `height?`;
 * - audio: `src`; video: `src`, `width?`, `height?`;
 * - table: `headerRow` (first row is header cells), `rows` (`InlineContent[][][]`, rows of cells), `variant?` (`bordered` | `striped`).
 *
 * `content` holds the block's own text (absent for image, table, divider,
 * audio, video; one unmarked text item for code); `children` the nested
 * blocks (list item sub-items, toggle body, quote and callout body).
 */
export interface Block {
  id: string;
  type: BlockType;
  props?: Record<string, unknown>;
  content?: InlineContent[];
  children?: Block[];
}

/** Where blocks go in the insert and move helpers. */
export type BlockPosition =
  | { before: string }
  | { after: string }
  | { parent: string; index?: number };

/** A partial update for {@link updateBlock}: `props` merge, the rest replaces. */
export interface BlockPatch {
  type?: BlockType;
  props?: Record<string, unknown>;
  content?: InlineContent[];
  children?: Block[];
}
