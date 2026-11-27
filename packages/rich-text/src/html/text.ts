// Plain text <-> HTML (plain-text paste, RTE character counting on the
// server, BlockEditor and RichTextEditor `getText`). Server-safe.

import { parseHtml, type HtmlNode } from './parse.js';
import { escapeHtml } from './serialize.js';
import { sanitizeNodes } from './sanitize.js';

export interface HtmlToTextOptions {
  /** Inserted between blocks (paragraphs, headings, list items, rows). Default `'\n'`. */
  blockSeparator?: string;
}

const BLOCKS: ReadonlySet<string> = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'pre', 'ul', 'ol', 'li', 'figure', 'figcaption', 'audio', 'video',
  'iframe', 'table', 'tbody', 'div', 'details', 'summary',
]);
// Blocks that stand for one line even when empty.
const LEAVES: ReadonlySet<string> = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'summary', 'figcaption']);

interface Collector {
  lines: string[];
  buf: string;
}

function boundary(c: Collector): void {
  if (c.buf !== '') {
    c.lines.push(c.buf.replace(/^ +| +$/gm, ''));
    c.buf = '';
  }
}

function walk(nodes: readonly HtmlNode[], c: Collector, pre: boolean): void {
  for (const n of nodes) {
    if (n.type === 'text') {
      c.buf += pre ? n.value : n.value.replace(/[\t\n\f\r ]+/g, ' ');
      continue;
    }
    if (n.type !== 'element') continue;
    if (n.tag === 'br') {
      c.buf += '\n';
      continue;
    }
    if (n.tag === 'tr') {
      boundary(c);
      const cells = n.children.map((cell) => {
        const inner: Collector = { lines: [], buf: '' };
        walk(cell.type === 'element' ? cell.children : [], inner, false);
        boundary(inner);
        return inner.lines.join(' ');
      });
      c.lines.push(cells.join('\t'));
      continue;
    }
    if (n.tag === 'pre') {
      boundary(c);
      const inner: Collector = { lines: [], buf: '' };
      walk(n.children, inner, true);
      c.lines.push(inner.buf);
      continue;
    }
    if (BLOCKS.has(n.tag)) {
      boundary(c);
      const before = c.lines.length;
      walk(n.children, c, pre);
      if (LEAVES.has(n.tag) && c.lines.length === before && c.buf.trim() === '') {
        c.buf = '';
        c.lines.push('');
      } else boundary(c);
      continue;
    }
    walk(n.children, c, pre);
  }
}

/**
 * Text content of HTML as the editors count it: the sanitized content, block
 * boundaries become `blockSeparator`, `<br>` a newline, table cells are
 * separated by tabs, whitespace outside `<pre>` collapses as it renders.
 * Mentions and labels count as their visible text (`@Alice`).
 */
export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  const c: Collector = { lines: [], buf: '' };
  walk(sanitizeNodes(parseHtml(html)), c, false);
  boundary(c);
  return c.lines.join(options.blockSeparator ?? '\n');
}

/**
 * HTML for plain text (plain-text paste): paragraphs on blank lines,
 * `<br>` on single newlines, runs of spaces kept as no-break spaces, all text
 * escaped. Empty input gives `''`.
 */
export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (normalized.trim() === '') return '';
  return normalized
    .split(/\n[\t ]*\n/)
    .filter((p) => p.trim() !== '')
    .map((p) => {
      const lines = p.replace(/^\n+|\n+$/g, '').split('\n').map((line) =>
        escapeHtml(line)
          .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
          .replace(/ {2,}/g, (m) => ' ' + '&nbsp;'.repeat(m.length - 1))
          .replace(/^ /, '&nbsp;'),
      );
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
}
