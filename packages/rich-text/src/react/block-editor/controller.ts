// BlockEditor client controller (lazy chunk, loaded with dynamic import()
// after hydration like the engine it wraps). It owns the RichTextEngine over
// the server-rendered content element and keeps the block model in sync:
// blocks -> blocksToHtml -> engine, engine HTML -> htmlToBlocks -> blocks
// (the single conversion path). Block ids live in the schema's
// `blockId` attributes; a plugin keeps them present and unique.
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { createEngine, serializeDoc, toolbarState, DEFAULT_KEY_BINDINGS, type RichTextEngine } from '../../engine/load.js';
import type { RichTextExtension, RichTextKeyBindings, RichTextToolbarState } from '../../engine/types.js';
import type { MentionEditorInsertion, MentionEditorTarget } from '@salmonui/dropdowns/mention';
import { blocksToHtml } from '../../blocks/to-html.js';
import { htmlToBlocks } from '../../blocks/from-html.js';
import { findBlock, insertBlocks, moveBlock as moveIn, updateBlock as updateIn } from '../../blocks/ops.js';
import type { Block, BlockPatch, BlockPosition } from '../../blocks/types.js';
import { cleanPastedHtml } from '../../html/paste.js';
import { diffBlocks, duplicate, locate, remove, stepPosition, turnInto } from './transforms.js';
import type { BlockEditorProps, BlockEditorSelection, BlockEditorTransformId } from './types.js';

/** Nodes that are blocks of the model (list containers and table parts are not). */
const BLOCK_NODES: ReadonlySet<string> = new Set([
  'paragraph', 'heading', 'blockquote', 'code_block', 'horizontal_rule', 'list_item', 'task_item', 'figure', 'table', 'callout', 'toggle', 'audio', 'video', 'embed',
]);
/** Containers whose first paragraph is the block's own text, not a child block. */
const OWN_TEXT: ReadonlySet<string> = new Set(['list_item', 'task_item', 'blockquote', 'callout']);

/** UI-facing snapshot (useSyncExternalStore). */
export interface BlockSnapshot {
  readonly ready: boolean;
  readonly focused: boolean;
  readonly selectionEmpty: boolean;
  readonly textSelection: boolean;
  readonly marks: RichTextToolbarState['marks'];
  readonly link: string | null;
  readonly inCode: boolean;
  readonly blockId: string | null;
  readonly suggest: { readonly query: string; readonly from: number } | null;
  readonly empty: boolean;
}

export const INITIAL_SNAPSHOT: BlockSnapshot = Object.freeze({
  ready: false,
  focused: false,
  selectionEmpty: true,
  textSelection: false,
  marks: Object.freeze({ bold: false, italic: false, underline: false, strike: false, subscript: false, superscript: false, code: false }),
  link: null,
  inCode: false,
  blockId: null,
  suggest: null,
  empty: false,
});

/** The UI hooks the controller calls back into (set by the React side). */
export interface ControllerHooks {
  props(): BlockEditorProps;
  /** Slash menu keys while the `/` trigger is active; true when handled. */
  suggestKey(event: KeyboardEvent): boolean;
  /** UI actions: `blockMenu`, `contextMenu`, `print`. */
  action(id: string): boolean;
  /** Paste prompt (`pasteCleanup.mode: 'prompt'`). */
  pastePrompt(): Promise<'keep' | 'clean' | 'plainText' | null>;
}

function randomPrefix(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  return 'k' + [...bytes].map((b) => b.toString(36)).join('').slice(0, 6);
}

