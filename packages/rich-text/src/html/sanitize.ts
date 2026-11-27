// Server-safe allow-list sanitizer. Always on: RichTextEditor runs it on `value` in and HTML
// out, RichTextContent on what it renders, paste cleanup on clipboard HTML.
//
// The allow-list is exactly the shared HTML vocabulary of the schema (the
// engine, the block serializers and this module agree on it): every other
// element is unwrapped keeping its text, except the ones in DROP_WITH_CONTENT,
// which go with their content. Attributes are kept only per element and per
// value rule (URLs by scheme, styles per property, integers by range), text is
// always escaped, comments are removed. Structure is normalized the way the
// schema expects it: table sections become one <tbody>, a list directly in a
// list moves into the previous item, <pre> holds one <code>, spans carry one
// style property each and font-weight / font-style / text-decoration /
// vertical-align styles become marks.

import { parseHtml, type HtmlElement, type HtmlNode } from './parse.js';
import { serializeHtml } from './serialize.js';
import {
  cleanColor,
  cleanFontFamily,
  cleanFontSize,
  cleanKeyword,
  cleanLineHeight,
  cleanUrl,
  embedAllowed,
  parseStyle,
  cleanAllowedAttr,
  compileAllow,
  type CompiledAllow,
  type SanitizeAllow,
} from './policy.js';

/** A sanitized element as the `sanitize` hook sees it (read-only copy). */
export interface SanitizeElement {
  /** Lowercase tag name from the vocabulary (`p`, `a`, `img`, `span`, ...). */
  readonly tag: string;
  /** The attributes that survived the built-in rules. */
  readonly attrs: Readonly<Record<string, string>>;
  /** Tag of the sanitized parent element, or null at the top level. */
  readonly parent: string | null;
}

/**
 * What the `sanitize` hook returns for an element:
 * - `undefined` / `'keep'`: keep it as is;
 * - `null` / `'remove'`: remove it with its content;
 * - `'unwrap'`: remove the element and keep its content;
 * - `{ attrs }`: keep it with these attributes. Only names the element
 *   already has are accepted and every value is validated again by the
 *   built-in rules, so the hook can drop or narrow attributes but never add
 *   one or re-enable a value the sanitizer refused.
 */
export type SanitizeHookResult = undefined | null | 'keep' | 'remove' | 'unwrap' | { attrs: Record<string, string> };

/**
 * Extension hook (`sanitize`). It
 * runs after the built-in allow-list, on every element of the sanitized tree,
 * parents before children. It can only remove or further restrict content;
 * the built-in sanitizing cannot be turned off or widened through it.
 */
export type SanitizeHook = (element: SanitizeElement) => SanitizeHookResult;

export interface SanitizeHtmlOptions {
  /**
   * Hostnames whose `<iframe src>` embeds are kept (`www.youtube-nocookie.com`,
   * or `*.example.com` for subdomains). Default: none, so iframes are dropped.
   */
  embedHosts?: readonly string[];
  /** Further restriction, see {@link SanitizeHook}. */
  sanitize?: SanitizeHook;
  /** Keep `data-block-id` attributes (BlockEditor ids). Default: true. */
  blockIds?: boolean;
  /**
   * Elements and attributes editor extensions add. It can widen the
   * vocabulary only with inert markup: script, style, iframe, object, embed,
   * forms and foreign content, `on*` handlers, `style` and URL carriers other
   * than href / cite / src / poster (checked by the URL rules) are refused.
   */
  allow?: SanitizeAllow | readonly SanitizeAllow[];
}

