// Toolbar item model of MarkdownEditor: the ids, labels and shortcuts are
// the part a future RichTextEditor shares. Icons are text glyphs or one-path SVGs.

import type { ReactNode } from 'react';
import type { MarkdownEditorLocaleText, MarkdownToolbarItem, MarkdownToolbarItemId } from './types.js';

export const MARKDOWN_DEFAULT_LOCALE_TEXT: MarkdownEditorLocaleText = Object.freeze({
  toolbar: 'Formatting',
  editor: 'Markdown source',
  previewRegion: 'Preview',
  more: 'More',
  bold: 'Bold',
  italic: 'Italic',
  strikethrough: 'Strikethrough',
  superscript: 'Superscript',
  subscript: 'Subscript',
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  heading: 'Heading',
  headingLevel: 'Heading {0}',
  paragraph: 'Paragraph',
  blockquote: 'Quote',
  code: 'Inline code',
  codeBlock: 'Code block',
  orderedList: 'Numbered list',
  unorderedList: 'Bulleted list',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  undo: 'Undo',
  redo: 'Redo',
  preview: 'Preview',
  fullscreen: 'Full screen',
  linkText: 'Text',
  linkUrl: 'URL',
  imageUrl: 'Image URL',
  imageAlt: 'Alternative text',
  imageFile: 'Upload a file',
  uploading: 'Uploading',
  uploadFailed: 'The file could not be uploaded.',
  tableRows: 'Rows',
  tableColumns: 'Columns',
  tableHeader: 'Header {0}',
  insert: 'Insert',
  cancel: 'Cancel',
  countNearLimit: 'Approaching the character limit',
  countAtLimit: 'Character limit reached',
});

/** The default toolbar. */
export const MARKDOWN_DEFAULT_TOOLBAR: readonly MarkdownToolbarItem[] = Object.freeze([
  'bold',
  'italic',
  'strikethrough',
  '|',
  'heading',
  'blockquote',
  'code',
  'orderedList',
  'unorderedList',
  '|',
  'link',
  'image',
  'table',
  '|',
  'undo',
  'redo',
  'preview',
  'fullscreen',
] as const);

/** Shortcut hints for tooltips (Mod is Ctrl, or Cmd on Apple platforms). */
export const SHORTCUTS: Partial<Record<MarkdownToolbarItemId, string>> = {
  bold: 'Mod+B',
  italic: 'Mod+I',
  strikethrough: 'Mod+Shift+S',
  superscript: 'Mod+Shift+=',
  subscript: 'Mod+=',
  uppercase: 'Mod+Shift+U',
  lowercase: 'Mod+Shift+L',
  orderedList: 'Mod+Shift+O',
  unorderedList: 'Mod+Alt+O',
  link: 'Mod+K',
  image: 'Mod+Shift+I',
  table: 'Mod+Shift+E',
  undo: 'Mod+Z',
  redo: 'Mod+Y',
  fullscreen: 'Mod+Shift+F',
};

const svg = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

const PATHS: Partial<Record<MarkdownToolbarItemId, string>> = {
  // Same 16px stroke icons as the RichTextEditor toolbar; letterform items
  // (bold, italic, heading, sub/superscript, case) stay text glyphs.
  blockquote: 'M3 5h3v3c0 2-1 3-3 3M9 5h3v3c0 2-1 3-3 3',
  code: 'M6 4L2.5 8 6 12M10 4l3.5 4L10 12',
  codeBlock: 'M2 3h12v10H2zM6 6.5L4.5 8 6 9.5M10 6.5L11.5 8 10 9.5',
  orderedList: 'M6 4h8M6 8h8M6 12h8M2 3l1-.5V6M2 10.5c.5-1 2-1 2 0s-2 1.5-2 2.5h2',
  unorderedList: 'M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  undo: 'M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6',
  redo: 'M11 3l3 3-3 3M14 6H7a4 4 0 000 8h3',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1',
  image: 'M2 3h12v10H2zM2 11l3.5-3.5 3 3 2-2L14 12M10.5 6.5h.01',
  table: 'M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10M10 3v10',
  preview: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z',
  fullscreen: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
};

/** The overflow ("more") trigger icon. */
export const MORE_ICON = svg('M3.5 8h.01M8 8h.01M12.5 8h.01');

export function itemIcon(id: MarkdownToolbarItemId): ReactNode {
  const path = PATHS[id];
  if (path) return svg(path);
  // Text glyphs come from CSS (`::before`), so a button's visible text never differs from its name.
  return <span className="salmon-markdown-editor-glyph" data-glyph={id} aria-hidden="true" />;
}

export const headingLabel = (locale: MarkdownEditorLocaleText, level: number): string => (level === 0 ? locale.paragraph : locale.headingLevel.replace('{0}', String(level)));
