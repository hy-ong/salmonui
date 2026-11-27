// Paste cleanup.
// Server-safe and DOM-free: the editors call it from their paste handler and
// it can run anywhere else (import pipelines, tests).
//
// Flow in the editors: on paste, `pasteNeedsPrompt(html, options)` tells
// whether `mode: 'prompt'` has to ask the user (the editor shows its
// keep / clean / plain text dialog); the editor then calls `cleanPastedHtml`
// with the chosen mode. `cleanPastedHtml` never asks: given `'prompt'` it
// behaves as `'clean'`. Every mode ends in `sanitizeHtml`, so no mode, option
// or hook can let unsafe markup through.

import { parseHtml, type HtmlElement, type HtmlNode } from './parse.js';
import { serializeHtml } from './serialize.js';
import { sanitizeNodes, type SanitizeHook, type SanitizeHookResult } from './sanitize.js';
import type { SanitizeAllow } from './policy.js';
import { parseStyle } from './policy.js';
import { htmlToText, plainTextToHtml } from './text.js';

/** How pasted HTML is treated. `'prompt'` asks the user each time (see {@link pasteNeedsPrompt}). */
export type PasteCleanupMode = 'keep' | 'clean' | 'plainText' | 'prompt';
/** A mode the user (or configuration) has decided on. */
export type ResolvedPasteCleanupMode = Exclude<PasteCleanupMode, 'prompt'>;
/** Where pasted HTML comes from, as {@link detectPasteSource} sees it. */
export type PasteSource = 'word' | 'googleDocs' | 'html';

export interface PasteCleanupOptions {
  /**
   * `'keep'`: keep all formatting the vocabulary allows (fonts, sizes,
   * colors, alignment); `'clean'` (default): keep structure, marks and links,
   * drop presentational styles; `'plainText'`: text only, paragraphs and line
   * breaks kept; `'prompt'`: the editor asks; here it behaves as `'clean'`.
   */
  mode?: PasteCleanupMode;
  /** Only these elements survive (others are unwrapped, text kept). Vocabulary names (`strong`, not `b`). */
  allowedTags?: readonly string[];
  /** These elements are unwrapped (text kept). */
  deniedTags?: readonly string[];
  /** Only these attributes survive (`style` counts as one). */
  allowedAttributes?: readonly string[];
  /** These attributes are removed. */
  deniedAttributes?: readonly string[];
  /** In `'clean'` mode, keep the inline formatting of Word and Google Docs content. Default false. */
  keepWordFormatting?: boolean;
  /** Passed to the sanitizer (see `SanitizeHtmlOptions`). */
  embedHosts?: readonly string[];
  /** Passed to the sanitizer, after the paste filters. */
  sanitize?: SanitizeHook;
  /** Passed to the sanitizer: extension elements and attributes. */
  allow?: SanitizeAllow | readonly SanitizeAllow[];
}

const TAG_ALIASES: Readonly<Record<string, string>> = { b: 'strong', i: 'em', del: 's', strike: 's', ins: 'u' };

