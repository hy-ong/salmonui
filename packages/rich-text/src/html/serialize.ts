// HTML serializer for trees from parseHtml / sanitizeHtml.
// Text is always escaped (`&`, `<`, `>`, no-break space); attribute values
// are always double-quoted with `&`, `"`, `<`, `>` escaped. Only children of
// raw-text elements are written unescaped, and the sanitizer never keeps one.

import { RAW_TEXT_ELEMENTS, VOID_ELEMENTS, type HtmlNode } from './parse.js';

export interface SerializeHtmlOptions {
  /**
   * XHTML-compatible output (used by the editor's `getHtml({ xhtml: true })`):
   * void elements self-close (`<br />`), boolean attributes are written as
   * `name="name"` and `&nbsp;` as `&#160;`, so the result also parses as XML.
   */
  xhtml?: boolean;
}

const TEXT_ESCAPE = /[&<>\u00a0]/g;
const ATTR_ESCAPE = /[&<>"\u00a0]/g;
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\u00a0': '&nbsp;' };
const XML_ESCAPES: Readonly<Record<string, string>> = { ...ESCAPES, '\u00a0': '&#160;' };
const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set(['controls', 'allowfullscreen', 'open', 'checked', 'disabled', 'selected', 'hidden', 'muted', 'loop', 'autoplay', 'readonly', 'multiple', 'required', 'reversed']);
const VALID_ATTR_NAME = /^[^\t\n\f\r "'<>/=\0]+$/;
const VALID_TAG_NAME = /^[a-z][^\t\n\f\r />"'<=\0]*$/;

/** Escapes text for use as HTML element content. */
export function escapeHtml(text: string): string {
  return text.replace(TEXT_ESCAPE, (c) => ESCAPES[c] as string);
}

/** Escapes text for use inside a double-quoted HTML attribute value. */
export function escapeAttribute(text: string): string {
  return text.replace(ATTR_ESCAPE, (c) => ESCAPES[c] as string);
}

function write(nodes: readonly HtmlNode[], out: string[], xhtml: boolean, raw: boolean): void {
  const table = xhtml ? XML_ESCAPES : ESCAPES;
  for (const node of nodes) {
    if (node.type === 'text') {
      out.push(raw ? node.value : node.value.replace(TEXT_ESCAPE, (c) => table[c] as string));
      continue;
    }
    if (node.type === 'comment') {
      // A comment can never close early or open markup.
      out.push('<!--', node.value.replace(/--!?>|^-?>|-$/g, ''), '-->');
      continue;
    }
    const tag = node.tag;
    if (!VALID_TAG_NAME.test(tag)) {
      write(node.children, out, xhtml, raw);
      continue;
    }
    out.push('<', tag);
    for (const name of Object.keys(node.attrs)) {
      if (!VALID_ATTR_NAME.test(name)) continue;
      const value = node.attrs[name] as string;
      if (value === '' && BOOLEAN_ATTRIBUTES.has(name)) out.push(' ', name, xhtml ? `="${name}"` : '');
      else out.push(' ', name, '="', value.replace(ATTR_ESCAPE, (c) => table[c] as string), '"');
    }
    if (VOID_ELEMENTS.has(tag)) {
      out.push(xhtml ? ' />' : '>');
      continue;
    }
    out.push('>');
    if ((tag === 'pre' || tag === 'textarea' || tag === 'listing') && !xhtml) {
      const first = node.children[0];
      if (first && first.type === 'text' && first.value.startsWith('\n')) out.push('\n');
    }
    write(node.children, out, xhtml, RAW_TEXT_ELEMENTS.has(tag));
    out.push('</', tag, '>');
  }
}

/** Serializes a parsed (or sanitized) tree back to HTML. */
export function serializeHtml(nodes: readonly HtmlNode[], options: SerializeHtmlOptions = {}): string {
  const out: string[] = [];
  write(nodes, out, options.xhtml === true, false);
  return out.join('');
}