/** Elements removed together with their content. */
export const DROP_WITH_CONTENT: ReadonlySet<string> = new Set([
  'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'applet', 'head', 'title', 'svg', 'math',
  'select', 'option', 'optgroup', 'datalist', 'frame', 'frameset', 'noframes', 'noembed', 'xml', 'link', 'meta', 'base',
  'input', 'param', 'source', 'track', 'col', 'colgroup', 'canvas', 'portal', 'area', 'map', 'basefont', 'bgsound', 'keygen',
]);

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'pre', 'ul', 'ol', 'li', 'figure', 'figcaption', 'audio', 'video',
  'iframe', 'table', 'div', 'details', 'summary', 'address', 'article', 'aside', 'footer', 'header', 'main', 'nav', 'section',
  'dl', 'dt', 'dd', 'center', 'form', 'fieldset', 'hgroup', 'menu', 'dir', 'listing', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot',
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const MARK_TAGS: Readonly<Record<string, string>> = {
  strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', ins: 'u', s: 's', del: 's', strike: 's', sub: 'sub', sup: 'sup',
  code: 'code', kbd: 'code', samp: 'code', tt: 'code', mark: 'mark',
};
const TEXT_ALIGN = new Set(['left', 'center', 'right', 'justify']);
const UL_STYLES = new Set(['disc', 'circle', 'square']);
const OL_STYLES = new Set(['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman']);
const TONES = new Set(['info', 'success', 'warning', 'danger', 'neutral']);
const TABLE_VARIANTS = new Set(['salmon-rich-text-table--bordered', 'salmon-rich-text-table--striped']);
const BLOCK_ID = /^[A-Za-z0-9_\-:.]{1,128}$/;
const LANGUAGE = /^language-[A-Za-z0-9_+#.-]{1,40}$/;
const SPAN_STYLES = ['font-family', 'font-size', 'color', 'background-color'] as const;

interface Ctx {
  parent: string | null;
  /** Kind of the nearest sanitized list (for `li`). */
  list: 'ul' | 'ol' | 'checklist' | null;
  embedHosts: readonly string[];
  blockIds: boolean;
  allow: CompiledAllow | null;
}

/** Output tags of the built-in vocabulary; an extension cannot redefine them. */
const VOCABULARY: ReadonlySet<string> = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'figure', 'figcaption', 'img',
  'audio', 'video', 'iframe', 'table', 'thead', 'tbody', 'tfoot', 'caption', 'tr', 'td', 'th', 'div', 'details', 'summary', 'a', 'span',
  'strong', 'em', 'u', 's', 'sub', 'sup', 'mark', 'font',
]);

function int(value: string | undefined, min: number, max: number): string | null {
  if (value === undefined || !/^\s*\d{1,6}\s*$/.test(value)) return null;
  const n = Number.parseInt(value, 10);
  return n >= min && n <= max ? String(n) : null;
}

/**
 * Validates one attribute of a vocabulary element. Shared by the main pass and
 * the hook pass, so a hook-provided value goes through the same rules.
 */
function cleanAttr(tag: string, name: string, value: string, ctx: Ctx): string | null {
  const v = builtInAttr(tag, name, value, ctx);
  return v !== null || !ctx.allow ? v : cleanAllowedAttr(ctx.allow, tag, name, value);
}