/** Detects Word (desktop and online) and Google Docs clipboard HTML. */
export function detectPasteSource(html: string): PasteSource {
  if (/id=["']?docs-internal-guid-/i.test(html)) return 'googleDocs';
  if (/urn:schemas-microsoft-com:office|class=["']?Mso|mso-[a-z-]+\s*:|<o:p\b|<w:WordDocument|ProgId\s+content=["']?Word/i.test(html)) return 'word';
  return 'html';
}

/** Whether `mode: 'prompt'` needs to ask for this paste (formatted HTML; plain text never asks). */
export function pasteNeedsPrompt(html: string, options: Pick<PasteCleanupOptions, 'mode'> = {}): boolean {
  return options.mode === 'prompt' && /<[a-z][^>]*>/i.test(html);
}

// ---- Word ---------------------------------------------------------------

const MSO_LIST = /mso-list:\s*(l\d+)\s+level(\d+)/i;

function styleOf(node: HtmlElement): string {
  return node.attrs.style ?? '';
}

function isMsoIgnore(node: HtmlNode): boolean {
  return node.type === 'element' && /mso-list:\s*ignore/i.test(styleOf(node));
}

function textContent(nodes: readonly HtmlNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'element') out += textContent(n.children);
  }
  return out;
}

/** Removes and returns the list marker of a Word list paragraph. */
function takeMarker(nodes: HtmlNode[]): { marker: string; rest: HtmlNode[] } {
  let marker = '';
  const rest: HtmlNode[] = [];
  let skipping = false;
  const visit = (list: readonly HtmlNode[], into: HtmlNode[]): void => {
    for (const n of list) {
      if (n.type === 'comment') {
        if (/^\[if !supportLists\]/i.test(n.value)) skipping = true;
        else if (/^\[endif\]/i.test(n.value)) skipping = false;
        continue;
      }
      if (skipping) {
        marker += textContent([n]);
        continue;
      }
      if (isMsoIgnore(n)) {
        marker += textContent([n]);
        continue;
      }
      if (n.type === 'element') {
        const kids: HtmlNode[] = [];
        visit(n.children, kids);
        into.push({ ...n, children: kids });
      } else into.push(n);
    }
  };
  visit(nodes, rest);
  return { marker: marker.replace(/[\s\u00a0]+/g, ' ').trim(), rest };
}

interface ListKind {
  tag: 'ul' | 'ol';
  style: string | null;
  start: number | null;
}

const ROMAN: Readonly<Record<string, number>> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

function romanValue(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s.charAt(i)] ?? 0;
    const next = ROMAN[s.charAt(i + 1)] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

function listKind(marker: string): ListKind {
  const m = /^\(?([0-9]+|[a-z]+|[A-Z]+)[.)]$/.exec(marker);
  if (!m) return { tag: 'ul', style: null, start: null };
  const v = m[1] as string;
  if (/^[0-9]+$/.test(v)) return { tag: 'ol', style: null, start: Number.parseInt(v, 10) };
  if (/^[ivx]+$/.test(v)) return { tag: 'ol', style: 'lower-roman', start: romanValue(v) };
  if (/^[IVX]+$/.test(v)) return { tag: 'ol', style: 'upper-roman', start: romanValue(v.toLowerCase()) };
  if (v.length === 1 && /[a-z]/.test(v)) return { tag: 'ol', style: 'lower-alpha', start: v.charCodeAt(0) - 96 };
  if (v.length === 1 && /[A-Z]/.test(v)) return { tag: 'ol', style: 'upper-alpha', start: v.charCodeAt(0) - 64 };
  return { tag: 'ul', style: null, start: null };
}

function newList(kind: ListKind): HtmlElement {
  const attrs: Record<string, string> = {};
  if (kind.tag === 'ol' && kind.start !== null && kind.start !== 1) attrs.start = String(kind.start);
  if (kind.style) attrs.style = `list-style-type:${kind.style}`;
  return { type: 'element', tag: kind.tag, attrs, children: [] };
}

function isWordListParagraph(n: HtmlNode): boolean {
  return n.type === 'element' && (n.tag === 'p' || /^h[1-6]$/.test(n.tag)) && MSO_LIST.test(styleOf(n)) && !isMsoIgnore(n);
}

/** Turns runs of Word list paragraphs (MsoListParagraph*, mso-list levels) into nested lists. */
function wordLists(nodes: readonly HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i] as HtmlNode;
    if (!isWordListParagraph(n)) {
      if (n.type === 'element') out.push({ ...n, children: wordLists(n.children) });
      else out.push(n);
      i++;
      continue;
    }
    // A run of list paragraphs, allowing whitespace and comments between them.
    const stack: { level: number; list: HtmlElement; tag: string; listId: string }[] = [];
    while (i < nodes.length) {
      const p = nodes[i] as HtmlNode;
      if (!isWordListParagraph(p)) {
        if ((p.type === 'text' && p.value.trim() === '') || p.type === 'comment') {
          let j = i + 1;
          while (j < nodes.length) {
            const q = nodes[j] as HtmlNode;
            if (!((q.type === 'text' && q.value.trim() === '') || q.type === 'comment')) break;
            j++;
          }
          if (j < nodes.length && isWordListParagraph(nodes[j] as HtmlNode)) {
            i = j;
            continue;
          }
        }
        break;
      }
      if (p.type !== 'element') break;
      const mso = MSO_LIST.exec(styleOf(p)) as RegExpExecArray;
      const listId = (mso[1] as string).toLowerCase();
      const level = Number.parseInt(mso[2] as string, 10);
      const { marker, rest } = takeMarker(p.children);
      const kind = listKind(marker);
      while (stack.length && (stack[stack.length - 1] as { level: number }).level > level) stack.pop();
      let top = stack[stack.length - 1];
      if (top && top.level === level && (top.tag !== kind.tag || top.listId !== listId)) {
        stack.pop();
        const list = newList(kind);
        const parent = stack[stack.length - 1];
        if (parent) lastItem(parent.list).children.push(list);
        else out.push(list);
        top = { level, list, tag: kind.tag, listId };
        stack.push(top);
      } else if (!top || top.level < level) {
        const list = newList(kind);
        if (top) lastItem(top.list).children.push(list);
        else out.push(list);
        top = { level, list, tag: kind.tag, listId };
        stack.push(top);
      }
      top.list.children.push({ type: 'element', tag: 'li', attrs: {}, children: [{ type: 'element', tag: 'p', attrs: {}, children: wordLists(rest) }] });
      i++;
    }
  }
  return out;
}

