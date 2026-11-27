// Block JSON <-> HTML: the single conversion path of
// BlockEditor (blocks -> HTML -> engine, engine HTML -> blocks) and the
// server-safe `getDataAsHtml` / `parseHtmlToBlocks` counterparts. Pure and
// deterministic; the HTML is the shared vocabulary (see src/html), and both
// directions go through the sanitizer.
//
// Round trip: for normalized blocks, `htmlToBlocks(blocksToHtml(b))` deep
// equals `b`. Normalized means: `props` present only when non-empty (but
// heading `level`, checklistItem `checked`, callout `tone` and table
// `headerRow` / `rows` are always present), `content` present on text blocks
// (possibly `[]`) and absent on image, table, divider, audio and video,
// `children` present only when non-empty, adjacent text items with equal marks
// merged, marks in canonical order, whitespace collapsed as HTML renders it.

import { parseHtml, type HtmlElement, type HtmlNode } from '../html/parse.js';
import { sanitizeNodes } from '../html/sanitize.js';
import { parseStyle } from '../html/policy.js';
import { SIMPLE_MARKS, VALUE_MARKS, sortMarks } from './to-html.js';
import type { Block, BlockType, InlineContent, InlineLabel, InlineLink, InlineMark, InlineText } from './types.js';

const TAG_MARK: Readonly<Record<string, (typeof SIMPLE_MARKS)[number]>> = { strong: 'bold', em: 'italic', u: 'underline', s: 'strike', sub: 'subscript', sup: 'superscript', code: 'code' };
const PROP_MARK: Readonly<Record<string, (typeof VALUE_MARKS)[number]>> = { 'font-family': 'fontFamily', 'font-size': 'fontSize', color: 'color', 'background-color': 'backgroundColor' };

// ---- HTML -> blocks ---------------------------------------------------------


function sameMarks(a: readonly InlineMark[] | undefined, b: readonly InlineMark[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    const p = x[i] as InlineMark;
    const q = y[i] as InlineMark;
    if (p.type !== q.type || ('value' in p ? p.value : null) !== ('value' in q ? q.value : null)) return false;
  }
  return true;
}

function pushText(out: InlineText[] | InlineContent[], text: string, marks: readonly InlineMark[]): void {
  if (text === '') return;
  const last = out[out.length - 1];
  const sorted = sortMarks(marks);
  if (last && last.type === 'text' && sameMarks(last.marks, sorted)) {
    last.text += text;
    return;
  }
  const item: InlineText = { type: 'text', text };
  if (sorted.length) item.marks = sorted;
  (out as InlineContent[]).push(item);
}

function withMark(marks: readonly InlineMark[], mark: InlineMark): InlineMark[] {
  return [...marks.filter((m) => m.type !== mark.type), mark];
}

function spanMarks(node: HtmlElement, marks: readonly InlineMark[]): InlineMark[] {
  let next = [...marks];
  const style = node.attrs.style;
  if (!style) return next;
  for (const [p, value] of parseStyle(style)) {
    const type = PROP_MARK[p];
    if (type) next = withMark(next, { type, value });
  }
  return next;
}