function builtInAttr(tag: string, name: string, value: string, ctx: Ctx): string | null {
  if (name === 'data-block-id') {
    return ctx.blockIds && BLOCK_ATTR_TAGS.has(tag) && BLOCK_ID.test(value) ? value : null;
  }
  switch (tag) {
    case 'p':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      if (name === 'data-indent') return int(value, 1, 8);
      if (name === 'style') return cleanBlockStyle(value);
      return null;
    case 'ul':
      if (name === 'data-type') return value === 'checklist' ? value : null;
      if (name === 'style') return listStyle(value, UL_STYLES);
      return null;
    case 'ol':
      if (name === 'start') return int(value, 0, 999999);
      if (name === 'style') return listStyle(value, OL_STYLES);
      return null;
    case 'li':
      if (name === 'data-checked') return ctx.list === 'checklist' ? (value === 'true' ? 'true' : 'false') : null;
      return null;
    case 'code':
      return name === 'class' && LANGUAGE.test(value.trim()) ? value.trim() : null;
    case 'a':
      if (name === 'href') return cleanUrl(value, 'link');
      if (name === 'title') return value;
      if (name === 'target') return value === '_blank' ? value : null;
      if (name === 'rel') return value === 'noopener noreferrer' ? value : null;
      return null;
    case 'img':
      if (name === 'src') return cleanUrl(value, 'image');
      if (name === 'alt' || name === 'title') return value;
      if (name === 'width' || name === 'height') return int(value, 1, 100000);
      return null;
    case 'audio':
    case 'video':
      if (name === 'src') return cleanUrl(value, 'media');
      if (name === 'controls') return '';
      if (tag === 'video' && (name === 'width' || name === 'height')) return int(value, 1, 100000);
      return null;
    case 'iframe':
      if (name === 'src') {
        const src = cleanUrl(value, 'embed');
        return src !== null && embedAllowed(src, ctx.embedHosts) ? src : null;
      }
      if (name === 'width' || name === 'height') return int(value, 1, 100000);
      if (name === 'allowfullscreen') return '';
      return null;
    case 'table':
      return name === 'class' && TABLE_VARIANTS.has(value.trim()) ? value.trim() : null;
    case 'td':
    case 'th':
      if (name === 'colspan' || name === 'rowspan') return int(value, 1, 1000);
      if (name === 'data-colwidth') return /^\d{1,5}(?:,\d{1,5})*$/.test(value) ? value : null;
      return null;
    case 'div':
      if (name === 'data-type') return value === 'callout' ? value : null;
      if (name === 'data-tone') return TONES.has(value) ? value : null;
      return null;
    case 'details':
      return name === 'open' ? '' : null;
    case 'span':
      if (name === 'style') return value;
      if (name === 'data-type') return value === 'mention' || value === 'label' ? value : null;
      if (name === 'data-id' || name === 'data-label') return value.length <= 500 ? value : null;
      if (name === 'data-trigger') return value.length >= 1 && value.length <= 3 && !/[\s\w<>"'&]/.test(value) ? value : null;
      if (name === 'data-tone') return TONES.has(value) ? value : null;
      return null;
    default:
      return null;
  }
}

const BLOCK_ATTR_TAGS: ReadonlySet<string> = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'pre', 'ul', 'ol', 'li', 'figure', 'audio', 'video', 'iframe', 'table', 'div', 'details',
]);

function cleanBlockStyle(style: string): string | null {
  const decls = parseStyle(style);
  const out: string[] = [];
  const align = decls.get('text-align');
  const a = align === undefined ? null : cleanKeyword(align === 'start' ? 'left' : align === 'end' ? 'right' : align, TEXT_ALIGN);
  if (a) out.push(`text-align:${a}`);
  const lh = decls.get('line-height');
  const l = lh === undefined ? null : cleanLineHeight(lh);
  if (l) out.push(`line-height:${l}`);
  return out.length ? out.join(';') : null;
}

function listStyle(style: string, allowed: ReadonlySet<string>): string | null {
  const v = parseStyle(style).get('list-style-type');
  const k = v === undefined ? null : cleanKeyword(v, allowed);
  return k ? `list-style-type:${k}` : null;
}

function cleanAttrs(tag: string, attrs: Readonly<Record<string, string>>, ctx: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(attrs)) {
    const v = cleanAttr(tag, name, attrs[name] as string, ctx);
    if (v !== null) out[name] = v;
  }
  return out;
}

function el(tag: string, attrs: Record<string, string>, children: HtmlNode[]): HtmlElement {
  return { type: 'element', tag, attrs, children };
}

function pushText(out: HtmlNode[], value: string): void {
  if (value === '') return;
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.value += value;
  else out.push({ type: 'text', value });
}

function pushAll(out: HtmlNode[], nodes: readonly HtmlNode[]): void {
  for (const n of nodes) {
    if (n.type === 'text') pushText(out, n.value);
    else out.push(n);
  }
}

function isWhitespace(node: HtmlNode): boolean {
  return node.type === 'text' && /^[\t\n\f\r ]*$/.test(node.value);
}

function textOf(nodes: readonly HtmlNode[], out: string[]): void {
  for (const n of nodes) {
    if (n.type === 'text') out.push(n.value);
    else if (n.type === 'element') {
      if (DROP_WITH_CONTENT.has(n.tag)) continue;
      if (n.tag === 'br') out.push('\n');
      else textOf(n.children, out);
    }
  }
}