/** Ids and inline-image normalization (an image inside text becomes its own image block). */
function blockPlugin(nextId: () => string, suggestKey: (event: KeyboardEvent) => boolean, suggestActive: () => boolean): Plugin {
  return new Plugin({
    key: new PluginKey('salmonBlockIds'),
    props: {
      // Slash menu keys before the editing keymap (Enter would split the block).
      handleKeyDown: (_view, event) => suggestActive() && suggestKey(event),
    },
    // Table node views render their own <table>: put the block id on it (an ignored mutation).
    view(view) {
      const sync = () => {
        view.state.doc.forEach((node, offset) => {
          if (node.type.name !== 'table') return;
          const dom = view.nodeDOM(offset);
          const table = dom instanceof HTMLElement ? (dom.tagName === 'TABLE' ? dom : dom.querySelector('table')) : null;
          const id = node.attrs['blockId'] as string | null;
          if (table && id && table.getAttribute('data-block-id') !== id) table.setAttribute('data-block-id', id);
        });
      };
      sync();
      return { update: sync };
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      return normalize(state, nextId);
    },
  });
}

function normalize(state: EditorState, nextId: () => string): Transaction | null {
  const { schema } = state;
  const figure = schema.nodes['figure'];
  // 1. Inline images (upload, paste) become figure blocks after their paragraph.
  let tr: Transaction | null = null;
  const images: { pos: number; node: PMNode; para: number; paraNode: PMNode }[] = [];
  state.doc.descendants((node, pos, parent) => {
    if (node.type.name === 'table') return false;
    if (node.type.name === 'image' && parent && parent.type.name === 'paragraph') {
      const $pos = state.doc.resolve(pos);
      images.push({ pos, node, para: $pos.before(), paraNode: parent });
    }
    return true;
  });
  if (images.length && figure) {
    tr = state.tr;
    for (let i = images.length - 1; i >= 0; i--) {
      const { pos, node, para, paraNode } = images[i] as (typeof images)[number];
      const fig = figure.create({ src: node.attrs['src'], alt: node.attrs['alt'] ?? '', width: node.attrs['width'], height: node.attrs['height'], blockId: null });
      const onlyChild = paraNode.childCount === 1;
      if (onlyChild) tr.replaceWith(para, para + paraNode.nodeSize, fig);
      else {
        tr.delete(pos, pos + node.nodeSize);
        const after = tr.mapping.map(para + paraNode.nodeSize);
        tr.insert(after, fig);
      }
    }
    return tr.setMeta('addToHistory', true);
  }
  // 2. A container's own-text paragraph carries no id; a container wrapped around
  //    a paragraph (Markdown rule, turn into) inherits the paragraph's id.
  const moves: { pos: number; node: PMNode; parentPos: number; parent: PMNode }[] = [];
  state.doc.descendants((node, pos, parent, index) => {
    if (parent && OWN_TEXT.has(parent.type.name) && index === 0 && node.type.name === 'paragraph' && node.attrs['blockId']) {
      moves.push({ pos, node, parentPos: state.doc.resolve(pos).before(), parent });
    }
    return !node.isTextblock;
  });
  if (moves.length) {
    tr = state.tr;
    for (const m of moves) {
      tr.setNodeMarkup(m.pos, undefined, { ...m.node.attrs, blockId: null });
      if (!m.parent.attrs['blockId']) tr.setNodeMarkup(m.parentPos, undefined, { ...m.parent.attrs, blockId: m.node.attrs['blockId'] });
    }
    return tr.setMeta('addToHistory', false);
  }
  // 3. Every model block has a unique id.
  const seen = new Set<string>();
  const fix: { pos: number; node: PMNode }[] = [];
  state.doc.descendants((node, pos, parent, index) => {
    const name = node.type.name;
    if (name === 'table_row' || name === 'table_cell' || name === 'table_header') return false;
    if (parent && OWN_TEXT.has(parent.type.name) && index === 0 && name === 'paragraph') return false;
    if (parent && parent.type.name === 'table') return false;
    if (BLOCK_NODES.has(name)) {
      const id = node.attrs['blockId'] as string | null;
      if (!id || seen.has(id)) fix.push({ pos, node });
      else seen.add(id);
      return name !== 'table' && !node.isTextblock && !node.isAtom;
    }
    return !node.isTextblock;
  });
  if (!fix.length) return null;
  tr = state.tr;
  for (const { pos, node } of fix) {
    let id = nextId();
    while (seen.has(id)) id = nextId();
    seen.add(id);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id });
  }
  return tr.setMeta('addToHistory', false);
}

