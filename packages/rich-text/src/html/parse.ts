// Server-safe HTML parser:
// a single linear pass that tokenizes and builds a fragment tree the way the
// HTML parser does for the cases real editor HTML relies on: void elements,
// implied end tags (p, li, dt, dd, td, th, tr, table sections, option,
// headings), character references, quoted and unquoted attributes, comments
// (including the abrupt `<!-->` and `--!>` forms), CDATA, doctype and bogus
// comments, and raw-text elements (script, style, xmp, iframe, noembed,
// noframes, noscript) and RCDATA elements (textarea, title). It has no DOM
// and no dependencies, so it runs on the server, in workers and in tests.
//
// It is not a full HTML5 tree builder (no adoption agency, no foster
// parenting, no foreign content): the sanitizer never relies on it matching
// a browser byte for byte, because the sanitized tree is re-serialized with
// every text and attribute escaped and no raw-text element survives, so the
// output means the same in every parser (no mutation XSS).

import { decodeEntities } from './entities.js';

/** An element of a parsed HTML fragment. Tag and attribute names are lowercase. */
export interface HtmlElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}

/** A text node; `value` is decoded text (never markup). */
export interface HtmlText {
  type: 'text';
  value: string;
}

/** A comment (`<!-- -->` or a bogus comment such as `<![if ...]>`). */
export interface HtmlComment {
  type: 'comment';
  value: string;
}

export type HtmlNode = HtmlElement | HtmlText | HtmlComment;

/** Elements without content or end tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'basefont', 'bgsound', 'frame', 'keygen',
]);

/** Raw-text elements: content is literal text up to the matching end tag. */
export const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
const RCDATA_ELEMENTS: ReadonlySet<string> = new Set(['textarea', 'title']);

