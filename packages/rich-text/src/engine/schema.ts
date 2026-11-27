// The ProseMirror schema of the rich text family. RichTextEditor and BlockEditor share it; the
// sanitizer in ../html allows exactly this vocabulary. Every toDOM returns an
// array spec so ./serialize.ts can write HTML without a DOM.
import { Schema, type AttributeSpec, type DOMOutputSpec, type MarkSpec, type Node as PMNode, type NodeSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { parseStyle } from '../html/policy.js';

type DomLike = { getAttribute(name: string): string | null; textContent: string | null };
const style = (dom: DomLike) => parseStyle(dom.getAttribute('style') ?? '');
const int = (value: string | null, fallback: number | null = null): number | null => {
  const n = value === null ? NaN : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const ALIGN = new Set(['left', 'center', 'right', 'justify']);
const LINE_HEIGHT = /^(?:\d+(?:\.\d+)?%?)$/;
const BULLET = new Set(['disc', 'circle', 'square']);
const ORDERED = new Set(['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman']);
const TONES = new Set(['info', 'success', 'warning', 'danger', 'neutral']);

const blockId: Record<string, AttributeSpec> = { blockId: { default: null } };
const textAttrs: Record<string, AttributeSpec> = { textAlign: { default: null }, lineHeight: { default: null }, indent: { default: 0 }, ...blockId };

function readId(dom: DomLike): { blockId: string | null } {
  return { blockId: dom.getAttribute('data-block-id') };
}

function readText(dom: DomLike) {
  const s = style(dom);
  const align = s.get('text-align') ?? null;
  const lh = s.get('line-height') ?? null;
  const indent = int(dom.getAttribute('data-indent'), 0)!;
  return { textAlign: align && ALIGN.has(align) ? align : null, lineHeight: lh && LINE_HEIGHT.test(lh) ? lh : null, indent: Math.max(0, Math.min(8, indent)), ...readId(dom) };
}

function idAttrs(node: PMNode): Record<string, string> {
  return node.attrs['blockId'] ? { 'data-block-id': String(node.attrs['blockId']) } : {};
}

function textDom(node: PMNode): Record<string, string> {
  const out: Record<string, string> = {};
  const styles: string[] = [];
  if (node.attrs['textAlign']) styles.push(`text-align:${node.attrs['textAlign']}`);
  if (node.attrs['lineHeight']) styles.push(`line-height:${node.attrs['lineHeight']}`);
  if (styles.length) out['style'] = styles.join(';');
  if (node.attrs['indent']) out['data-indent'] = String(node.attrs['indent']);
  return { ...out, ...idAttrs(node) };
}

/** Options the schema depends on. */
export interface SchemaOptions {
  /** Hosts whose `<iframe>` embeds survive parsing (default none). */
  readonly embedHosts?: readonly string[] | undefined;
  readonly nodes?: Readonly<Record<string, NodeSpec>> | undefined;
  readonly marks?: Readonly<Record<string, MarkSpec>> | undefined;
}

export function hostAllowed(src: string | null, hosts: readonly string[]): boolean {
  if (!src) return false;
  const m = /^https?:\/\/([^/?#:]+)/i.exec(src);
  if (!m) return false;
  const host = m[1]!.toLowerCase();
  return hosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
}

function media(tag: 'audio' | 'video'): NodeSpec {
  return {
    group: 'block',
    atom: true,
    attrs: { src: { default: '' }, width: { default: null }, height: { default: null }, ...blockId },
    parseDOM: [{ tag, getAttrs: (dom) => ({ src: dom.getAttribute('src') ?? dom.querySelector('source')?.getAttribute('src') ?? '', width: int(dom.getAttribute('width')), height: int(dom.getAttribute('height')), ...readId(dom) }) }],
    toDOM: (node) => {
      const attrs: Record<string, string> = { controls: '', src: node.attrs['src'] };
      if (tag === 'video' && node.attrs['width'] != null) attrs['width'] = String(node.attrs['width']);
      if (tag === 'video' && node.attrs['height'] != null) attrs['height'] = String(node.attrs['height']);
      return [tag, { ...attrs, ...idAttrs(node) }];
    },
  };
}

export function createSchema(options: SchemaOptions = {}): Schema {
  const hosts = options.embedHosts ?? [];
  const tables = tableNodes({
    tableGroup: 'block',
    cellContent: 'block+',
    cellAttributes: {},
  });
  const nodes: Record<string, NodeSpec> = {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: textAttrs,
      parseDOM: [{ tag: 'p', getAttrs: readText }],
      toDOM: (node) => ['p', textDom(node), 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      defining: true,
      attrs: { level: { default: 1 }, ...textAttrs },
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, getAttrs: (dom: HTMLElement) => ({ level, ...readText(dom) }) })),
      toDOM: (node) => [`h${node.attrs['level']}`, textDom(node), 0],
    },
    blockquote: {
      group: 'block',
      content: 'block+',
      defining: true,
      attrs: blockId,
      parseDOM: [{ tag: 'blockquote', getAttrs: readId }],
      toDOM: (node) => ['blockquote', idAttrs(node), 0],
    },
    horizontal_rule: {
      group: 'block',
      attrs: blockId,
      parseDOM: [{ tag: 'hr', getAttrs: readId }],
      toDOM: (node) => ['hr', idAttrs(node)],
    },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: { language: { default: null }, ...blockId },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (dom) => {
            const code = dom.querySelector('code');
            const lang = /(?:^|\s)language-([\w+#-]+)/.exec(code?.getAttribute('class') ?? '')?.[1] ?? null;
            return { language: lang, ...readId(dom) };
          },
          contentElement: (dom) => (dom as HTMLElement).querySelector('code') ?? (dom as HTMLElement),
        },
      ],
      toDOM: (node) => ['pre', idAttrs(node), ['code', node.attrs['language'] ? { class: `language-${node.attrs['language']}` } : {}, 0]],
    },
    bullet_list: {
      group: 'block',
      content: 'list_item+',
      attrs: { listStyle: { default: null }, ...blockId },
      parseDOM: [{ tag: 'ul', getAttrs: (dom) => (dom.getAttribute('data-type') === 'checklist' ? false : { listStyle: pick(style(dom).get('list-style-type'), BULLET), ...readId(dom) }) }],
      toDOM: (node) => ['ul', { ...(node.attrs['listStyle'] ? { style: `list-style-type:${node.attrs['listStyle']}` } : {}), ...idAttrs(node) }, 0],
    },
    ordered_list: {
      group: 'block',
      content: 'list_item+',
      attrs: { start: { default: 1 }, listStyle: { default: null }, ...blockId },
      parseDOM: [{ tag: 'ol', getAttrs: (dom) => ({ start: int(dom.getAttribute('start'), 1), listStyle: pick(style(dom).get('list-style-type'), ORDERED), ...readId(dom) }) }],
      toDOM: (node) => {
        const attrs: Record<string, string> = {};
        if (node.attrs['start'] !== 1) attrs['start'] = String(node.attrs['start']);
        if (node.attrs['listStyle']) attrs['style'] = `list-style-type:${node.attrs['listStyle']}`;
        return ['ol', { ...attrs, ...idAttrs(node) }, 0];
      },
    },
    list_item: {
      content: 'paragraph block*',
      defining: true,
      attrs: blockId,
      parseDOM: [{ tag: 'li', getAttrs: (dom) => (dom.hasAttribute('data-checked') ? false : readId(dom)) }],
      toDOM: (node) => ['li', idAttrs(node), 0],
    },
    task_list: {
      group: 'block',
      content: 'task_item+',
      attrs: blockId,
      parseDOM: [{ tag: 'ul[data-type="checklist"]', priority: 60, getAttrs: readId }],
      toDOM: (node) => ['ul', { 'data-type': 'checklist', ...idAttrs(node) }, 0],
    },
    task_item: {
      content: 'paragraph block*',
      defining: true,
      attrs: { checked: { default: false }, ...blockId },
      parseDOM: [{ tag: 'li', priority: 60, context: 'task_list/', getAttrs: (dom) => ({ checked: dom.getAttribute('data-checked') === 'true', ...readId(dom) }) }],
      toDOM: (node) => ['li', { 'data-checked': node.attrs['checked'] ? 'true' : 'false', ...idAttrs(node) }, 0],
    },
    figure: {
      group: 'block',
      content: 'inline*',
      marks: 'bold italic underline strike link',
      defining: true,
      attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null }, width: { default: null }, height: { default: null }, ...blockId },
      parseDOM: [
        {
          tag: 'figure',
          getAttrs: (dom) => {
            const img = dom.querySelector('img');
            if (!img) return false;
            return { ...imageAttrs(img), ...readId(dom) };
          },
          contentElement: (dom) => (dom as HTMLElement).querySelector('figcaption') ?? (dom as HTMLElement).ownerDocument.createElement('figcaption'),
        },
      ],
      toDOM: (node) => ['figure', idAttrs(node), ['img', imageDom(node)], ['figcaption', 0]],
    },
    image: {
      group: 'inline',
      inline: true,
      atom: true,
      draggable: true,
      attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null }, width: { default: null }, height: { default: null } },
      parseDOM: [{ tag: 'img[src]', getAttrs: (dom) => imageAttrs(dom) }],
      toDOM: (node) => ['img', imageDom(node)],
      leafText: () => '',
    },
    audio: media('audio'),
    video: media('video'),
    embed: {
      group: 'block',
      atom: true,
      attrs: { src: { default: '' }, width: { default: null }, height: { default: null }, ...blockId },
      parseDOM: [{ tag: 'iframe', getAttrs: (dom) => (hostAllowed(dom.getAttribute('src'), hosts) ? { src: dom.getAttribute('src'), width: int(dom.getAttribute('width')), height: int(dom.getAttribute('height')), ...readId(dom) } : false) }],
      toDOM: (node) => {
        const attrs: Record<string, string> = { src: node.attrs['src'] };
        if (node.attrs['width'] != null) attrs['width'] = String(node.attrs['width']);
        if (node.attrs['height'] != null) attrs['height'] = String(node.attrs['height']);
        return ['iframe', { ...attrs, allowfullscreen: '', ...idAttrs(node) }];
      },
    },
    table: {
      ...tables.table,
      attrs: { variant: { default: null }, ...blockId },
      parseDOM: [{ tag: 'table', getAttrs: (dom) => ({ variant: /salmon-rich-text-table--(bordered|striped)/.exec(dom.getAttribute('class') ?? '')?.[1] ?? null, ...readId(dom) }) }],
      toDOM: (node): DOMOutputSpec => ['table', { ...(node.attrs['variant'] ? { class: `salmon-rich-text-table--${node.attrs['variant']}` } : {}), ...idAttrs(node) }, ['tbody', 0]],
    },
    table_row: tables.table_row,
    table_cell: tables.table_cell,
    table_header: tables.table_header,
    callout: {
      group: 'block',
      content: 'block+',
      defining: true,
      attrs: { tone: { default: 'info' }, ...blockId },
      parseDOM: [{ tag: 'div[data-type="callout"]', getAttrs: (dom) => ({ tone: pick(dom.getAttribute('data-tone'), TONES) ?? 'info', ...readId(dom) }) }],
      toDOM: (node) => ['div', { 'data-type': 'callout', 'data-tone': node.attrs['tone'], ...idAttrs(node) }, 0],
    },
    toggle: {
      group: 'block',
      content: 'toggle_summary block*',
      defining: true,
      attrs: { open: { default: false }, ...blockId },
      parseDOM: [{ tag: 'details', getAttrs: (dom) => ({ open: dom.hasAttribute('open'), ...readId(dom) }) }],
      toDOM: (node) => ['details', { ...(node.attrs['open'] ? { open: '' } : {}), ...idAttrs(node) }, 0],
    },
    toggle_summary: {
      content: 'inline*',
      defining: true,
      parseDOM: [{ tag: 'summary' }],
      toDOM: () => ['summary', 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
      leafText: () => '\n',
    },
    mention: inlineAtom('mention'),
    label: inlineAtom('label'),
    ...options.nodes,
  };
  const marks: Record<string, MarkSpec> = {
    link: {
      attrs: { href: {}, title: { default: null }, target: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title'), target: dom.getAttribute('target') === '_blank' ? '_blank' : null }) }],
      toDOM: (mark) => {
        const attrs: Record<string, string> = { href: mark.attrs['href'] };
        if (mark.attrs['title']) attrs['title'] = mark.attrs['title'];
        if (mark.attrs['target'] === '_blank') Object.assign(attrs, { target: '_blank', rel: 'noopener noreferrer' });
        return ['a', attrs, 0];
      },
    },
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b', getAttrs: (dom) => (style(dom).get('font-weight') === 'normal' ? false : null) },
        { style: 'font-weight', getAttrs: (value) => (/^(bold(er)?|[6-9]\d\d)$/.test(value) ? null : false) },
      ],
      toDOM: () => ['strong', 0],
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }], toDOM: () => ['s', 0] },
    subscript: { excludes: 'superscript', parseDOM: [{ tag: 'sub' }], toDOM: () => ['sub', 0] },
    superscript: { excludes: 'subscript', parseDOM: [{ tag: 'sup' }], toDOM: () => ['sup', 0] },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
    fontFamily: styleMark('font-family'),
    fontSize: styleMark('font-size'),
    color: styleMark('color'),
    backgroundColor: { ...styleMark('background-color'), parseDOM: [...(styleMark('background-color').parseDOM ?? []), { tag: 'mark', getAttrs: () => ({ value: 'yellow' }) }] },
    ...options.marks,
  };
  return new Schema({ nodes, marks });
}