function plainChord(map: RichTextKeyBindings, command: string): string[] {
  return Object.entries(map)
    .filter(([, value]) => value === command)
    .map(([key]) => key);
}

const BLOCK_ACTIONS: ReadonlySet<string> = new Set([
  'moveBlockUp', 'moveBlockDown', 'duplicateBlock', 'deleteBlock', 'blockMenu', 'contextMenu', 'print', 'link', 'image',
  'paragraph', 'heading1', 'heading2', 'heading3', 'bulletList', 'numberedList', 'checklist', 'quote', 'callout', 'code', 'toggle', 'divider', 'table',
]);

const BLOCK_KEYS: Readonly<Record<string, string>> = {
  'Mod-Shift-ArrowUp': 'moveBlockUp',
  'Mod-Shift-ArrowDown': 'moveBlockDown',
  'Mod-d': 'duplicateBlock',
  'Mod-Shift-Backspace': 'deleteBlock',
  'Alt-F10': 'blockMenu',
  'Shift-F10': 'contextMenu',
  'Mod-p': 'print',
};

/** Merges the BlockEditor defaults and the `keyBindings` prop (command -> chord) into engine bindings (chord -> command). */
export function engineKeyBindings(custom: BlockEditorProps['keyBindings']): RichTextKeyBindings {
  const out: Record<string, string | false> = { ...BLOCK_KEYS };
  if (!custom) return out;
  const defaults: RichTextKeyBindings = { ...DEFAULT_KEY_BINDINGS, ...BLOCK_KEYS };
  for (const [command, chord] of Object.entries(custom)) {
    if (chord === undefined) continue;
    for (const key of plainChord(defaults, command)) out[key] = false;
    if (chord !== false) out[chord] = command;
  }
  return out;
}

export class BlockController {
  engine: RichTextEngine;
  readonly element: HTMLElement;
  readonly #hooks: ControllerHooks;
  #blocks: Block[];
  #blocksDoc: PMNode;
  #snapshot: BlockSnapshot = INITIAL_SNAPSHOT;
  #listeners = new Set<() => void>();
  #focused = false;
  #lastSelection: string | null = null;
  #counter = 0;
  readonly #prefix = randomPrefix();
  #lastPaste: { html: string; text: string } | null = null;
  #mention: MentionEditorTarget | null = null;
  #unsubscribe: () => void;
  #cleanups: (() => void)[] = [];