function hasBlockChild(nodes: readonly HtmlNode[]): boolean {
  return nodes.some((n) => n.type === 'element' && BLOCK_TAGS.has(n.tag));
}

function sanitizeChildren(nodes: readonly HtmlNode[], ctx: Ctx): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text') pushText(out, node.value);
    else if (node.type === 'element') pushAll(out, sanitizeElement(node, ctx));
  }
  return out;
}

function child(ctx: Ctx, parent: string, list: Ctx['list'] = ctx.list): Ctx {
  return { parent, list, embedHosts: ctx.embedHosts, blockIds: ctx.blockIds, allow: ctx.allow };
}

/** Sanitizes one element; returns the nodes that replace it. */
function sanitizeElement(node: HtmlElement, ctx: Ctx): HtmlNode[] {
  const tag = node.tag;
  if (DROP_WITH_CONTENT.has(tag) && tag !== 'iframe') return [];
  if (tag.indexOf(':') >= 0) return sanitizeChildren(node.children, ctx);
  // An extension element: kept with its allowed attributes; its content is sanitized as usual.
  if (ctx.allow?.tags.has(tag) && !VOCABULARY.has(tag)) return [el(tag, cleanAttrs(tag, node.attrs, ctx), sanitizeChildren(node.children, child(ctx, tag)))];
  const mark = MARK_TAGS[tag];
  if (mark !== undefined) return sanitizeMark(node, mark, ctx);
  switch (tag) {
    case 'p':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return [el(tag, cleanAttrs(tag, node.attrs, ctx), sanitizeChildren(node.children, child(ctx, tag)))];
    case 'br':
      return [el('br', {}, [])];
    case 'hr':
      return [el('hr', cleanAttrs(tag, node.attrs, ctx), [])];
    case 'blockquote':
      return [el(tag, cleanAttrs(tag, node.attrs, ctx), sanitizeChildren(node.children, child(ctx, tag)))];
    case 'pre':
    case 'listing':
    case 'xmp':
    case 'plaintext':
      return [sanitizePre(node, ctx)];
    case 'ul':
    case 'ol':
    case 'dir':
    case 'menu':
      return [sanitizeList(node, ctx)];
    case 'li':
      if (ctx.parent === 'ul' || ctx.parent === 'ol') {
        return [el('li', cleanAttrs('li', node.attrs, ctx), sanitizeChildren(node.children, child(ctx, 'li')))];
      }
      return asParagraph(node, ctx);
    case 'figure':
      return sanitizeFigure(node, ctx);
    case 'figcaption':
      return ctx.parent === 'figure' ? [el(tag, {}, sanitizeChildren(node.children, child(ctx, tag)))] : asParagraph(node, ctx);
    case 'img': {
      const attrs = cleanAttrs(tag, node.attrs, ctx);
      return attrs.src ? [el('img', attrs, [])] : [];
    }
    case 'audio':
    case 'video': {
      const raw: Record<string, string> = { ...node.attrs };
      if (raw.src === undefined) {
        const source = node.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'source' && typeof c.attrs.src === 'string');
        if (source) raw.src = source.attrs.src as string;
      }
      raw.controls = '';
      const attrs = cleanAttrs(tag, raw, ctx);
      return attrs.src ? [el(tag, orderMedia(attrs), [])] : [];
    }
    case 'iframe': {
      const attrs = cleanAttrs(tag, node.attrs, ctx);
      return attrs.src ? [el('iframe', attrs, [])] : [];
    }
    case 'table':
      return sanitizeTable(node, ctx);
    case 'div':
      return sanitizeDiv(node, ctx);
    case 'details': {
      const body = sanitizeChildren(node.children, child(ctx, 'details'));
      const first = body.findIndex((n) => !isWhitespace(n));
      const summary = first >= 0 ? body[first] : undefined;
      const rest = body.filter((n, i) => i !== first || !(summary && summary.type === 'element' && summary.tag === 'summary'));
      const head = summary && summary.type === 'element' && summary.tag === 'summary' ? summary : el('summary', {}, []);
      return [el('details', cleanAttrs(tag, node.attrs, ctx), [head, ...rest.filter((n) => !(n.type === 'element' && n.tag === 'summary'))])];
    }
    case 'summary':
      return ctx.parent === 'details' ? [el('summary', {}, sanitizeChildren(node.children, child(ctx, 'summary')))] : asParagraph(node, ctx);
    case 'a': {
      const attrs = cleanAttrs(tag, node.attrs, ctx);
      const kids = sanitizeChildren(node.children, child(ctx, 'a'));
      if (attrs.href === undefined) return kids;
      const out: Record<string, string> = { href: attrs.href };
      if (attrs.title !== undefined) out.title = attrs.title;
      if (attrs.target === '_blank') {
        out.target = '_blank';
        out.rel = 'noopener noreferrer';
      }
      return [el('a', out, kids)];
    }
    case 'span':
      return sanitizeSpan(node, ctx);
    case 'font': {
      const style: string[] = [];
      if (node.attrs.face) style.push(`font-family:${node.attrs.face}`);
      if (node.attrs.color) style.push(`color:${node.attrs.color}`);
      if (node.attrs.style) style.push(node.attrs.style);
      return sanitizeSpan(el('span', { style: style.join(';') }, node.children), ctx);
    }
    case 'tr':
    case 'td':
    case 'th':
    case 'tbody':
    case 'thead':
    case 'tfoot':
    case 'caption':
      // Table parts outside a table: keep the content.
      return sanitizeChildren(node.children, ctx);
    default:
      // Unknown element: unwrapped, its text kept.
      return sanitizeChildren(node.children, ctx);
  }
}

