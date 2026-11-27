// A tiny DOM-like tree for running ProseMirror's DOMParser without a browser
// (the headless engine parses HTML in Node, workers and tests). It
// only implements what prosemirror-model's parser reads: nodeType, nodeName,
// child and sibling links, getAttribute, style.getPropertyValue, matches()
// for `tag`, `tag[attr]` and `tag[attr="v"]` selectors, textContent and
// ownerDocument.createTextNode. The input is always sanitized markup.
import { parseHtml, type HtmlNode } from '../html/index.js';
import { parseStyle } from '../html/policy.js';

export { parseStyle };

type ShimNode = ShimElement | ShimText;

class ShimBase {
  parentNode: ShimElement | null = null;
  nextSibling: ShimNode | null = null;
  previousSibling: ShimNode | null = null;
  get ownerDocument(): typeof SHIM_DOCUMENT {
    return SHIM_DOCUMENT;
  }
}

class ShimText extends ShimBase {
  readonly nodeType = 3;
  readonly nodeName = '#text';
  constructor(public nodeValue: string) {
    super();
  }
  get textContent(): string {
    return this.nodeValue;
  }
}

class ShimElement extends ShimBase {
  readonly nodeType = 1;
  readonly nodeName: string;
  readonly childNodes: ShimNode[] = [];
  readonly attrs = new Map<string, string>();
  #style: { length: number; whiteSpace: string; getPropertyValue(name: string): string } | undefined;
  constructor(readonly localName: string) {
    super();
    this.nodeName = localName.toUpperCase();
  }
  get tagName(): string {
    return this.nodeName;
  }
  get firstChild(): ShimNode | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): ShimNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get children(): ShimElement[] {
    return this.childNodes.filter((n): n is ShimElement => n.nodeType === 1);
  }
  get textContent(): string {
    return this.childNodes.map((n) => n.textContent).join('');
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name.toLowerCase()) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name.toLowerCase());
  }
  get style() {
    if (!this.#style) {
      const map = parseStyle(this.getAttribute('style') ?? '');
      this.#style = { length: map.size, whiteSpace: map.get('white-space') ?? '', getPropertyValue: (name: string) => map.get(name) ?? '' };
    }
    return this.#style;
  }
  querySelector(selector: string): ShimElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const deep = child.querySelector(selector);
      if (deep) return deep;
    }
    return null;
  }
  matches(selector: string): boolean {
    return selector.split(',').some((one) => matchOne(this, one.trim()));
  }
  appendChild(node: ShimNode): void {
    const last = this.lastChild;
    node.parentNode = this;
    node.previousSibling = last;
    if (last) last.nextSibling = node;
    this.childNodes.push(node);
  }
}

function matchOne(el: ShimElement, selector: string): boolean {
  const m = /^([a-z0-9-]*)((?:\[[^\]]+\])*)$/i.exec(selector);
  if (!m) return false;
  if (m[1] && m[1].toLowerCase() !== el.localName) return false;
  for (const attr of (m[2] ?? '').matchAll(/\[([^\]=]+)(?:=["']?([^"'\]]*)["']?)?\]/g)) {
    const value = el.getAttribute(attr[1]!.trim());
    if (value === null || (attr[2] !== undefined && value !== attr[2])) return false;
  }
  return true;
}

const SHIM_DOCUMENT = {
  createTextNode: (text: string) => new ShimText(text),
  createElement: (tag: string) => new ShimElement(tag.toLowerCase()),
};

/** Builds a detached shim `<body>` from markup, with the sanitizer's HTML parser (no second tokenizer). */
export function parseShim(html: string): ShimElement {
  const root = new ShimElement('body');
  const build = (parent: ShimElement, nodes: readonly HtmlNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'text') parent.appendChild(new ShimText(n.value));
      else if (n.type === 'element') {
        const el = new ShimElement(n.tag);
        for (const [k, v] of Object.entries(n.attrs)) el.attrs.set(k, v);
        parent.appendChild(el);
        build(el, n.children);
      }
    }
  };
  build(root, parseHtml(html));
  return root;
}