function collectInline(nodes: readonly HtmlNode[], marks: readonly InlineMark[], out: InlineContent[]): void {
  for (const n of nodes) {
    if (n.type === 'text') {
      pushText(out, n.value, marks);
      continue;
    }
    if (n.type !== 'element') continue;
    const simple = TAG_MARK[n.tag];
    if (simple) {
      collectInline(n.children, withMark(marks, { type: simple }), out);
      continue;
    }
    switch (n.tag) {
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      case 'mark':
        collectInline(n.children, withMark(marks, { type: 'backgroundColor', value: 'yellow' }), out);
        break;
      case 'span': {
        const kind = n.attrs['data-type'];
        if (kind === 'mention' || kind === 'label') {
          const trigger = n.attrs['data-trigger'] ?? (kind === 'mention' ? '@' : '#');
          const text = textContent(n.children);
          const label = n.attrs['data-label'] ?? (text.startsWith(trigger) ? text.slice(trigger.length) : text);
          if (kind === 'mention') out.push({ type: 'mention', id: n.attrs['data-id'] ?? '', label, trigger });
          else {
            const item: InlineLabel = { type: 'label', id: n.attrs['data-id'] ?? '', label, trigger };
            if (n.attrs['data-tone']) item.tone = n.attrs['data-tone'];
            out.push(item);
          }
          break;
        }
        collectInline(n.children, spanMarks(n, marks), out);
        break;
      }
      case 'a': {
        const content: InlineContent[] = [];
        collectInline(n.children, marks, content);
        const texts = content.filter((c): c is InlineText => c.type === 'text');
        const link: InlineLink = { type: 'link', href: n.attrs.href ?? '', content: texts };
        if (n.attrs.target === '_blank') link.target = '_blank';
        if (texts.length) out.push(link);
        break;
      }
      case 'img':
        // Inline images have no inline content type; see image blocks.
        break;
      default:
        collectInline(n.children, marks, out);
    }
  }
}

function textContent(nodes: readonly HtmlNode[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += n.value;
    else if (n.type === 'element') s += n.tag === 'br' ? '\n' : textContent(n.children);
  }
  return s;
}

/** Collapses whitespace as HTML renders it, trims the ends, merges equal neighbours. */
function normalizeInline(items: InlineContent[]): InlineContent[] {
  let space = true; // at block start, leading whitespace goes
  const out: InlineContent[] = [];
  const fix = (t: InlineText): InlineText | null => {
    let text = t.text.replace(/[\t\n\f\r ]+/g, ' ');
    if (space && text.startsWith(' ')) text = text.slice(1);
    if (text === '') return null;
    space = text.endsWith(' ');
    return t.marks ? { type: 'text', text, marks: t.marks } : { type: 'text', text };
  };
  for (const item of items) {
    if (item.type === 'text') {
      const t = fix(item);
      if (t) pushText(out, t.text, t.marks ?? []);
    } else if (item.type === 'link') {
      const content: InlineText[] = [];
      for (const c of item.content) {
        const t = fix(c);
        if (t) pushText(content, t.text, t.marks ?? []);
      }
      if (content.length) out.push({ ...item, content });
    } else {
      out.push(item);
      space = item.type === 'hardBreak';
    }
  }
  // Trailing whitespace at block end.
  const last = out[out.length - 1];
  if (last && last.type === 'text' && last.text.endsWith(' ')) {
    last.text = last.text.slice(0, -1);
    if (last.text === '') out.pop();
  } else if (last && last.type === 'link') {
    const lt = last.content[last.content.length - 1];
    if (lt && lt.text.endsWith(' ')) {
      lt.text = lt.text.slice(0, -1);
      if (lt.text === '') last.content.pop();
      if (last.content.length === 0) out.pop();
    }
  }
  return out;
}

function inline(nodes: readonly HtmlNode[]): InlineContent[] {
  const out: InlineContent[] = [];
  collectInline(nodes, [], out);
  return normalizeInline(out);
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'pre', 'ul', 'ol', 'li', 'figure', 'audio', 'video', 'iframe', 'table', 'div', 'details', 'summary', 'figcaption']);

function isBlockNode(n: HtmlNode): boolean {
  return n.type === 'element' && BLOCK_TAGS.has(n.tag);
}

function isBlank(n: HtmlNode): boolean {
  return (n.type === 'text' && /^[\t\n\f\r ]*$/.test(n.value)) || n.type === 'comment';
}

/** Draft block: `id` is '' when the HTML had none. */
type Draft = Block;

function idOf(node: HtmlElement): string {
  return node.attrs['data-block-id'] ?? '';
}

function int(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number.parseInt(value, 10);
}

/** Splits a container body into its own text (first paragraph or leading inline run) and child blocks. */
function body(nodes: readonly HtmlNode[]): { content: InlineContent[]; children: Draft[] } {
  const kids = nodes.filter((n) => !isBlank(n));
  const first = kids[0];
  if (first && first.type === 'element' && first.tag === 'p') return { content: inline(first.children), children: toBlocks(kids.slice(1)) };
  let i = 0;
  while (i < kids.length && !isBlockNode(kids[i] as HtmlNode)) i++;
  return { content: inline(kids.slice(0, i)), children: toBlocks(kids.slice(i)) };
}