function orderMedia(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { controls: '' };
  for (const k of ['src', 'width', 'height', 'data-block-id']) if (attrs[k] !== undefined) out[k] = attrs[k] as string;
  return out;
}

function asParagraph(node: HtmlElement, ctx: Ctx): HtmlNode[] {
  const kids = sanitizeChildren(node.children, child(ctx, 'p'));
  if (hasBlockChild(kids)) return kids;
  return [el('p', {}, kids)];
}

function sanitizeMark(node: HtmlElement, tag: string, ctx: Ctx): HtmlNode[] {
  // `<b style="font-weight:normal">` (Google Docs wrapper) is not bold.
  const style = node.attrs.style ? parseStyle(node.attrs.style) : null;
  if (style && tag === 'strong') {
    const w = style.get('font-weight');
    if (w !== undefined && !isBold(w)) return sanitizeChildren(node.children, ctx);
  }
  if (style && tag === 'em') {
    const s = style.get('font-style');
    if (s !== undefined && s.trim().toLowerCase() === 'normal') return sanitizeChildren(node.children, ctx);
  }
  const attrs = tag === 'code' ? cleanAttrs('code', node.attrs, ctx) : {};
  const kids = sanitizeChildren(node.children, child(ctx, tag));
  if (kids.length === 0) return [];
  return [el(tag, attrs, kids)];
}

function isBold(weight: string): boolean {
  const w = weight.trim().toLowerCase();
  if (w === 'bold' || w === 'bolder') return true;
  const n = Number.parseInt(w, 10);
  return Number.isFinite(n) && n >= 600;
}

