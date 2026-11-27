// MarkdownEditor text commands: pure functions `(state, ...) => state` over the source
// text and the selection, with no DOM, so they are unit-tested in Node and
// usable on the server. The component applies the result as one undoable
// replacement (internal/text-edit.ts).

export interface TextState {
  readonly text: string;
  /** Selection start (UTF-16 offset). */
  readonly start: number;
  /** Selection end; equal to `start` for a caret. */
  readonly end: number;
}

/** Markers per command: merged over the CommonMark / GFM defaults by the `syntax` prop. */
export interface MarkdownSyntax {
  readonly bold: readonly [string, string];
  readonly italic: readonly [string, string];
  readonly strikethrough: readonly [string, string];
  readonly code: readonly [string, string];
  readonly superscript: readonly [string, string];
  readonly subscript: readonly [string, string];
  /** Fence of `codeBlock`. */
  readonly codeBlock: string;
  /** Line prefix of `blockquote`. */
  readonly blockquote: string;
  /** Line prefix of `unorderedList`. */
  readonly unorderedList: string;
  /** Delimiter after the number of `orderedList` items (`'.'` gives `1. `). */
  readonly orderedList: string;
  /** Heading marker character. */
  readonly heading: string;
}

export const DEFAULT_MARKDOWN_SYNTAX: MarkdownSyntax = Object.freeze<MarkdownSyntax>({
  bold: ['**', '**'],
  italic: ['*', '*'],
  strikethrough: ['~~', '~~'],
  code: ['`', '`'],
  superscript: ['<sup>', '</sup>'],
  subscript: ['<sub>', '</sub>'],
  codeBlock: '```',
  blockquote: '> ',
  unorderedList: '- ',
  orderedList: '.',
  heading: '#',
});

/** Text commands `applyCommand` runs (the toolbar adds dialogs, history, preview and fullscreen). */
export type MarkdownTextCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'superscript'
  | 'subscript'
  | 'uppercase'
  | 'lowercase'
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'blockquote'
  | 'code'
  | 'codeBlock'
  | 'orderedList'
  | 'unorderedList';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Offsets of the lines the selection touches: `[from, to)` without the final line break. */
export function lineRange(state: TextState): { readonly from: number; readonly to: number } {
  const { text, start } = state;
  // A selection that ends right after a line break does not touch the next line.
  const end = state.end > start && text.charCodeAt(state.end - 1) === 10 ? state.end - 1 : state.end;
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const next = text.indexOf('\n', end);
  return { from, to: next === -1 ? text.length : next };
}

function replace(state: TextState, from: number, to: number, insert: string, start: number, end: number): TextState {
  return { text: state.text.slice(0, from) + insert + state.text.slice(to), start, end };
}

/** Replaces the selection with `snippet`; the new selection is `snippet[selectFrom, selectTo)` (default: caret after it). */
export function insertSnippet(state: TextState, snippet: string, selectFrom = snippet.length, selectTo = selectFrom): TextState {
  return replace(state, state.start, state.end, snippet, state.start + selectFrom, state.start + selectTo);
}

/** Consecutive `ch` characters ending at `pos` (backwards) or starting at `pos` (forwards). */
function run(text: string, pos: number, ch: string, forward: boolean): number {
  let n = 0;
  if (forward) while (text[pos + n] === ch) n++;
  else while (pos - n - 1 >= 0 && text[pos - n - 1] === ch) n++;
  return n;
}

/**
 * Wraps the selection in `before` / `after`, or removes them when the
 * selection is already wrapped (markers inside the selection or right
 * around it). A one-character marker that is part of a longer run
 * (`*` inside `**bold**`) does not count: odd runs carry it.
 */