function pick(value: string | null | undefined, allowed: Set<string>): string | null {
  return value && allowed.has(value) ? value : null;
}

function imageAttrs(dom: DomLike) {
  return { src: dom.getAttribute('src') ?? '', alt: dom.getAttribute('alt') ?? '', title: dom.getAttribute('title'), width: int(dom.getAttribute('width')), height: int(dom.getAttribute('height')) };
}

function imageDom(node: PMNode): Record<string, string> {
  const attrs: Record<string, string> = { src: node.attrs['src'], alt: node.attrs['alt'] ?? '' };
  if (node.attrs['title']) attrs['title'] = node.attrs['title'];
  if (node.attrs['width'] != null) attrs['width'] = String(node.attrs['width']);
  if (node.attrs['height'] != null) attrs['height'] = String(node.attrs['height']);
  return attrs;
}

function inlineAtom(type: 'mention' | 'label'): NodeSpec {
  return {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    attrs: { id: {}, label: { default: '' }, trigger: { default: type === 'mention' ? '@' : '#' }, ...(type === 'label' ? { tone: { default: null } } : {}) },
    parseDOM: [
      {
        tag: `span[data-type="${type}"]`,
        priority: 60,
        getAttrs: (dom) => {
          const trigger = dom.getAttribute('data-trigger') ?? (type === 'mention' ? '@' : '#');
          const text = dom.textContent ?? '';
          return { id: dom.getAttribute('data-id') ?? '', trigger, label: text.startsWith(trigger) ? text.slice(trigger.length) : text, ...(type === 'label' ? { tone: dom.getAttribute('data-tone') } : {}) };
        },
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = { 'data-type': type, 'data-id': String(node.attrs['id']), 'data-trigger': node.attrs['trigger'] };
      if (type === 'label' && node.attrs['tone']) attrs['data-tone'] = node.attrs['tone'];
      return ['span', attrs, `${node.attrs['trigger']}${node.attrs['label']}`];
    },
    leafText: (node) => `${node.attrs['trigger']}${node.attrs['label']}`,
  };
}

function styleMark(property: string): MarkSpec {
  return {
    attrs: { value: {} },
    parseDOM: [{ style: property, getAttrs: (value) => (value && !/url\(|expression|javascript:/i.test(value) ? { value } : false) }],
    toDOM: (mark) => ['span', { style: `${property}:${mark.attrs['value']}` }, 0],
  };
}