function sanitizeSpan(node: HtmlElement, ctx: Ctx): HtmlNode[] {
  const type = node.attrs['data-type'];
  if (type === 'mention' || type === 'label') {
    const attrs = cleanAttrs('span', node.attrs, ctx);
    delete attrs.style;
    if (attrs['data-id'] === undefined) return sanitizeChildren(node.children, ctx);
    if (type === 'mention') delete attrs['data-tone'];
    const text: string[] = [];
    textOf(node.children, text);
    const ordered: Record<string, string> = { 'data-type': type, 'data-id': attrs['data-id'] };
    for (const k of ['data-label', 'data-trigger', 'data-tone']) if (attrs[k] !== undefined) ordered[k] = attrs[k] as string;
    return [el('span', ordered, text.length ? [{ type: 'text', value: text.join('') }] : [])];
  }
  let kids = sanitizeChildren(node.children, child(ctx, 'span'));
  // Extension attributes on a span keep it (outermost), with the style marks inside.
  const extra: Record<string, string> = {};
  if (ctx.allow) for (const name of Object.keys(node.attrs)) {
    const v = name === 'style' ? null : cleanAllowedAttr(ctx.allow, 'span', name, node.attrs[name] as string);
    if (v !== null) extra[name] = v;
  }
  const wrap = (inner: HtmlNode[]): HtmlNode[] => (Object.keys(extra).length && inner.length ? [el('span', extra, inner)] : inner);
  const style = node.attrs.style;
  if (!style || kids.length === 0) return wrap(kids);
  const decls = parseStyle(style);
  // Marks implied by styles (Google Docs, Word, other editors).
  const marks: string[] = [];
  const weight = decls.get('font-weight');
  if (weight !== undefined && isBold(weight)) marks.push('strong');
  const fontStyle = decls.get('font-style');
  if (fontStyle !== undefined && /^(?:italic|oblique)/i.test(fontStyle.trim())) marks.push('em');
  const deco = `${decls.get('text-decoration') ?? ''} ${decls.get('text-decoration-line') ?? ''}`.toLowerCase();
  if (/\bunderline\b/.test(deco)) marks.push('u');
  if (/\bline-through\b/.test(deco)) marks.push('s');
  const va = (decls.get('vertical-align') ?? '').trim().toLowerCase();
  if (va === 'super') marks.push('sup');
  else if (va === 'sub') marks.push('sub');
  for (let i = marks.length - 1; i >= 0; i--) kids = [el(marks[i] as string, {}, kids)];
  // One style property per span, outermost first in vocabulary order.
  for (let i = SPAN_STYLES.length - 1; i >= 0; i--) {
    const prop = SPAN_STYLES[i] as (typeof SPAN_STYLES)[number];
    const raw = decls.get(prop);
    if (raw === undefined) continue;
    const value = prop === 'font-family' ? cleanFontFamily(raw) : prop === 'font-size' ? cleanFontSize(raw) : cleanColor(raw);
    if (value !== null) kids = [el('span', { style: `${prop}:${value}` }, kids)];
  }
  return wrap(kids);
}

function sanitizePre(node: HtmlElement, ctx: Ctx): HtmlElement {
  const text: string[] = [];
  textOf(node.children, text);
  const code = node.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'code');
  const codeAttrs = code ? cleanAttrs('code', code.attrs, ctx) : {};
  const value = text.join('');
  return el('pre', cleanAttrs('pre', node.attrs, ctx), [el('code', codeAttrs, value ? [{ type: 'text', value }] : [])]);
}

function sanitizeList(node: HtmlElement, ctx: Ctx): HtmlElement {
  const tag = node.tag === 'ol' ? 'ol' : 'ul';
  const attrs = cleanAttrs(tag, node.attrs, ctx);
  const kind: Ctx['list'] = tag === 'ol' ? 'ol' : attrs['data-type'] === 'checklist' ? 'checklist' : 'ul';
  if (kind === 'checklist') delete attrs.style;
  const kids = sanitizeChildren(node.children, child(ctx, tag, kind));
  const items: HtmlNode[] = [];
  let loose: HtmlElement | null = null;
  for (const k of kids) {
    if (k.type === 'element' && k.tag === 'li') {
      items.push(k);
      loose = null;
      continue;
    }
    if (isWhitespace(k)) continue;
    const last = items[items.length - 1];
    if (k.type === 'element' && (k.tag === 'ul' || k.tag === 'ol') && last && last.type === 'element') {
      // A list directly inside a list (Google Docs nesting) belongs to the previous item.
      last.children.push(k);
      continue;
    }
    if (!loose) {
      loose = el('li', kind === 'checklist' ? { 'data-checked': 'false' } : {}, []);
      items.push(loose);
    }
    if (k.type === 'text') pushText(loose.children, k.value);
    else loose.children.push(k);
  }
  if (kind === 'checklist') {
    for (const it of items) if (it.type === 'element' && it.attrs['data-checked'] === undefined) it.attrs = { 'data-checked': 'false', ...it.attrs };
  }
  return el(tag, attrs, items);
}

