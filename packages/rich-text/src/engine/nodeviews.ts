// Node views: image and figure resize handles, the code
// block language picker and the table style class on
// prosemirror-tables' TableView. Pointer drag transients write
// styles directly, never state.
import { NodeSelection } from 'prosemirror-state';
import { TableView } from 'prosemirror-tables';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor, ViewMutationRecord } from 'prosemirror-view';

/** The node's block id on its view root (BlockEditor handles and `data-block-id` lookups). */
function syncBlockId(dom: HTMLElement, node: PMNode): void {
  const id = node.attrs['blockId'] as string | null | undefined;
  if (id) dom.setAttribute('data-block-id', id);
  else dom.removeAttribute('data-block-id');
}

/**
 * Pointer resize handle of an image: the drag writes the
 * image style directly and commits `width` / `height` once on release.
 */
function resizeHandle(img: HTMLImageElement, dom: HTMLElement, commit: (width: number, height: number) => void): HTMLElement {
  const handle = document.createElement('span');
  handle.className = 'salmon-rich-text__resize-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('dragstart', (event) => event.preventDefault());
  handle.addEventListener('mousedown', (event) => event.preventDefault());
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const rect = img.getBoundingClientRect();
    const ratio = rect.height / Math.max(1, rect.width);
    const rtl = getComputedStyle(dom).direction === 'rtl';
    handle.setPointerCapture(event.pointerId);
    let width = rect.width;
    const move = (e: PointerEvent) => {
      width = Math.max(24, Math.round(rect.width + (rtl ? startX - e.clientX : e.clientX - startX)));
      img.style.width = `${width}px`;
      img.style.height = `${Math.round(width * ratio)}px`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      commit(width, Math.round(width * ratio));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  return handle;
}

// The handle's pointer, mouse and drag events never reach ProseMirror (no node drag, no selection change).
const isHandle = (event: Event): boolean => Boolean((event.target as HTMLElement).classList?.contains('salmon-rich-text__resize-handle'));

function syncImage(img: HTMLImageElement, node: PMNode): void {
  img.src = node.attrs['src'];
  img.alt = node.attrs['alt'] ?? '';
  if (node.attrs['title']) img.title = node.attrs['title'];
  else img.removeAttribute('title');
  img.style.width = node.attrs['width'] != null ? `${node.attrs['width']}px` : '';
  img.style.height = node.attrs['height'] != null ? `${node.attrs['height']}px` : '';
}

class ImageView implements NodeView {
  dom: HTMLElement;
  #img: HTMLImageElement;
  constructor(
    public node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    const dom = document.createElement('span');
    dom.className = 'salmon-rich-text__image';
    const img = document.createElement('img');
    this.#img = img;
    this.dom = dom;
    syncImage(img, node);
    const handle = resizeHandle(img, dom, (width, height) => {
      const pos = getPos();
      if (pos === undefined) return;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, width, height });
      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
    });
    dom.append(img, handle);
  }
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    syncImage(this.#img, node);
    return true;
  }
  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode');
  }
  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode');
  }
  stopEvent(event: Event): boolean {
    return isHandle(event);
  }
  ignoreMutation(): boolean {
    return true;
  }
}

/**
 * An image with a caption (`figure`, the BlockEditor image block):
 * the image and its resize handle are not editable, the caption is the
 * content. The handle shows while the image is hovered (always on coarse
 * pointers); the image settings dialog is the keyboard path.
 */
class FigureView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  #img: HTMLImageElement;
  constructor(
    public node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    const figure = document.createElement('figure');
    const frame = document.createElement('span');
    frame.className = 'salmon-rich-text__image salmon-rich-text__image--figure';
    frame.contentEditable = 'false';
    const img = document.createElement('img');
    const caption = document.createElement('figcaption');
    this.dom = figure;
    this.contentDOM = caption;
    this.#img = img;
    const handle = resizeHandle(img, figure, (width, height) => {
      const pos = getPos();
      if (pos === undefined) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, width, height }));
    });
    frame.append(img, handle);
    figure.append(frame, caption);
    this.#sync(node);
  }
  #sync(node: PMNode): void {
    syncImage(this.#img, node);
    syncBlockId(this.dom, node);
  }
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.#sync(node);
    return true;
  }
  stopEvent(event: Event): boolean {
    return isHandle(event);
  }
  ignoreMutation(record: ViewMutationRecord): boolean {
    // Only the caption is ProseMirror content; the frame (image style, handle) belongs to the view.
    return record.type !== 'selection' && !this.contentDOM.contains(record.target as Node);
  }
}

interface CodeOptions {
  codeLanguages(): readonly { readonly value: string; readonly label: string }[] | undefined;
  setLanguage(language: string | null): boolean;
}

class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  #select: HTMLSelectElement | null = null;
  #picker: HTMLElement | null = null;
  constructor(
    public node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    options: CodeOptions,
  ) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    pre.append(code);
    this.dom = pre;
    this.contentDOM = code;
    const languages = options.codeLanguages();
    if (languages?.length) {
      // A styled native select: the wrapper draws the chevron (a mask in
      // currentColor) and keeps the picker on its own line above the code.
      const picker = document.createElement('span');
      picker.className = 'salmon-rich-text__code-language';
      picker.contentEditable = 'false';
      const select = document.createElement('select');
      select.className = 'salmon-rich-text__code-language-select';
      select.setAttribute('aria-label', 'Code language');
      select.append(new Option('Plain text', ''), ...languages.map((l) => new Option(l.label, l.value)));
      select.addEventListener('change', () => {
        const pos = getPos();
        if (pos === undefined) return;
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, language: select.value || null }));
      });
      picker.append(select);
      pre.prepend(picker);
      this.#select = select;
      this.#picker = picker;
    }
    this.#sync(node);
  }
  #sync(node: PMNode): void {
    syncBlockId(this.dom, node);
    const language = node.attrs['language'] as string | null;
    this.contentDOM.className = language ? `language-${language}` : '';
    if (this.#select) this.#select.value = language ?? '';
  }
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.#sync(node);
    return true;
  }
  stopEvent(event: Event): boolean {
    return this.#picker !== null && this.#picker.contains(event.target as Node);
  }
  ignoreMutation(record: ViewMutationRecord): boolean {
    return this.#picker !== null && this.#picker.contains(record.target as Node);
  }
}

class StyledTableView extends TableView {
  constructor(node: PMNode, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.#apply(node);
  }
  #apply(node: PMNode): void {
    this.table.className = node.attrs['variant'] ? `salmon-rich-text-table--${node.attrs['variant']}` : '';
  }
  override update(node: PMNode): boolean {
    if (!super.update(node)) return false;
    this.#apply(node);
    return true;
  }
}

export function nodeViews(options: CodeOptions): Record<string, NodeViewConstructor> {
  return {
    image: (node, view, getPos) => new ImageView(node, view, getPos),
    figure: (node, view, getPos) => new FigureView(node, view, getPos),
    code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos, options),
    table: (node) => new StyledTableView(node, 40),
  };
}