function lastItem(list: HtmlElement): HtmlElement {
  const last = list.children[list.children.length - 1];
  if (last && last.type === 'element' && last.tag === 'li') return last;
  const li: HtmlElement = { type: 'element', tag: 'li', attrs: {}, children: [] };
  list.children.push(li);
  return li;
}

/** Drops Word-only content: conditional-comment blocks, mso-list markers, VML, Office namespaces. */
function wordCleanup(nodes: readonly HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  let skipping = false;
  for (const n of nodes) {
    if (n.type === 'comment') {
      if (/^\[if !supportLists\]/i.test(n.value)) skipping = true;
      else if (/^\[endif\]/i.test(n.value)) skipping = false;
      continue;
    }
    if (skipping || isMsoIgnore(n)) continue;
    if (n.type === 'element') {
      if (/^(?:v|w|xml|m):/.test(n.tag) || n.tag === 'xml') continue;
      out.push({ ...n, children: wordCleanup(n.children) });
    } else out.push(n);
  }
  return out;
}

// ---- Google Docs ----------------------------------------------------------

function googleDocs(nodes: readonly HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const n of nodes) {
    if (n.type !== 'element') {
      out.push(n);
      continue;
    }
    // The `<b id="docs-internal-guid-...">` wrapper is not bold.
    if (n.tag === 'b' && /^docs-internal-guid-/.test(n.attrs.id ?? '')) {
      out.push(...googleDocs(n.children));
      continue;
    }
    // Checklists: <ul> whose items are role="checkbox".
    if (n.tag === 'ul' && n.children.some((c) => c.type === 'element' && c.tag === 'li' && c.attrs.role === 'checkbox')) {
      out.push({
        ...n,
        attrs: { ...n.attrs, 'data-type': 'checklist' },
        children: googleDocs(n.children).map((c) => (c.type === 'element' && c.tag === 'li' ? { ...c, attrs: { ...c.attrs, 'data-checked': c.attrs['aria-checked'] === 'true' ? 'true' : 'false' } } : c)),
      });
      continue;
    }
    out.push({ ...n, children: googleDocs(n.children) });
  }
  return out;
}

// ---- shared -------------------------------------------------------------

const MARK_STYLES = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'vertical-align'];

/** 'clean' mode: drop presentational styles, keep the ones that mean marks. */
function stripFormatting(nodes: readonly HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const n of nodes) {
    if (n.type !== 'element') {
      out.push(n);
      continue;
    }
    const children = stripFormatting(n.children);
    if (n.tag === 'mark') {
      out.push(...children);
      continue;
    }
    const attrs = { ...n.attrs };
    if (n.tag === 'font') {
      delete attrs.color;
      delete attrs.face;
      delete attrs.size;
    }
    if (attrs.style !== undefined) {
      if (n.tag === 'span' || n.tag === 'font' || n.tag === 'b' || n.tag === 'strong' || n.tag === 'i' || n.tag === 'em') {
        const decls = parseStyle(attrs.style);
        const kept = MARK_STYLES.filter((p) => decls.has(p)).map((p) => `${p}:${decls.get(p) as string}`);
        if (kept.length) attrs.style = kept.join(';');
        else delete attrs.style;
      } else if (n.tag !== 'ul' && n.tag !== 'ol') delete attrs.style;
    }
    out.push({ ...n, attrs, children });
  }
  return out;
}