function withBody(block: Draft, nodes: readonly HtmlNode[]): Draft {
  const { content, children } = body(nodes);
  block.content = content;
  if (children.length) block.children = children;
  return block;
}

function textAlign(node: HtmlElement): Record<string, unknown> {
  const a = node.attrs.style ? parseStyle(node.attrs.style).get('text-align') : undefined;
  return a ? { textAlign: a } : {};
}

function imageBlock(img: HtmlElement, id: string, caption: string | undefined): Draft {
  const props: Record<string, unknown> = { src: img.attrs.src ?? '' };
  if (img.attrs.alt !== undefined) props.alt = img.attrs.alt;
  if (caption !== undefined) props.caption = caption;
  const w = int(img.attrs.width);
  if (w !== undefined) props.width = w;
  const h = int(img.attrs.height);
  if (h !== undefined) props.height = h;
  return { id, type: 'image', props };
}

function soleImage(nodes: readonly HtmlNode[]): HtmlElement | null {
  const kids = nodes.filter((n) => !isBlank(n));
  const only = kids[0];
  return kids.length === 1 && only && only.type === 'element' && only.tag === 'img' ? only : null;
}

function cellContent(cell: HtmlElement): InlineContent[] {
  const kids = cell.children.filter((n) => !isBlank(n));
  if (!kids.some(isBlockNode)) return inline(kids);
  const parts: InlineContent[] = [];
  for (const k of kids) {
    const c = k.type === 'element' && isBlockNode(k) ? inline(k.children) : inline([k]);
    if (parts.length && c.length) parts.push({ type: 'hardBreak' });
    parts.push(...c);
  }
  return parts;
}

function listItems(list: HtmlElement, out: Draft[]): void {
  const type: BlockType = list.tag === 'ol' ? 'numberedListItem' : list.attrs['data-type'] === 'checklist' ? 'checklistItem' : 'bulletListItem';
  let first = true;
  for (const li of list.children) {
    if (li.type !== 'element' || li.tag !== 'li') continue;
    const block: Draft = { id: idOf(li), type };
    if (type === 'checklistItem') block.props = { checked: li.attrs['data-checked'] === 'true' };
    if (type === 'numberedListItem' && first && list.attrs.start !== undefined) {
      const start = int(list.attrs.start);
      if (start !== undefined) block.props = { start };
    }
    first = false;
    out.push(withBody(block, li.children));
  }
}