function sanitizeFigure(node: HtmlElement, ctx: Ctx): HtmlNode[] {
  const kids = sanitizeChildren(node.children, child(ctx, 'figure'));
  let img: HtmlElement | null = null;
  let caption: HtmlElement | null = null;
  const rest: HtmlNode[] = [];
  const find = (nodes: HtmlNode[]): void => {
    for (const k of nodes) {
      if (k.type !== 'element') {
        if (!isWhitespace(k)) rest.push(k);
        continue;
      }
      if (k.tag === 'img' && !img) img = k;
      else if (k.tag === 'figcaption' && !caption) caption = k;
      else if (k.tag === 'p' && !img && k.children.some((c) => c.type === 'element' && c.tag === 'img')) find(k.children);
      else rest.push(k);
    }
  };
  find(kids);
  if (!img) return kids;
  const out: HtmlNode[] = [img];
  if (caption) out.push(caption);
  return [el('figure', cleanAttrs('figure', node.attrs, ctx), out), ...rest];
}

function sanitizeDiv(node: HtmlElement, ctx: Ctx): HtmlNode[] {
  if (node.attrs['data-type'] === 'callout') {
    const attrs = cleanAttrs('div', node.attrs, ctx);
    const ordered: Record<string, string> = { 'data-type': 'callout', 'data-tone': attrs['data-tone'] ?? 'info' };
    if (attrs['data-block-id'] !== undefined) ordered['data-block-id'] = attrs['data-block-id'];
    return [el('div', ordered, sanitizeChildren(node.children, child(ctx, 'div')))];
  }
  // A plain div is a paragraph when it holds only inline content, else unwrapped.
  if (ctx.parent === 'p' || HEADINGS.has(ctx.parent ?? '') || ctx.parent === 'summary' || ctx.parent === 'figcaption') return sanitizeChildren(node.children, ctx);
  const kids = sanitizeChildren(node.children, child(ctx, 'p'));
  if (hasBlockChild(kids) || kids.every(isWhitespace)) return kids;
  // A paragraph written as <div> (RichTextEditor `enterKey: 'div'`) keeps its paragraph attributes.
  return [el('p', cleanAttrs('p', node.attrs, ctx), kids)];
}

function sanitizeTable(node: HtmlElement, ctx: Ctx): HtmlNode[] {
  const fostered: HtmlNode[] = [];
  const rows: HtmlElement[] = [];
  const rowCtx = child(ctx, 'tr', null);
  const addRow = (tr: HtmlElement): void => {
    const cells: HtmlNode[] = [];
    for (const c of tr.children) {
      if (c.type === 'element' && (c.tag === 'td' || c.tag === 'th')) {
        cells.push(el(c.tag, cleanAttrs(c.tag, c.attrs, rowCtx), sanitizeChildren(c.children, child(ctx, c.tag, null))));
      } else if (c.type === 'element' && c.tag !== 'script') {
        pushAll(fostered, sanitizeElement(c, ctx));
      } else if (c.type === 'text' && !isWhitespace(c)) pushText(fostered, c.value);
    }
    if (cells.length) rows.push(el('tr', {}, cells));
  };
  const walk = (nodes: readonly HtmlNode[]): void => {
    for (const c of nodes) {
      if (c.type === 'element') {
        if (c.tag === 'tr') addRow(c);
        else if (c.tag === 'tbody' || c.tag === 'thead' || c.tag === 'tfoot') walk(c.children);
        else if (c.tag === 'td' || c.tag === 'th') addRow(el('tr', {}, [c]));
        else if (c.tag === 'caption') {
          const kids = sanitizeChildren(c.children, child(ctx, 'p'));
          if (kids.length) fostered.push(hasBlockChild(kids) ? el('div', {}, kids) : el('p', {}, kids));
        } else if (c.tag === 'colgroup' || c.tag === 'col') continue;
        else pushAll(fostered, sanitizeElement(c, ctx));
      } else if (c.type === 'text' && !isWhitespace(c)) pushText(fostered, c.value);
    }
  };
  walk(node.children);
  const flat = fostered.flatMap((n) => (n.type === 'element' && n.tag === 'div' && Object.keys(n.attrs).length === 0 ? n.children : [n]));
  if (rows.length === 0) return flat;
  return [...flat, el('table', cleanAttrs('table', node.attrs, ctx), [el('tbody', {}, rows)])];
}

