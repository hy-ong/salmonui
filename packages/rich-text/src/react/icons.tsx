// Toolbar icons: 16px strokes in currentColor (theme colors only). No text
// glyphs, so visible content never conflicts with the accessible name.
import type { ReactElement } from 'react';

const P: Readonly<Record<string, string>> = {
  alignLeft: 'M2 3h12M2 6.5h8M2 10h12M2 13.5h8',
  alignCenter: 'M2 3h12M4 6.5h8M2 10h12M4 13.5h8',
  alignRight: 'M2 3h12M6 6.5h8M2 10h12M6 13.5h8',
  alignJustify: 'M2 3h12M2 6.5h12M2 10h12M2 13.5h12',
  unorderedList: 'M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  orderedList: 'M6 4h8M6 8h8M6 12h8M2 3l1-.5V6M2 10.5c.5-1 2-1 2 0s-2 1.5-2 2.5h2',
  checklist: 'M7 4h7M7 11h7M2 3.5l1.2 1.2L5 2.5M2 10.5l1.2 1.2L5 9.5',
  indent: 'M2 3h12M7 6.5h7M7 10h7M2 13.5h12M2 6l2.5 2L2 10',
  outdent: 'M2 3h12M7 6.5h7M7 10h7M2 13.5h12M4.5 6L2 8l2.5 2',
  lineHeight: 'M7 3h7M7 8h7M7 13h7M3 2v12M1.5 4L3 2l1.5 2M1.5 12L3 14l1.5-2',
  blockquote: 'M3 5h3v3c0 2-1 3-3 3M9 5h3v3c0 2-1 3-3 3',
  horizontalRule: 'M2 8h12',
  clearFormat: 'M4 3h8M8 3l-2 10M3 13l10-10',
  link: 'M7 9a3 3 0 004 0l2-2a3 3 0 00-4-4l-1 1M9 7a3 3 0 00-4 0L3 9a3 3 0 004 4l1-1',
  removeLink: 'M7 9a3 3 0 004 0l2-2a3 3 0 00-4-4l-1 1M9 7a3 3 0 00-4 0L3 9a3 3 0 004 4l1-1M2 2l12 12',
  openLink: 'M9 2h5v5M14 2L7 9M12 10v4H2V4h4',
  image: 'M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3M10.5 6h.01',
  audio: 'M6 12V3l7-1.5V11M6 12a2 2 0 11-4 0 2 2 0 014 0zM13 11a2 2 0 11-4 0 2 2 0 014 0z',
  video: 'M2 4h9v8H2zM11 7l3-2v6l-3-2',
  embed: 'M5 4L1.5 8 5 12M11 4l3.5 4L11 12',
  removeNode: 'M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6l.7-9.5',
  table: 'M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10M10 3v10',
  addRowBefore: 'M2 8h12v6H2zM8 1v5M5.5 3.5h5',
  addRowAfter: 'M2 2h12v6H2zM8 10v5M5.5 12.5h5',
  deleteRow: 'M2 5h12v6H2zM6 7l4 2M10 7l-4 2',
  addColumnBefore: 'M8 2h6v12H8zM1 8h5M3.5 5.5v5',
  addColumnAfter: 'M2 2h6v12H2zM10 8h5M12.5 5.5v5',
  deleteColumn: 'M5 2h6v12H5zM7 6l2 4M9 6l-2 4',
  mergeCells: 'M2 3h12v10H2zM5 8h6M9 6l2 2-2 2M7 6L5 8l2 2',
  splitCell: 'M2 3h12v10H2zM8 3v10',
  toggleHeaderRow: 'M2 3h12v10H2zM2 6.5h12M2 3h12v3.5H2z',
  tableStyle: 'M2 3h12v10H2zM2 8h12M8 3v10',
  deleteTable: 'M2 3h12v10H2zM5 6l6 4M11 6l-6 4',
  undo: 'M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6',
  redo: 'M11 3l3 3-3 3M14 6H7a4 4 0 000 8h3',
  sourceCode: 'M5 4L1.5 8 5 12M11 4l3.5 4L11 12M9 3l-2 10',
  fullscreen: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
  print: 'M4 6V2h8v4M4 12H2V6h12v6h-2M4 10h8v4H4z',
  findReplace: 'M7 12A5 5 0 107 2a5 5 0 000 10zM10.5 10.5L14 14',
  formatPainter: 'M3 2h9v4H3zM12 4h2v4H8v2M7 10h2v4H7z',
  emoji: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM5.5 9.5c1.3 1.5 3.7 1.5 5 0M6 6h.01M10 6h.01',
  import: 'M8 2v8M5 7l3 3 3-3M2 11v3h12v-3',
  aiAssistant: 'M8 1.5l1.5 4 4 1.5-4 1.5L8 12.5 6.5 8.5l-4-1.5 4-1.5zM13 11l.6 1.4L15 13l-1.4.6L13 15l-.6-1.4L11 13l1.4-.6z',
  codeBlock: 'M2 3h12v10H2zM6 6.5L4.5 8 6 9.5M10 6.5L11.5 8 10 9.5',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  bold: 'M4.5 2.5h4a2.75 2.75 0 010 5.5h-4zM4.5 8h4.75a2.75 2.75 0 010 5.5H4.5z',
  italic: 'M7 2.5h5.5M3.5 13.5H9M9.75 2.5l-3.5 11',
  underline: 'M4.5 2.5v5a3.5 3.5 0 007 0v-5M3 14h10',
  strikethrough: 'M11 4.5a3 3 0 00-3-2h-.5a2.5 2.5 0 00-.5 5M9 8.5a2.5 2.5 0 01-1 5h-.5a3 3 0 01-3-2M2 8h12',
  inlineCode: 'M6 4L2.5 8 6 12M10 4l3.5 4L10 12',
  fontColor: 'M4.5 11L8 2.5l3.5 8.5M5.7 8h4.6M2 14h12',
  backgroundColor: 'M4 10.5l5-5 2.5 2.5-5 5H4zM9.5 5l1.5-1.5 2.5 2.5L12 7.5M2 14.5h12',
  fontName: 'M4.5 13.5V2.5h7M4.5 8h5.5',
  fontSize: 'M2 4h7M5.5 4v9M9 8h5M11.5 8v5',
  superscript: 'M2 5l6 8M8 5l-6 8M11 3.5c0-1.2 2.5-1.2 2.5 0S11 5.3 11 6.5h2.5',
  subscript: 'M2 3l6 8M8 3l-6 8M11 10.5c0-1.2 2.5-1.2 2.5 0S11 12.3 11 13.5h2.5',
  uppercase: 'M1.5 13L4.5 3l3 10M2.5 10h4M8.5 13L11.5 3l3 10M9.5 10h4',
  lowercase: 'M4.5 8.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM6.75 8v5.5M11.5 8.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM13.75 8v5.5',
  editImage: 'M10.5 2.5l3 3L6 13H3v-3z',
  // The block formats menu (Paragraph, Heading 1-6, ...): a pilcrow.
  paragraph: 'M13 2.5H7a3 3 0 000 6h2M9 2.5v11M12 2.5v11',
};

export function Icon(props: { readonly name: string }): ReactElement | null {
  const d = P[props.name] ?? P['editImage'];
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