/** Link text styling (blue, underlined) from office suites is not an underline mark. */
function linkStyling(nodes: readonly HtmlNode[], inLink: boolean): HtmlNode[] {
  return nodes.map((n) => {
    if (n.type !== 'element') return n;
    const link = inLink || n.tag === 'a';
    let attrs = n.attrs;
    if (inLink && n.tag === 'span' && attrs.style) {
      const decls = parseStyle(attrs.style);
      decls.delete('text-decoration');
      decls.delete('text-decoration-line');
      decls.delete('color');
      attrs = { ...attrs, style: [...decls].map(([k, v]) => `${k}:${v}`).join(';') };
    }
    if (inLink && n.tag === 'u') return { ...n, tag: 'span', attrs: {}, children: linkStyling(n.children, link) };
    return { ...n, attrs, children: linkStyling(n.children, link) };
  });
}

function filterHook(options: PasteCleanupOptions): SanitizeHook | undefined {
  const norm = (list: readonly string[] | undefined): Set<string> | null => (list ? new Set(list.map((t) => TAG_ALIASES[t.toLowerCase()] ?? t.toLowerCase())) : null);
  const allowedTags = norm(options.allowedTags);
  const deniedTags = norm(options.deniedTags);
  const allowedAttrs = options.allowedAttributes ? new Set(options.allowedAttributes.map((a) => a.toLowerCase())) : null;
  const deniedAttrs = options.deniedAttributes ? new Set(options.deniedAttributes.map((a) => a.toLowerCase())) : null;
  const user = options.sanitize;
  if (!allowedTags && !deniedTags && !allowedAttrs && !deniedAttrs && !user) return undefined;
  return (element): SanitizeHookResult => {
    if ((allowedTags && !allowedTags.has(element.tag)) || deniedTags?.has(element.tag)) return 'unwrap';
    let result: SanitizeHookResult = undefined;
    if (allowedAttrs || deniedAttrs) {
      const attrs: Record<string, string> = {};
      let changed = false;
      for (const name of Object.keys(element.attrs)) {
        if ((allowedAttrs && !allowedAttrs.has(name)) || deniedAttrs?.has(name)) {
          changed = true;
          continue;
        }
        attrs[name] = element.attrs[name] as string;
      }
      if (changed) result = { attrs };
    }
    if (!user) return result;
    const view = result && typeof result === 'object' ? { ...element, attrs: Object.freeze(result.attrs) } : element;
    const next = user(view);
    return next === undefined || next === 'keep' ? result : next;
  };
}

/**
 * Cleans clipboard HTML for the editors: Word (mso styles,
 * `o:p`, conditional comments, MsoListParagraph runs into real nested lists
 * from the mso-list levels, `class="Mso*"`), Google Docs (the
 * `docs-internal-guid` wrapper, styled spans into marks, flat nested lists,
 * checklists), then the mode, the tag and attribute filters, and always the
 * sanitizer. Returns HTML in the shared vocabulary.
 */
export function cleanPastedHtml(html: string, options: PasteCleanupOptions = {}): string {
  const mode: ResolvedPasteCleanupMode = options.mode === 'keep' || options.mode === 'plainText' ? options.mode : 'clean';
  const source = detectPasteSource(html);
  // Clipboard HTML often wraps the selection in StartFragment / EndFragment comments; take the inside.
  const start = html.indexOf('<!--StartFragment-->');
  const end = html.lastIndexOf('<!--EndFragment-->');
  const fragment = start >= 0 && end > start ? html.slice(start + 20, end) : html;
  let nodes = parseHtml(fragment);
  if (source === 'word') nodes = wordCleanup(wordLists(nodes));
  else if (source === 'googleDocs') nodes = googleDocs(nodes);
  nodes = linkStyling(nodes, false);
  if (mode === 'plainText') {
    const text = htmlToText(serializeHtml(nodes), { blockSeparator: '\n\n' });
    return plainTextToHtml(text);
  }
  if (mode === 'clean' && !(options.keepWordFormatting && source !== 'html')) nodes = stripFormatting(nodes);
  const hook = filterHook(options);
  const sanitized = sanitizeNodes(nodes, {
    ...(options.embedHosts ? { embedHosts: options.embedHosts } : {}),
    ...(hook ? { sanitize: hook } : {}),
    ...(options.allow ? { allow: options.allow } : {}),
    blockIds: false,
  });
  // Whitespace between top-level blocks carries nothing.
  return serializeHtml(sanitized.filter((n) => !(n.type === 'text' && /^[\t\n\f\r ]*$/.test(n.value))));
}
