// Blocks -> HTML (`getDataAsHtml`): the half of the block conversion
// the server render and the BlockEditor shell need. HTML -> blocks lives in
// ./from-html.ts (loaded with the editor), see ./from-html.ts for the
// normalization rules of the round trip.

import type { HtmlElement, HtmlNode } from '../html/parse.js';
import { serializeHtml } from '../html/serialize.js';
import { sanitizeNodes } from '../html/sanitize.js';
import type { Block, BlockType, InlineContent, InlineMark, InlineText } from './types.js';

const LIST_TYPES: ReadonlySet<BlockType> = new Set(['bulletListItem', 'numberedListItem', 'checklistItem']);
export const SIMPLE_MARKS = ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'code'] as const;
export const VALUE_MARKS = ['fontFamily', 'fontSize', 'color', 'backgroundColor'] as const;
/** Canonical mark order. */
export const MARK_ORDER: readonly InlineMark['type'][] = [...SIMPLE_MARKS, ...VALUE_MARKS];
const MARK_TAG: Readonly<Record<string, string>> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', subscript: 'sub', superscript: 'sup', code: 'code' };
const STYLE_PROP: Readonly<Record<string, string>> = { fontFamily: 'font-family', fontSize: 'font-size', color: 'color', backgroundColor: 'background-color' };
const TONES = new Set(['info', 'success', 'warning', 'danger', 'neutral']);

export function el(tag: string, attrs: Record<string, string>, children: HtmlNode[]): HtmlElement {
  return { type: 'element', tag, attrs, children };
}

function txt(value: string): HtmlNode {
  return { type: 'text', value };
}

// ---- blocks -> HTML ---------------------------------------------------------

function textNodes(item: InlineText): HtmlNode[] {
  let node: HtmlNode[] = item.text ? [txt(item.text)] : [];
  if (node.length === 0) return node;
  const marks = sortMarks(item.marks ?? []);
  // Simple marks inside, value spans outside (outermost first in vocabulary order, as the sanitizer writes them).
  const simple = marks.filter((m) => !('value' in m));
  const valued = marks.filter((m) => 'value' in m);
  for (let i = simple.length - 1; i >= 0; i--) node = [el(MARK_TAG[(simple[i] as InlineMark).type] as string, {}, node)];
  for (let i = valued.length - 1; i >= 0; i--) {
    const m = valued[i] as InlineMark & { value: string };
    node = [el('span', { style: `${STYLE_PROP[m.type] as string}:${m.value}` }, node)];
  }
  return node;
}

function inlineNodes(content: readonly InlineContent[] | undefined): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const item of content ?? []) {
    switch (item.type) {
      case 'text':
        out.push(...textNodes(item));
        break;
      case 'hardBreak':
        out.push(el('br', {}, []));
        break;
      case 'link': {
        const attrs: Record<string, string> = { href: item.href };
        if (item.target === '_blank') {
          attrs.target = '_blank';
          attrs.rel = 'noopener noreferrer';
        }
        out.push(el('a', attrs, item.content.flatMap(textNodes)));
        break;
      }
      case 'mention':
        out.push(el('span', { 'data-type': 'mention', 'data-id': item.id, 'data-trigger': item.trigger }, [txt(item.trigger + item.label)]));
        break;
      case 'label': {
        const attrs: Record<string, string> = { 'data-type': 'label', 'data-id': item.id, 'data-trigger': item.trigger };
        if (item.tone) attrs['data-tone'] = item.tone;
        out.push(el('span', attrs, [txt(item.trigger + item.label)]));
        break;
      }
    }
  }
  return out;
}

function prop<T>(block: Block, name: string, check: (v: unknown) => v is T): T | undefined {
  const v = block.props?.[name];
  return check(v) ? v : undefined;
}
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function blockAttrs(block: Block, extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, 'data-block-id': block.id };
}

function alignStyle(block: Block): Record<string, string> {
  const a = prop(block, 'textAlign', isString);
  return a ? { style: `text-align:${a}` } : {};
}

function bodyNodes(block: Block): HtmlNode[] {
  return [el('p', {}, inlineNodes(block.content)), ...blocksToNodes(block.children ?? [])];
}