// The hook pass: parents before children, restriction only.
function applyHook(nodes: HtmlNode[], hook: SanitizeHook, ctx: Ctx, changed: { structure: boolean }): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') {
      if (node.type === 'text') pushText(out, node.value);
      continue;
    }
    const view: SanitizeElement = Object.freeze({ tag: node.tag, attrs: Object.freeze({ ...node.attrs }), parent: ctx.parent });
    const result = hook(view);
    const list: Ctx['list'] = node.tag === 'ol' ? 'ol' : node.tag === 'ul' ? (node.attrs['data-type'] === 'checklist' ? 'checklist' : 'ul') : ctx.list;
    const inner = child(ctx, node.tag, list);
    if (result === null || result === 'remove') {
      changed.structure = true;
      continue;
    }
    if (result === 'unwrap') {
      changed.structure = true;
      pushAll(out, applyHook(node.children, hook, ctx, changed));
      continue;
    }
    let attrs = node.attrs;
    if (result !== undefined && result !== 'keep' && typeof result === 'object' && result.attrs) {
      const next: Record<string, string> = {};
      for (const name of Object.keys(result.attrs)) {
        if (!Object.prototype.hasOwnProperty.call(node.attrs, name)) continue;
        const value = result.attrs[name];
        if (typeof value !== 'string') continue;
        // Values the built-in rules produced unchanged are kept; others are re-validated.
        const v = value === node.attrs[name] ? value : name === 'style' && node.tag === 'span' ? reStyleSpan(value, node.attrs[name] as string) : cleanAttr(node.tag, name, value, ctx);
        if (v !== null) next[name] = v;
      }
      if (node.tag === 'a' && next.target === undefined) delete next.rel;
      if ((node.tag === 'a' && next.href === undefined) || (node.tag === 'img' && next.src === undefined) || ((node.tag === 'audio' || node.tag === 'video' || node.tag === 'iframe') && next.src === undefined)) {
        changed.structure = true;
        if (node.tag === 'a') pushAll(out, applyHook(node.children, hook, ctx, changed));
        continue;
      }
      if (node.tag === 'span' && Object.keys(next).length === 0) {
        pushAll(out, applyHook(node.children, hook, ctx, changed));
        continue;
      }
      attrs = next;
    }
    out.push(el(node.tag, attrs, applyHook(node.children, hook, inner, changed)));
  }
  return out;
}

// A hook may change a span's single style declaration only to another valid value of the same property.
function reStyleSpan(value: string, original: string): string | null {
  const prop = original.slice(0, original.indexOf(':'));
  const decl = parseStyle(value).get(prop);
  if (decl === undefined) return null;
  const v = prop === 'font-family' ? cleanFontFamily(decl) : prop === 'font-size' ? cleanFontSize(decl) : cleanColor(decl);
  return v === null ? null : `${prop}:${v}`;
}

/** Sanitizes a parsed tree (see {@link sanitizeHtml}); returns a new tree. */
export function sanitizeNodes(nodes: readonly HtmlNode[], options: SanitizeHtmlOptions = {}): HtmlNode[] {
  const ctx: Ctx = { parent: null, list: null, embedHosts: options.embedHosts ?? [], blockIds: options.blockIds !== false, allow: compileAllow(options.allow) };
  let out = sanitizeChildren(nodes, ctx);
  const hook = options.sanitize;
  if (hook) {
    const changed = { structure: false };
    out = applyHook(out, hook, ctx, changed);
    // Re-normalize after unwrapping or removing (the built-in pass is idempotent).
    if (changed.structure) out = sanitizeChildren(out, ctx);
  }
  return out;
}

/**
 * Sanitizes HTML against the shared vocabulary. Pure and
 * server-safe: no DOM, no globals, deterministic, linear in the input size.
 * `sanitizeHtml(sanitizeHtml(x)) === sanitizeHtml(x)`.
 */
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
  return serializeHtml(sanitizeNodes(parseHtml(html), options));
}