// Start tags that close an open <p> in button scope.
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'listing',
  'search', 'section', 'summary', 'table', 'ul', 'xmp', 'plaintext',
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const DEFAULT_SCOPE = new Set(['applet', 'caption', 'html', 'table', 'td', 'th', 'marquee', 'object', 'template', 'svg', 'math']);
const BUTTON_SCOPE = new Set([...DEFAULT_SCOPE, 'button']);
const LIST_SCOPE = new Set([...DEFAULT_SCOPE, 'ul', 'ol']);
const TABLE_TAGS = new Set(['table', 'caption', 'colgroup', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th']);
const TABLE_SCOPE = new Set(['table', 'html', 'template']);

/** Nesting deeper than this is flattened (bounds every scope walk and the recursion depth). */
export const MAX_DEPTH = 256;

const WS = /[\t\n\f\r ]/;
const TAG_NAME = /[A-Za-z][^\t\n\f\r />]*/y;
const ATTR_NAME = /[^\t\n\f\r />][^\t\n\f\r />=]*/y;
const SKIP_WS = /[\t\n\f\r ]*/y;
const UNQUOTED = /[^\t\n\f\r >]*/y;

interface Builder {
  root: HtmlNode[];
  stack: HtmlElement[];
}

function children(b: Builder): HtmlNode[] {
  const top = b.stack[b.stack.length - 1];
  return top ? top.children : b.root;
}

function appendText(b: Builder, value: string): void {
  if (value === '') return;
  const list = children(b);
  const last = list[list.length - 1];
  if (last && last.type === 'text') last.value += value;
  else list.push({ type: 'text', value });
}

function inScope(b: Builder, tag: string, boundary: ReadonlySet<string>): number {
  for (let i = b.stack.length - 1; i >= 0; i--) {
    const t = (b.stack[i] as HtmlElement).tag;
    if (t === tag) return i;
    if (boundary.has(t)) return -1;
  }
  return -1;
}

function popTo(b: Builder, index: number): void {
  b.stack.length = index;
}

function closeListLike(b: Builder, tags: ReadonlySet<string>, boundary: ReadonlySet<string>): void {
  for (let i = b.stack.length - 1; i >= 0; i--) {
    const t = (b.stack[i] as HtmlElement).tag;
    if (tags.has(t)) {
      popTo(b, i);
      return;
    }
    if (boundary.has(t)) return;
  }
}

const LI = new Set(['li']);
const DD_DT = new Set(['dd', 'dt']);
const CELLS = new Set(['td', 'th']);
const ROWS = new Set(['tr']);
// "Special" elements (other than address, div, p) stop the implied </li>, </dd>, </dt>.
const SPECIAL = ['blockquote', 'details', 'dl', 'figure', 'fieldset', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'main', 'menu', 'center', 'summary', 'pre', ...HEADINGS];
const LI_BOUNDARY = new Set([...LIST_SCOPE, ...SPECIAL]);
const DD_BOUNDARY = new Set([...DEFAULT_SCOPE, 'ul', 'ol', ...SPECIAL]);
const CELL_BOUNDARY = new Set(['tr', 'table', 'tbody', 'thead', 'tfoot', 'html', 'template']);
const ROW_BOUNDARY = new Set(['table', 'tbody', 'thead', 'tfoot', 'html', 'template']);

function startTag(b: Builder, tag: string, attrs: Record<string, string>): HtmlElement {
  if (CLOSES_P.has(tag)) {
    const p = inScope(b, 'p', BUTTON_SCOPE);
    if (p >= 0) popTo(b, p);
  }
  if (tag === 'li') closeListLike(b, LI, LI_BOUNDARY);
  else if (tag === 'dd' || tag === 'dt') closeListLike(b, DD_DT, DD_BOUNDARY);
  else if (HEADINGS.has(tag)) {
    const top = b.stack[b.stack.length - 1];
    if (top && HEADINGS.has(top.tag)) b.stack.pop();
  } else if (tag === 'td' || tag === 'th') closeListLike(b, CELLS, CELL_BOUNDARY);
  else if (tag === 'tr') {
    closeListLike(b, CELLS, CELL_BOUNDARY);
    closeListLike(b, ROWS, ROW_BOUNDARY);
  } else if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot' || tag === 'caption' || tag === 'colgroup') {
    // Close every open section, row and cell of the current table.
    const t = inScope(b, 'table', TABLE_SCOPE);
    if (t >= 0) popTo(b, t + 1);
  }
  else if (tag === 'option' || tag === 'optgroup') {
    const top = b.stack[b.stack.length - 1];
    if (top && top.tag === 'option') b.stack.pop();
    if (tag === 'optgroup') {
      const next = b.stack[b.stack.length - 1];
      if (next && next.tag === 'optgroup') b.stack.pop();
    }
  } else if (tag === 'a') {
    const open = inScope(b, 'a', DEFAULT_SCOPE);
    if (open >= 0) popTo(b, open);
  }
  const el: HtmlElement = { type: 'element', tag, attrs, children: [] };
  children(b).push(el);
  return el;
}

function endTag(b: Builder, tag: string): void {
  if (tag === 'br') {
    startTag(b, 'br', {});
    return;
  }
  let boundary: ReadonlySet<string> = DEFAULT_SCOPE;
  if (tag === 'p') boundary = BUTTON_SCOPE;
  else if (tag === 'li') boundary = LIST_SCOPE;
  else if (TABLE_TAGS.has(tag)) boundary = TABLE_SCOPE;
  if (tag === 'table') boundary = new Set(['html', 'template']);
  if (HEADINGS.has(tag)) {
    // `</h2>` closes any open heading (HTML spec).
    for (let i = b.stack.length - 1; i >= 0; i--) {
      const t = (b.stack[i] as HtmlElement).tag;
      if (HEADINGS.has(t)) {
        popTo(b, i);
        return;
      }
      if (DEFAULT_SCOPE.has(t)) return;
    }
    return;
  }
  const index = inScope(b, tag, boundary);
  if (index >= 0) {
    popTo(b, index);
    return;
  }
  if (tag === 'p') {
    // A stray </p> inserts an empty paragraph, as browsers do.
    startTag(b, 'p', {});
  }
}

function parseAttributes(html: string, start: number, attrs: Record<string, string> | null): { end: number; selfClosing: boolean; complete: boolean } {
  let i = start;
  const n = html.length;
  for (;;) {
    SKIP_WS.lastIndex = i;
    SKIP_WS.test(html);
    i = SKIP_WS.lastIndex;
    if (i >= n) return { end: n, selfClosing: false, complete: false };
    const c = html.charCodeAt(i);
    if (c === 62 /* > */) return { end: i + 1, selfClosing: false, complete: true };
    if (c === 47 /* / */) {
      if (html.charCodeAt(i + 1) === 62) return { end: i + 2, selfClosing: true, complete: true };
      i++;
      continue;
    }
    ATTR_NAME.lastIndex = i;
    const m = ATTR_NAME.exec(html);
    // ATTR_NAME always matches here: the current char is not whitespace, '/' or '>'.
    const rawName = (m as RegExpExecArray)[0];
    i = ATTR_NAME.lastIndex;
    SKIP_WS.lastIndex = i;
    SKIP_WS.test(html);
    let j = SKIP_WS.lastIndex;
    let value = '';
    if (html.charCodeAt(j) === 61 /* = */) {
      j++;
      SKIP_WS.lastIndex = j;
      SKIP_WS.test(html);
      j = SKIP_WS.lastIndex;
      const q = html.charCodeAt(j);
      if (q === 34 || q === 39) {
        const close = html.indexOf(q === 34 ? '"' : "'", j + 1);
        if (close < 0) return { end: n, selfClosing: false, complete: false };
        value = html.slice(j + 1, close);
        i = close + 1;
      } else {
        UNQUOTED.lastIndex = j;
        UNQUOTED.test(html);
        value = html.slice(j, UNQUOTED.lastIndex);
        i = UNQUOTED.lastIndex;
      }
    }
    if (attrs) {
      const name = rawName.toLowerCase();
      // First occurrence wins; prototype keys are never attributes here.
      if (name !== '__proto__' && !Object.prototype.hasOwnProperty.call(attrs, name)) attrs[name] = decodeEntities(value.replace(/\0/g, '\ufffd'), true);
    }
  }
}

function findRawEnd(html: string, tag: string, from: number): number {
  const needle = '</' + tag;
  let at = from;
  for (;;) {
    const idx = indexOfCaseInsensitive(html, needle, at);
    if (idx < 0) return -1;
    const after = html.charAt(idx + needle.length);
    if (after === '' || after === '>' || after === '/' || WS.test(after)) return idx;
    at = idx + needle.length;
  }
}

function indexOfCaseInsensitive(html: string, needle: string, from: number): number {
  // needle is `</` + lowercase ascii name; search `</` then compare.
  let at = from;
  for (;;) {
    const idx = html.indexOf('</', at);
    if (idx < 0) return -1;
    if (html.slice(idx, idx + needle.length).toLowerCase() === needle) return idx;
    at = idx + 2;
  }
}

/**
 * Parses an HTML fragment into a tree. Never throws; malformed input yields
 * the closest well-formed tree. `<!DOCTYPE>` is skipped, CDATA becomes text.
 */
export function parseHtml(input: string): HtmlNode[] {
  const html = input.indexOf('\r') < 0 ? input : input.replace(/\r\n?/g, '\n');
  const b: Builder = { root: [], stack: [] };
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      appendText(b, decodeEntities(html.slice(i)));
      break;
    }
    if (lt > i) appendText(b, decodeEntities(html.slice(i, lt)));
    const c = html.charCodeAt(lt + 1);
    if (c === 33 /* ! */) {
      if (html.startsWith('<!--', lt)) {
        const body = lt + 4;
        if (html.charCodeAt(body) === 62) {
          children(b).push({ type: 'comment', value: '' });
          i = body + 1;
          continue;
        }
        if (html.startsWith('->', body)) {
          children(b).push({ type: 'comment', value: '' });
          i = body + 2;
          continue;
        }
        const a = html.indexOf('-->', body);
        const bang = html.indexOf('--!>', body);
        let end = a;
        let len = 3;
        if (bang >= 0 && (a < 0 || bang < a)) {
          end = bang;
          len = 4;
        }
        if (end < 0) {
          children(b).push({ type: 'comment', value: html.slice(body) });
          break;
        }
        children(b).push({ type: 'comment', value: html.slice(body, end) });
        i = end + len;
        continue;
      }
      if (html.startsWith('<![CDATA[', lt)) {
        const end = html.indexOf(']]>', lt + 9);
        appendText(b, html.slice(lt + 9, end < 0 ? n : end));
        i = end < 0 ? n : end + 3;
        continue;
      }
      const end = html.indexOf('>', lt + 2);
      const value = html.slice(lt + 2, end < 0 ? n : end);
      if (!/^doctype/i.test(value)) children(b).push({ type: 'comment', value });
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (c === 47 /* / */) {
      TAG_NAME.lastIndex = lt + 2;
      const m = TAG_NAME.exec(html);
      if (!m) {
        if (html.charCodeAt(lt + 2) === 62) {
          i = lt + 3;
          continue;
        }
        if (lt + 2 >= n) {
          appendText(b, '</');
          break;
        }
        const end = html.indexOf('>', lt + 2);
        children(b).push({ type: 'comment', value: html.slice(lt + 2, end < 0 ? n : end) });
        i = end < 0 ? n : end + 1;
        continue;
      }
      const parsed = parseAttributes(html, TAG_NAME.lastIndex, null);
      if (!parsed.complete) break;
      endTag(b, m[0].toLowerCase());
      i = parsed.end;
      continue;
    }
    if (c === 63 /* ? */) {
      const end = html.indexOf('>', lt + 2);
      children(b).push({ type: 'comment', value: html.slice(lt + 1, end < 0 ? n : end) });
      i = end < 0 ? n : end + 1;
      continue;
    }
    TAG_NAME.lastIndex = lt + 1;
    const m = TAG_NAME.exec(html);
    if (!m) {
      appendText(b, '<');
      i = lt + 1;
      continue;
    }
    const tag = m[0].toLowerCase();
    const attrs: Record<string, string> = {};
    const parsed = parseAttributes(html, TAG_NAME.lastIndex, attrs);
    // A tag cut off by the end of input is dropped, as browsers do.
    if (!parsed.complete) break;
    i = parsed.end;
    if (b.stack.length >= MAX_DEPTH && !VOID_ELEMENTS.has(tag)) {
      // Too deep: keep the content, drop the element (bounds every walk).
      if (RAW_TEXT_ELEMENTS.has(tag) || RCDATA_ELEMENTS.has(tag)) {
        const end = findRawEnd(html, tag, i);
        i = end < 0 ? n : end;
      }
      continue;
    }
    const el = startTag(b, tag, attrs);
    if (VOID_ELEMENTS.has(tag)) continue;
    if (tag === 'plaintext') {
      el.children.push({ type: 'text', value: html.slice(i) });
      break;
    }
    if (RAW_TEXT_ELEMENTS.has(tag) || RCDATA_ELEMENTS.has(tag)) {
      const end = findRawEnd(html, tag, i);
      let text = html.slice(i, end < 0 ? n : end);
      if (RCDATA_ELEMENTS.has(tag)) text = decodeEntities(text);
      if (tag === 'textarea' && text.startsWith('\n')) text = text.slice(1);
      if (text) el.children.push({ type: 'text', value: text });
      if (end < 0) break;
      const close = html.indexOf('>', end);
      i = close < 0 ? n : close + 1;
      continue;
    }
    if ((tag === 'pre' || tag === 'listing') && html.charCodeAt(i) === 10) i++;
    b.stack.push(el);
  }
  return b.root;
}