  constructor(engine: RichTextEngine, element: HTMLElement, blocks: Block[], hooks: ControllerHooks) {
    this.engine = engine;
    this.element = element;
    this.#hooks = hooks;
    this.#blocks = blocks;
    this.#blocksDoc = engine.state.doc;
    engine.mount(element);
    // Ids for blocks that arrived without one (the initial state has no appendTransaction).
    const fix = normalize(engine.state, () => this.nextId());
    if (fix) {
      engine.dispatch(fix.setMeta('addToHistory', false));
      this.#blocks = this.#readBlocks();
      this.#blocksDoc = engine.state.doc;
    }
    this.#unsubscribe = engine.subscribe((tr) => this.#onTransaction(tr));
    const dom = engine.view!.dom;
    const owner = element.ownerDocument;
    const root = element.parentElement ?? element;
    // Focus inside the editor root or its own popups (menus may be portaled) counts as focused.
    const inside = (node: EventTarget | null): boolean =>
      node instanceof Node && (root.contains(node) || (node instanceof Element && node.closest('.salmon-menu, .salmon-block-editor__menu-popover, .salmon-rich-text__dialog') !== null));
    const onFocusIn = (event: FocusEvent) => {
      if (event.target === dom || dom.contains(event.target as Node)) this.#setFocus(true);
      else if (this.#focused && !inside(event.target)) this.#setFocus(false);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget === null && this.#focused) {
        // Focus went to the document (or another window); check once it settled.
        queueMicrotask(() => {
          if (!inside(owner.activeElement)) this.#setFocus(false);
        });
      }
    };
    owner.addEventListener('focusin', onFocusIn, true);
    owner.addEventListener('focusout', onFocusOut, true);
    const onPaste = (event: ClipboardEvent) => this.#onPaste(event);
    root.addEventListener('paste', onPaste, true);
    this.#cleanups.push(() => {
      owner.removeEventListener('focusin', onFocusIn, true);
      owner.removeEventListener('focusout', onFocusOut, true);
      root.removeEventListener('paste', onPaste, true);
    });
    this.#publish();
  }

  nextId(): string {
    this.#counter += 1;
    return `${this.#prefix}${this.#counter.toString(36)}`;
  }

  // ---- store ---------------------------------------------------------------

  getSnapshot = (): BlockSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #publish(): void {
    const t = toolbarState(this.engine);
    const sel = this.engine.state.selection;
    const suggest = t.suggest && t.suggest.id === 'slash' ? { query: t.suggest.query, from: t.suggest.from } : null;
    const next: BlockSnapshot = {
      ready: true,
      focused: this.#focused,
      selectionEmpty: sel.empty,
      textSelection: sel instanceof TextSelection,
      marks: t.marks,
      link: t.link,
      inCode: t.block === 'code',
      blockId: this.currentBlockId(),
      suggest,
      empty: t.empty,
    };
    const prev = this.#snapshot;
    const same =
      prev.ready === next.ready &&
      prev.focused === next.focused &&
      prev.selectionEmpty === next.selectionEmpty &&
      prev.textSelection === next.textSelection &&
      prev.link === next.link &&
      prev.inCode === next.inCode &&
      prev.blockId === next.blockId &&
      prev.empty === next.empty &&
      JSON.stringify(prev.marks) === JSON.stringify(next.marks) &&
      JSON.stringify(prev.suggest) === JSON.stringify(next.suggest);
    if (!same) this.#snapshot = next;
    // Listeners also reposition popups, so they run after every transaction.
    for (const l of this.#listeners) l();
  }

  #setFocus(focused: boolean): void {
    if (this.#focused === focused) return;
    this.#focused = focused;
    const p = this.#hooks.props();
    if (focused) p.onFocus?.();
    else p.onBlur?.();
    this.#publish();
  }

  // ---- model sync ----------------------------------------------------------

  #readBlocks(): Block[] {
    return htmlToBlocks(serializeDoc(this.engine.state.doc));
  }

  /** The current document as blocks (cached per ProseMirror document). */
  getBlocks(): Block[] {
    if (this.#blocksDoc !== this.engine.state.doc) {
      this.#blocks = this.#readBlocks();
      this.#blocksDoc = this.engine.state.doc;
    }
    return this.#blocks;
  }

  #onTransaction(tr: Transaction | null): void {
    const p = this.#hooks.props();
    if (tr && tr.docChanged) {
      const external = tr.getMeta('salmonExternal') === true;
      const prev = this.#blocks;
      if (p.onChange || p.onBlockChange || p.onPaste) {
        const next = this.getBlocks();
        if (!external) {
          if (p.onBlockChange) for (const event of diffBlocks(prev, next)) p.onBlockChange(event);
          p.onChange?.(next);
        }
        if (tr.getMeta('uiEvent') === 'paste' && this.#lastPaste) {
          p.onPaste?.({ ...this.#lastPaste, blocks: next });
          this.#lastPaste = null;
        }
      }
    }
    const sel = this.getSelection();
    const key = sel ? `${sel.blockId}:${sel.offset}` : '';
    if (key !== this.#lastSelection) {
      this.#lastSelection = key;
      p.onSelectionChange?.(sel);
    }
    this.#publish();
  }

  /** Controlled `value`: replaces the document unless it is what the editor last reported. */
  syncValue(value: readonly Block[]): void {
    if (value === this.#blocks) return;
    const html = blocksToHtml(value);
    if (html === blocksToHtml(this.getBlocks())) {
      this.#blocks = value as Block[];
      return;
    }
    const sel = this.getSelection();
    this.engine.setHtml(html);
    this.#blocks = this.#readBlocks();
    this.#blocksDoc = this.engine.state.doc;
    if (sel && this.#focused) this.setSelection(sel);
  }

  /** Applies a block-level edit as one undoable step and reports it. */
  apply(next: Block[], caret?: BlockEditorSelection | null): void {
    if (next === this.getBlocks()) return;
    const doc = this.engine.parseHtml(blocksToHtml(next));
    const state = this.engine.state;
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content).setMeta('salmonBlocksApi', true);
    this.engine.dispatch(tr);
    if (caret) this.setSelection(caret);
  }

  // ---- selection --------------------------------------------------

  #blockAncestor(state: EditorState = this.engine.state): { id: string; pos: number; node: PMNode } | null {
    const sel = state.selection;
    if (sel instanceof NodeSelection && sel.node.attrs['blockId']) return { id: String(sel.node.attrs['blockId']), pos: sel.from, node: sel.node };
    const $from = sel.$from;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      const id = node.attrs['blockId'];
      const own = d > 1 && node.type.name === 'paragraph' && OWN_TEXT.has($from.node(d - 1).type.name) && $from.index(d - 1) === 0;
      if (id && !own && BLOCK_NODES.has(node.type.name)) return { id: String(id), pos: $from.before(d), node };
    }
    return null;
  }

  currentBlockId(): string | null {
    return this.#blockAncestor()?.id ?? null;
  }

  getSelection(): BlockEditorSelection | null {
    const found = this.#blockAncestor();
    if (!found) return null;
    const sel = this.engine.state.selection;
    return { blockId: found.id, offset: sel instanceof NodeSelection ? 0 : sel.$from.parentOffset };
  }

  #find(id: string): { pos: number; node: PMNode } | null {
    let found: { pos: number; node: PMNode } | null = null;
    this.engine.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.attrs['blockId'] === id && BLOCK_NODES.has(node.type.name)) {
        found = { pos, node };
        return false;
      }
      return true;
    });
    return found;
  }

  setSelection(selection: BlockEditorSelection): void {
    const found = this.#find(selection.blockId);
    if (!found) return;
    const { pos, node } = found;
    const state = this.engine.state;
    let tr: Transaction;
    if (node.isTextblock) {
      tr = state.tr.setSelection(TextSelection.create(state.doc, pos + 1 + Math.max(0, Math.min(selection.offset, node.content.size))));
    } else {
      let text: number | null = null;
      node.descendants((child, childPos) => {
        if (text !== null) return false;
        if (child.isTextblock) {
          text = pos + 1 + childPos + 1 + Math.max(0, Math.min(selection.offset, child.content.size));
          return false;
        }
        return true;
      });
      tr = text !== null ? state.tr.setSelection(TextSelection.create(state.doc, text)) : state.tr.setSelection(NodeSelection.create(state.doc, pos));
    }
    this.engine.dispatch(tr.scrollIntoView());
  }

  /** The block element for an id (for the handle, menus and drop indicator). */
  blockElement(id: string): HTMLElement | null {
    const found = this.#find(id);
    if (!found) return null;
    const dom = this.engine.view?.nodeDOM(found.pos);
    return dom instanceof HTMLElement ? dom : null;
  }

  /** Viewport rectangle of the caret (slash menu) or the selection start (inline toolbar). */
  caretRect(at: 'from' | 'suggest' = 'from'): { left: number; top: number; bottom: number } | null {
    const view = this.engine.view;
    if (!view) return null;
    const pos = at === 'suggest' ? (this.engine.suggest?.from ?? view.state.selection.from) : view.state.selection.from;
    try {
      const r = view.coordsAtPos(pos);
      return { left: r.left, top: r.top, bottom: r.bottom };
    } catch {
      return null;
    }
  }

  focus(): void {
    this.engine.focus();
  }

  // ---- block operations ---------------------

  getBlock(id: string): Block | undefined {
    return findBlock(this.getBlocks(), id);
  }

  insertBlocks(blocks: readonly Block[], position?: BlockPosition): void {
    const used = new Set<string>();
    const collect = (list: readonly Block[]): void => {
      for (const b of list) {
        used.add(b.id);
        if (b.children) collect(b.children);
      }
    };
    collect(this.getBlocks());
    // Inserted blocks keep their ids unless they collide.
    const fresh = (b: Block): Block => {
      const copy: Block = { ...b, id: used.has(b.id) || !b.id ? this.nextId() : b.id };
      used.add(copy.id);
      if (b.children) copy.children = b.children.map(fresh);
      return copy;
    };
    this.apply(insertBlocks(this.getBlocks(), blocks.map(fresh), position));
  }

  removeBlocks(ids: readonly string[]): void {
    this.apply(remove(this.getBlocks(), ids, () => this.nextId()));
  }

  updateBlock(id: string, patch: BlockPatch): void {
    this.apply(updateIn(this.getBlocks(), id, patch));
  }

  turnInto(id: string, type: BlockEditorTransformId): void {
    const sel = this.getSelection();
    this.apply(turnInto(this.getBlocks(), id, type), sel && sel.blockId === id ? sel : { blockId: id, offset: 0 });
  }

  duplicate(id: string): void {
    const result = duplicate(this.getBlocks(), id, () => this.nextId());
    if (result.id) this.apply(result.blocks, { blockId: result.id, offset: 0 });
  }

  delete(id: string): void {
    const blocks = this.getBlocks();
    const at = locate(blocks, id);
    const next = remove(blocks, [id], () => this.nextId());
    // Caret to the previous block (or the next one).
    const siblings = at ? (at.parentId === null ? next : (findBlock(next, at.parentId)?.children ?? [])) : next;
    const focus = siblings[Math.max(0, (at?.index ?? 0) - 1)] ?? next[0];
    this.apply(next, focus ? { blockId: focus.id, offset: 0 } : null);
  }

  /** Moves a block; false when cancelled by onBeforeBlockMove or impossible. */
  move(id: string, position: BlockPosition, source: 'pointer' | 'keyboard' | 'api'): boolean {
    const blocks = this.getBlocks();
    const block = findBlock(blocks, id);
    const from = locate(blocks, id);
    if (!block || !from) return false;
    const next = moveIn(blocks, id, position);
    if (next === blocks) return false;
    const p = this.#hooks.props();
    let prevented = false;
    const event = { block, from, position, source };
    p.onBeforeBlockMove?.({
      ...event,
      preventDefault: () => {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    });
    if (prevented) return false;
    const sel = this.getSelection();
    this.apply(next, sel && sel.blockId === id ? sel : { blockId: id, offset: 0 });
    p.onBlockMove?.(event);
    return true;
  }

  step(direction: -1 | 1, id = this.currentBlockId()): boolean {
    if (!id) return false;
    const position = stepPosition(this.getBlocks(), id, direction);
    return position ? this.move(id, position, 'keyboard') : false;
  }

  /** Runs a block command, UI action or engine command by id (menus, actionsRef.runCommand). */
  runAction(id: string, ...args: unknown[]): boolean {
    if (this.runBlockAction(id)) return true;
    if (BLOCK_ACTIONS.has(id)) return false;
    const result = this.engine.run(id, ...args);
    return result !== false && result !== 0 && result !== undefined;
  }

  /** Ids the engine does not know (key bindings and `run` fall through to this). */
  runBlockAction(id: string): boolean {
    const current = this.currentBlockId();
    switch (id) {
      case 'moveBlockUp':
        return this.step(-1);
      case 'moveBlockDown':
        return this.step(1);
      case 'duplicateBlock':
        if (!current) return false;
        this.duplicate(current);
        return true;
      case 'deleteBlock':
        if (!current) return false;
        this.delete(current);
        return true;
      case 'blockMenu':
      case 'contextMenu':
      case 'print':
      case 'link':
      case 'image':
        return this.#hooks.action(id);
      case 'paragraph':
      case 'heading1':
      case 'heading2':
      case 'heading3':
      case 'bulletList':
      case 'numberedList':
      case 'checklist':
      case 'quote':
      case 'callout':
      case 'code':
      case 'toggle':
        if (!current) return false;
        this.turnInto(current, id);
        return true;
      case 'divider':
        return this.#insertAfterCurrent({ id: this.nextId(), type: 'divider' });
      case 'table':
        return this.engine.commands.insertTable({ rows: 3, cols: 3, headerRow: true });
      default:
        return false;
    }
  }

  #insertAfterCurrent(block: Block): boolean {
    const current = this.currentBlockId();
    const blocks = this.getBlocks();
    const empty = current ? findBlock(blocks, current) : undefined;
    // An empty paragraph (where `/divider` was typed) is replaced.
    if (empty && empty.type === 'paragraph' && !(empty.content ?? []).length) {
      const next = insertBlocks(blocks, [block], { after: empty.id });
      const after: Block = { id: this.nextId(), type: 'paragraph', content: [] };
      this.apply(insertBlocks(remove(next, [empty.id], () => this.nextId()), [after], { after: block.id }), { blockId: after.id, offset: 0 });
      return true;
    }
    this.apply(current ? insertBlocks(blocks, [block], { after: current }) : [...blocks, block]);
    return true;
  }

  async insertFiles(files: readonly File[]): Promise<void> {
    await this.engine.insertFiles(files);
  }

  /** Puts the caret in a table's first cell (table commands from the block menu). */
  selectInTable(id: string): void {
    const found = this.#find(id);
    if (!found) return;
    const sel = this.engine.state.selection;
    if (sel.from > found.pos && sel.from < found.pos + found.node.nodeSize) return;
    let text: number | null = null;
    found.node.descendants((child, childPos) => {
      if (text !== null) return false;
      if (child.isTextblock) {
        text = found.pos + 1 + childPos + 1;
        return false;
      }
      return true;
    });
    if (text !== null) this.engine.dispatch(this.engine.state.tr.setSelection(TextSelection.create(this.engine.state.doc, text)));
  }

  /** Image block settings (alt text, width). */
  updateImage(id: string, attrs: { alt?: string; width?: number | null }): void {
    const found = this.#find(id);
    if (!found || found.node.type.name !== 'figure') return;
    this.engine.dispatch(this.engine.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attrs }));
  }

  getHtml(): string {
    return this.engine.getHtml();
  }

  // ---- paste --------------------------------------------------------

  #onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    const html = data?.getData('text/html') ?? '';
    const text = data?.getData('text/plain') ?? '';
    const files = data ? [...data.files] : [];
    let prevented = false;
    this.#hooks.props().onBeforePaste?.({
      html,
      text,
      files,
      preventDefault: () => {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    });
    if (prevented || this.#hooks.props().readOnly) {
      event.preventDefault();
      return;
    }
    this.#lastPaste = { html, text };
  }

  // ---- mentions and labels ----------------------------------------------

  /** The engine's Mention target, with labels inserted as label atoms. */
  mentionTarget(): MentionEditorTarget | null {
    const base = this.engine.mentionTarget;
    if (!base) return null;
    if (this.#mention && this.#mention.element === base.element) return this.#mention;
    const engine = this.engine;
    const hooks = this.#hooks;
    this.#mention = {
      element: base.element,
      getTextBeforeCaret: () => base.getTextBeforeCaret(),
      getCaretRect: (offset) => base.getCaretRect(offset),
      subscribe: (listener) => base.subscribe(listener),
      insertMention(insertion: MentionEditorInsertion) {
        const labels = hooks.props().labels;
        if (!labels || insertion.trigger !== (labels.trigger ?? '#')) {
          base.insertMention(insertion);
          return;
        }
        const $from = engine.state.selection.$from;
        const start = $from.start();
        const tone = (insertion.item as { tone?: unknown } | null)?.tone;
        const node = engine.schema.nodes['label']!.create({ id: String(insertion.value), label: insertion.label, trigger: insertion.trigger, tone: typeof tone === 'string' ? tone : null });
        const suffix = insertion.suffix || ' ';
        const tr = engine.state.tr.replaceWith(start + insertion.start, start + insertion.end, [node, engine.schema.text(suffix)]);
        tr.setSelection(TextSelection.create(tr.doc, start + insertion.start + 1 + suffix.length));
        engine.dispatch(tr.scrollIntoView());
        engine.view?.focus();
      },
    };
    return this.#mention;
  }

  refresh(): void {
    this.engine.refresh();
  }

  destroy(): void {
    this.#unsubscribe();
    for (const c of this.#cleanups) c();
    this.engine.destroy();
    this.#listeners.clear();
  }
}