function blockNodes(block: Block): HtmlNode[] {
  switch (block.type) {
    case 'paragraph':
      return [el('p', blockAttrs(block, alignStyle(block)), inlineNodes(block.content))];
    case 'heading': {
      const level = Math.min(6, Math.max(1, Math.trunc(prop(block, 'level', isNumber) ?? 1)));
      return [el(`h${level}`, blockAttrs(block, alignStyle(block)), inlineNodes(block.content))];
    }
    case 'quote':
      return [el('blockquote', blockAttrs(block), bodyNodes(block))];
    case 'callout': {
      const tone = prop(block, 'tone', isString);
      return [el('div', blockAttrs(block, { 'data-type': 'callout', 'data-tone': tone && TONES.has(tone) ? tone : 'info' }), bodyNodes(block))];
    }
    case 'code': {
      const language = prop(block, 'language', isString);
      const text = (block.content ?? []).map((c) => (c.type === 'text' ? c.text : c.type === 'hardBreak' ? '\n' : '')).join('');
      return [el('pre', blockAttrs(block), [el('code', language ? { class: `language-${language}` } : {}, text ? [txt(text)] : [])])];
    }
    case 'image': {
      const attrs: Record<string, string> = { src: prop(block, 'src', isString) ?? '' };
      const alt = prop(block, 'alt', isString);
      if (alt !== undefined) attrs.alt = alt;
      const width = prop(block, 'width', isNumber);
      if (width !== undefined) attrs.width = String(Math.round(width));
      const height = prop(block, 'height', isNumber);
      if (height !== undefined) attrs.height = String(Math.round(height));
      const caption = prop(block, 'caption', isString);
      const kids: HtmlNode[] = [el('img', attrs, [])];
      if (caption !== undefined) kids.push(el('figcaption', {}, caption ? [txt(caption)] : []));
      return [el('figure', blockAttrs(block), kids)];
    }
    case 'table': {
      const rows = (block.props?.rows as InlineContent[][][] | undefined) ?? [];
      const header = block.props?.headerRow === true;
      const variant = prop(block, 'variant', isString);
      const trs = rows.map((row, r) => el('tr', {}, (row ?? []).map((cell) => el(header && r === 0 ? 'th' : 'td', {}, [el('p', {}, inlineNodes(cell))]))));
      return [el('table', blockAttrs(block, variant ? { class: `salmon-rich-text-table--${variant}` } : {}), [el('tbody', {}, trs)])];
    }
    case 'divider':
      return [el('hr', blockAttrs(block), [])];
    case 'toggle': {
      const attrs = blockAttrs(block);
      if (block.props?.open === true) attrs.open = '';
      return [el('details', attrs, [el('summary', {}, inlineNodes(block.content)), ...blocksToNodes(block.children ?? [])])];
    }
    case 'audio':
      return [el('audio', { controls: '', src: prop(block, 'src', isString) ?? '', 'data-block-id': block.id }, [])];
    case 'video': {
      const attrs: Record<string, string> = { controls: '', src: prop(block, 'src', isString) ?? '' };
      const width = prop(block, 'width', isNumber);
      if (width !== undefined) attrs.width = String(Math.round(width));
      const height = prop(block, 'height', isNumber);
      if (height !== undefined) attrs.height = String(Math.round(height));
      attrs['data-block-id'] = block.id;
      return [el('video', attrs, [])];
    }
    default:
      // List items are grouped by blocksToNodes; unknown types render as paragraphs.
      return [el('p', blockAttrs(block), inlineNodes(block.content))];
  }
}

function listItem(block: Block): HtmlElement {
  const attrs: Record<string, string> = {};
  if (block.type === 'checklistItem') attrs['data-checked'] = block.props?.checked === true ? 'true' : 'false';
  attrs['data-block-id'] = block.id;
  return el('li', attrs, bodyNodes(block));
}

/** Blocks as an HTML tree (consecutive list items of one kind share a list). */
export function blocksToNodes(blocks: readonly Block[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i] as Block;
    if (!LIST_TYPES.has(block.type)) {
      out.push(...blockNodes(block));
      i++;
      continue;
    }
    const type = block.type;
    const attrs: Record<string, string> = {};
    if (type === 'checklistItem') attrs['data-type'] = 'checklist';
    const start = prop(block, 'start', isNumber);
    if (type === 'numberedListItem' && start !== undefined) attrs.start = String(Math.trunc(start));
    const items: HtmlNode[] = [listItem(block)];
    i++;
    // A numbered item with its own `start` begins a new list.
    while (i < blocks.length && (blocks[i] as Block).type === type && !(type === 'numberedListItem' && prop(blocks[i] as Block, 'start', isNumber) !== undefined)) {
      items.push(listItem(blocks[i] as Block));
      i++;
    }
    out.push(el(type === 'numberedListItem' ? 'ol' : 'ul', attrs, items));
  }
  return out;
}

/**
 * Serializes blocks to sanitized HTML in the shared vocabulary (`getDataAsHtml`). Block ids are written as `data-block-id`. Pure and
 * server-safe; unsafe values in the JSON (a `javascript:` link, say) are
 * removed by the sanitizer like any other HTML.
 */
export function blocksToHtml(blocks: readonly Block[]): string {
  return serializeHtml(sanitizeNodes(blocksToNodes(blocks)));
}

/** Marks in canonical order, one per type (the last wins). */
export function sortMarks(marks: readonly InlineMark[]): InlineMark[] {
  const byType = new Map<string, InlineMark>();
  for (const m of marks) byType.set(m.type, m);
  return MARK_ORDER.filter((t) => byType.has(t)).map((t) => byType.get(t) as InlineMark);
}