export function toggleInline(state: TextState, before: string, after: string): TextState {
  const { text, start, end } = state;
  const single = before.length === 1 && before === after;
  const sel = text.slice(start, end);
  const inside = sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after) && (!single || (run(sel, 0, before, true) % 2 === 1 && run(sel, sel.length, before, false) % 2 === 1));
  if (inside) {
    const inner = sel.slice(before.length, sel.length - after.length);
    return replace(state, start, end, inner, start, start + inner.length);
  }
  const around = text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after && (!single || (run(text, start, before, false) % 2 === 1 && run(text, end, before, true) % 2 === 1));
  if (around && start >= before.length) {
    return replace(state, start - before.length, end + after.length, sel, start - before.length, end - before.length);
  }
  return replace(state, start, end, before + sel + after, start + before.length, end + before.length);
}

/**
 * Applies a line transform to every line the selection touches. A caret
 * stays at the same place in its line; a selection covers the new lines.
 */
function mapLines(state: TextState, map: (lines: readonly string[]) => readonly string[]): TextState {
  const { from, to } = lineRange(state);
  const lines = state.text.slice(from, to).split('\n');
  const next = map(lines).join('\n');
  if (state.start === state.end && lines.length === 1) {
    const delta = next.length - (to - from);
    const caret = Math.max(from, Math.min(from + next.length, state.start + delta));
    return replace(state, from, to, next, caret, caret);
  }
  return replace(state, from, to, next, from, from + next.length);
}

const LIST_MARKER = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

/** Toggles a line prefix (blockquote, lists): removed when every non-empty line has it, else added (replacing another list marker). */
function toggleLinePrefix(state: TextState, has: RegExp, prefix: (index: number) => string, strip: RegExp | null): TextState {
  return mapLines(state, (lines) => {
    const content = lines.filter((l) => l.trim() !== '');
    if (content.length && content.every((l) => has.test(l))) return lines.map((l) => l.replace(has, ''));
    let n = 0;
    return lines.map((l) => (l.trim() === '' && lines.length > 1 ? l : prefix(n++) + (strip ? l.replace(strip, '$1') : l)));
  });
}

/** Sets the heading level of the touched lines (0 is a paragraph); setting the current level again makes them paragraphs. */
export function setHeading(state: TextState, level: number, marker = '#'): TextState {
  const re = new RegExp(`^${escapeRe(marker)}{1,6}\\s+`);
  const prefix = level > 0 ? `${marker.repeat(level)} ` : '';
  return mapLines(state, (lines) => {
    const same = level > 0 && lines.every((l) => l.startsWith(prefix) && !l.startsWith(prefix.slice(0, -1) + marker));
    return lines.map((l) => (same ? '' : prefix) + l.replace(re, ''));
  });
}

/** Fences the touched lines, or removes the fences around them. An empty caret line gets an empty block with the caret inside. */
export function toggleCodeBlock(state: TextState, fence = '```'): TextState {
  const { text } = state;
  const { from, to } = lineRange(state);
  const prevStart = text.lastIndexOf('\n', from - 2) + 1;
  const prevLine = from > 0 ? text.slice(prevStart, from - 1) : null;
  const nextEnd = text.indexOf('\n', to + 1);
  const nextLine = to < text.length ? text.slice(to + 1, nextEnd === -1 ? text.length : nextEnd) : null;
  if (prevLine !== null && nextLine !== null && prevLine.startsWith(fence) && nextLine.trim() === fence) {
    const body = text.slice(from, to);
    const removeTo = nextEnd === -1 ? text.length : nextEnd;
    return replace(state, prevStart, removeTo, body, prevStart, prevStart + body.length);
  }
  const body = text.slice(from, to);
  const block = `${fence}\n${body}\n${fence}`;
  const offset = from + fence.length + 1;
  return replace(state, from, to, block, offset, offset + body.length);
}

/** Upper- or lower-cases the selection with the editor locale. A caret changes nothing. */
export function changeCase(state: TextState, upper: boolean, locale?: string | readonly string[]): TextState {
  if (state.start === state.end) return state;
  const sel = state.text.slice(state.start, state.end);
  const next = upper ? sel.toLocaleUpperCase(locale as string[] | undefined) : sel.toLocaleLowerCase(locale as string[] | undefined);
  return replace(state, state.start, state.end, next, state.start, state.start + next.length);
}