function toBlocks(nodes: readonly HtmlNode[]): Draft[] {
  const out: Draft[] = [];
  let run: HtmlNode[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const img = soleImage(run);
    if (img) out.push(imageBlock(img, '', undefined));
    else {
      const content = inline(run);
      if (content.length) out.push({ id: '', type: 'paragraph', content });
    }
    run = [];
  };
  for (const n of nodes) {
    if (n.type === 'comment') continue;
    if (!isBlockNode(n)) {
      run.push(n);
      continue;
    }
    flush();
    const e = n as HtmlElement;
    const id = idOf(e);
    switch (e.tag) {
      case 'p': {
        const img = soleImage(e.children);
        if (img) {
          out.push(imageBlock(img, id, undefined));
          break;
        }
        const props = textAlign(e);
        const block: Draft = { id, type: 'paragraph', content: inline(e.children) };
        if (Object.keys(props).length) block.props = props;
        out.push(block);
        break;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        out.push({ id, type: 'heading', props: { level: Number(e.tag.charAt(1)), ...textAlign(e) }, content: inline(e.children) });
        break;
      case 'blockquote':
        out.push(withBody({ id, type: 'quote' }, e.children));
        break;
      case 'div':
        if (e.attrs['data-type'] === 'callout') out.push(withBody({ id, type: 'callout', props: { tone: e.attrs['data-tone'] ?? 'info' } }, e.children));
        else out.push(...toBlocks(e.children));
        break;
      case 'pre': {
        const code = e.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'code');
        const text = textContent(code ? code.children : e.children);
        const block: Draft = { id, type: 'code', content: text ? [{ type: 'text', text }] : [] };
        const cls = code?.attrs.class;
        if (cls && cls.startsWith('language-')) block.props = { language: cls.slice(9) };
        out.push(block);
        break;
      }
      case 'ul':
      case 'ol':
        listItems(e, out);
        break;
      case 'figure': {
        const img = e.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'img');
        const cap = e.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'figcaption');
        if (img) out.push(imageBlock(img, id, cap ? textContent(cap.children).replace(/[\t\n\f\r ]+/g, ' ').trim() : undefined));
        break;
      }
      case 'table': {
        const rows: InlineContent[][][] = [];
        let headerRow = false;
        const trs: HtmlElement[] = [];
        for (const c of e.children) {
          if (c.type !== 'element') continue;
          if (c.tag === 'tr') trs.push(c);
          else if (c.tag === 'tbody') for (const r of c.children) if (r.type === 'element' && r.tag === 'tr') trs.push(r);
        }
        trs.forEach((tr, r) => {
          const cells = tr.children.filter((c): c is HtmlElement => c.type === 'element' && (c.tag === 'td' || c.tag === 'th'));
          if (r === 0) headerRow = cells.length > 0 && cells.every((c) => c.tag === 'th');
          rows.push(cells.map(cellContent));
        });
        const props: Record<string, unknown> = { headerRow, rows };
        const variant = /^salmon-rich-text-table--(bordered|striped)$/.exec(e.attrs.class ?? '');
        if (variant) props.variant = variant[1];
        out.push({ id, type: 'table', props });
        break;
      }
      case 'hr':
        out.push({ id, type: 'divider' });
        break;
      case 'details': {
        const summary = e.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'summary');
        const block: Draft = { id, type: 'toggle', content: summary ? inline(summary.children) : [] };
        if (e.attrs.open !== undefined) block.props = { open: true };
        const children = toBlocks(e.children.filter((c) => c !== summary));
        if (children.length) block.children = children;
        out.push(block);
        break;
      }
      case 'audio':
        out.push({ id, type: 'audio', props: { src: e.attrs.src ?? '' } });
        break;
      case 'video': {
        const props: Record<string, unknown> = { src: e.attrs.src ?? '' };
        const w = int(e.attrs.width);
        if (w !== undefined) props.width = w;
        const h = int(e.attrs.height);
        if (h !== undefined) props.height = h;
        out.push({ id, type: 'video', props });
        break;
      }
      default:
        // iframe embeds and stray parts have no block type.
        break;
    }
  }
  flush();
  return out;
}

function assignIds(blocks: Draft[]): Block[] {
  const used = new Set<string>();
  const explicit = new Set<Draft>();
  const collect = (list: Draft[]): void => {
    for (const b of list) {
      if (b.id !== '' && !used.has(b.id)) {
        used.add(b.id);
        explicit.add(b);
      }
      if (b.children) collect(b.children);
    }
  };
  collect(blocks);
  const assign = (list: Draft[], path: string): void => {
    list.forEach((b, i) => {
      const p = path === '' ? `b${i}` : `${path}-${i}`;
      if (!explicit.has(b)) {
        let id = p;
        let n = 2;
        while (used.has(id)) id = `${p}_${n++}`;
        used.add(id);
        b.id = id;
      }
      if (b.children) assign(b.children, p);
    });
  };
  assign(blocks, '');
  return blocks;
}

/**
 * Parses HTML into blocks (`parseHtmlToBlocks`). The HTML is
 * sanitized first. Ids come from `data-block-id`; missing or duplicate ids get
 * deterministic ones from the index path (`b0`, `b2-1`, ...), so server and
 * client agree. Content the block model has no type for (iframe embeds,
 * images inside text) is dropped.
 */
export function htmlToBlocks(html: string): Block[] {
  return assignIds(toBlocks(sanitizeNodes(parseHtml(html))));
}