/** Creates the engine over the server-rendered element and wraps it. */
export async function createBlockController(element: HTMLElement, blocks: readonly Block[], hooks: ControllerHooks): Promise<BlockController> {
  const p = hooks.props();
  let controller: BlockController | null = null;
  const nextId = () => controller?.nextId() ?? `k${Math.random().toString(36).slice(2, 8)}`;
  const extension: RichTextExtension = {
    name: 'salmonBlockEditor',
    plugins: () => [blockPlugin(nextId, (event) => hooks.suggestKey(event), () => Boolean(controller?.engine.suggest))],
  };
  const cleanup = () => hooks.props().pasteCleanup;
  const engine = await createEngine({
    html: blocksToHtml(blocks),
    extensions: [extension, ...(p.extensions ?? [])],
    embedHosts: p.embedHosts,
    sanitize: p.sanitize,
    undoLimit: p.undoLimit,
    tabKey: 'indent',
    keyBindings: engineKeyBindings(p.keyBindings),
    placeholder: () => hooks.props().placeholder,
    highlight: () => hooks.props().highlight,
    codeLanguages: () => hooks.props().codeLanguages,
    suggestTriggers: () => (hooks.props().slashMenu === false || hooks.props().readOnly ? [] : [{ id: 'slash', char: '/' }]),
    onAction: (id) => controller?.runBlockAction(id) ?? false,
    upload: () => {
      const upload = hooks.props().onUpload;
      return upload ? (file) => upload(file) : undefined;
    },
    uploadLabel: () => 'Uploading',
    pasteMode: () => cleanup()?.mode ?? 'clean',
    cleanPaste: (html, mode) => cleanPastedHtml(html, { ...cleanup(), mode }),
    pastePrompt: () => hooks.pastePrompt(),
    editable: () => !hooks.props().readOnly,
    attributes: () => {
      const q = hooks.props();
      const attrs: Record<string, string> = { role: 'textbox', 'aria-multiline': 'true' };
      if (q['aria-labelledby']) attrs['aria-labelledby'] = q['aria-labelledby'];
      else attrs['aria-label'] = q['aria-label'] ?? 'Editor';
      if (q.readOnly) attrs['aria-readonly'] = 'true';
      return attrs;
    },
  });
  controller = new BlockController(engine, element, [...blocks], hooks);
  return controller;
}