/** Runs a text command; returns the new state. */
export function applyCommand(id: MarkdownTextCommand, state: TextState, syntax: MarkdownSyntax = DEFAULT_MARKDOWN_SYNTAX, locale?: string | readonly string[]): TextState {
  switch (id) {
    case 'bold':
    case 'italic':
    case 'strikethrough':
    case 'superscript':
    case 'subscript':
    case 'code':
      return toggleInline(state, syntax[id][0], syntax[id][1]);
    case 'uppercase':
      return changeCase(state, true, locale);
    case 'lowercase':
      return changeCase(state, false, locale);
    case 'paragraph':
      return setHeading(state, 0, syntax.heading);
    case 'blockquote':
      return toggleLinePrefix(state, new RegExp(`^${escapeRe(syntax.blockquote.trimEnd())} ?`), () => syntax.blockquote, null);
    case 'codeBlock':
      return toggleCodeBlock(state, syntax.codeBlock);
    case 'unorderedList':
      return toggleLinePrefix(state, new RegExp(`^\\s*${escapeRe(syntax.unorderedList.trimEnd())}\\s+`), () => syntax.unorderedList, LIST_MARKER);
    case 'orderedList':
      return toggleLinePrefix(state, new RegExp(`^\\s*\\d+${escapeRe(syntax.orderedList)}\\s+`), (n) => `${n + 1}${syntax.orderedList} `, LIST_MARKER);
    default:
      return setHeading(state, Number(id.slice(7)), syntax.heading);
  }
}

/**
 * Enter inside a list item: continues the marker on a new line
 * (the next number for ordered lists, an unchecked box for task lists); on
 * an empty item it removes the marker and ends the list. Null when the
 * caret line is not a list item or the selection is not a caret.
 */
export function continueList(state: TextState): TextState | null {
  const { text, start, end } = state;
  if (start !== end) return null;
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', start);
  const line = text.slice(from, lineEnd === -1 ? text.length : lineEnd);
  const m = /^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/.exec(line);
  if (!m || start - from < m[0].length) return null;
  if (line.slice(m[0].length).trim() === '') return replace(state, from, from + line.length, '', from, from);
  const [, indent = '', bullet = '', num, delim = '', gap = ' ', task] = m;
  const marker = num !== undefined ? `${Number(num) + 1}${delim}` : bullet;
  const insert = `\n${indent}${marker}${gap}${task ? '[ ] ' : ''}`;
  return replace(state, start, end, insert, start + insert.length, start + insert.length);
}

/** Tab indentation (`tabIndents`): a caret inserts `unit`; a selection (or Shift+Tab) indents or outdents its lines. */
export function indentLines(state: TextState, outdent: boolean, unit = '\t'): TextState {
  if (!outdent && state.start === state.end) return insertSnippet(state, unit);
  return mapLines(state, (lines) => lines.map((l) => (outdent ? l.replace(/^(\t| {1,4})/, '') : unit + l)));
}

/** `[text](url)`; an empty text uses the URL. */
export const linkMarkdown = (text: string, url: string): string => `[${text || url}](${url})`;

/** `![alt](src)`. */
export const imageMarkdown = (alt: string, src: string): string => `![${alt}](${src})`;

/** A GFM table of `rows` body rows and `cols` columns, with header cells `header(i)`. */
export function tableMarkdown(rows: number, cols: number, header: (index: number) => string = (i) => `Header ${i + 1}`): string {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  const out = [line(Array.from({ length: c }, (_, i) => header(i))), line(Array.from({ length: c }, () => '---'))];
  for (let i = 0; i < r; i++) out.push(line(Array.from({ length: c }, () => '   ')));
  return out.join('\n');
}

/** Inserts a block (table, image on its own line) at the selection, on lines of its own. */
export function insertBlock(state: TextState, block: string): TextState {
  const { text, start, end } = state;
  const lead = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
  const trail = end < text.length && text[end] !== '\n' ? '\n' : '';
  const snippet = lead + block + trail;
  return insertSnippet(state, snippet, lead.length + block.length);
}
