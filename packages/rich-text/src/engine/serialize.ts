// Document -> HTML string without a DOM (`getHtml({ xhtml })`): walks
// the array specs every schema toDOM returns. Text is always escaped.
import type { DOMOutputSpec, Fragment, Mark, Node as PMNode } from 'prosemirror-model';

const VOID = new Set(['br', 'hr', 'img', 'input', 'col', 'source', 'wbr']);
const BOOL = new Set(['controls', 'allowfullscreen', 'open']);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

export interface SerializeOptions {
  /** Self-closing void tags and explicit boolean attribute values (XHTML). */
  readonly xhtml?: boolean | undefined;
  /** Element written for paragraphs (default `'p'`). */
  readonly paragraphTag?: 'p' | 'div' | undefined;
}

type Hole = (out: string[]) => void;

function render(spec: DOMOutputSpec, hole: Hole | null, xhtml: boolean, out: string[]): void {
  if (typeof spec === 'string') {
    out.push(escapeHtml(spec));
    return;
  }
  if (!Array.isArray(spec)) {
    // An extension returned a DOM node: use its markup when a DOM exists.
    const dom = (spec as { dom?: unknown }).dom ?? spec;
    if (dom && typeof (dom as Element).outerHTML === 'string') out.push((dom as Element).outerHTML);
    return;
  }
  const [tag, ...rest] = spec as [string, ...unknown[]];
  const name = tag.includes(' ') ? tag.slice(tag.indexOf(' ') + 1) : tag;
  let start = 0;
  let attrs = '';
  const first = rest[0];
  if (first && typeof first === 'object' && !Array.isArray(first) && !('nodeType' in (first as object))) {
    start = 1;
    for (const [key, value] of Object.entries(first as Record<string, unknown>)) {
      if (value == null) continue;
      if (BOOL.has(key) && value === '') attrs += xhtml ? ` ${key}="${key}"` : ` ${key}`;
      else attrs += ` ${key}="${escapeHtml(String(value))}"`;
    }
  }
  if (VOID.has(name)) {
    out.push(`<${name}${attrs}${xhtml ? ' />' : '>'}`);
    return;
  }
  // An empty figcaption is optional in the vocabulary.
  const mark = out.length;
  out.push(`<${name}${attrs}>`);
  const before = out.length;
  for (let i = start; i < rest.length; i++) {
    const child = rest[i];
    if (child === 0) hole?.(out);
    else render(child as DOMOutputSpec, hole, xhtml, out);
  }
  if (name === 'figcaption' && out.length === before) {
    out.length = mark;
    return;
  }
  out.push(`</${name}>`);
}

let paragraphTag = 'p';

function inline(fragment: Fragment, xhtml: boolean, out: string[]): void {
  // Marks open and close around runs; keep shared outer marks open.
  const open: Mark[] = [];
  const closers: string[] = [];
  const closeTo = (depth: number) => {
    while (open.length > depth) {
      open.pop();
      out.push(closers.pop()!);
    }
  };
  fragment.forEach((child) => {
    const marks = child.marks;
    let keep = 0;
    while (keep < open.length && keep < marks.length && open[keep]!.eq(marks[keep]!)) keep++;
    closeTo(keep);
    for (let i = keep; i < marks.length; i++) {
      const markSpec = marks[i]!.type.spec.toDOM?.(marks[i]!, true) ?? ['span', 0];
      const parts: string[] = [];
      render(markSpec, () => parts.push('\u0000'), xhtml, parts);
      const joined = parts.join('');
      const cut = joined.indexOf('\u0000');
      out.push(joined.slice(0, cut));
      closers.push(joined.slice(cut + 1));
      open.push(marks[i]!);
    }
    if (child.isText) out.push(escapeHtml(child.text ?? ''));
    else node(child, xhtml, out);
  });
  closeTo(0);
}

function node(n: PMNode, xhtml: boolean, out: string[]): void {
  const toDOM = n.type.spec.toDOM;
  if (!toDOM) {
    content(n, xhtml, out);
    return;
  }
  const spec = toDOM(n);
  const own = n.type.name === 'paragraph' && paragraphTag !== 'p' && Array.isArray(spec) ? [paragraphTag, ...(spec as unknown[]).slice(1)] : spec;
  render(own as DOMOutputSpec, (o) => content(n, xhtml, o), xhtml, out);
}

function content(n: PMNode, xhtml: boolean, out: string[]): void {
  if (n.inlineContent) inline(n.content, xhtml, out);
  else n.content.forEach((child) => node(child, xhtml, out));
}

/** The document's HTML. */
export function serializeHtml(doc: PMNode | Fragment, options: SerializeOptions = {}): string {
  const out: string[] = [];
  const xhtml = options.xhtml === true;
  paragraphTag = options.paragraphTag ?? 'p';
  const fragment = 'content' in doc && 'type' in doc ? (doc as PMNode).content : (doc as Fragment);
  fragment.forEach((child) => node(child, xhtml, out));
  paragraphTag = 'p';
  return out.join('');
}

/** Plain text: blocks separated by newlines, inline atoms by their text. */
export function serializeText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, '\n', (leaf) => leaf.type.spec.leafText?.(leaf) ?? '');
}
