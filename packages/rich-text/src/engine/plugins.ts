// Engine plugins: placeholder,
// maxLength transaction filter, find and replace decorations,
// format painter, slash and emoji triggers, upload
// placeholders, code highlighting through the application hook and checklist toggling.
import { Plugin, PluginKey, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { isHistoryTransaction, undo, undoDepth } from 'prosemirror-history';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Mark, Node as PMNode, NodeType } from 'prosemirror-model';

/** Transactions carrying this meta bypass the maxLength filter (programmatic value changes). */
export const EXTERNAL = 'salmonExternal';

export function characterCount(doc: PMNode): number {
  return doc.textContent.length;
}

export function isEmptyDoc(doc: PMNode): boolean {
  const first = doc.firstChild;
  return doc.childCount === 1 && !!first && first.isTextblock && first.content.size === 0 && first.type.name === 'paragraph';
}

export function placeholderPlugin(text: () => string | undefined): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const value = text();
        if (!value || !isEmptyDoc(state.doc)) return null;
        return DecorationSet.create(state.doc, [Decoration.node(0, state.doc.firstChild!.nodeSize, { class: 'salmon-rich-text__placeholder', 'data-placeholder': value })]);
      },
    },
  });
}

export function maxLengthPlugin(limit: () => number | undefined): Plugin {
  return new Plugin({
    filterTransaction(tr, state) {
      const max = limit();
      if (max === undefined || !tr.docChanged || tr.getMeta(EXTERNAL)) return true;
      const next = characterCount(tr.doc);
      return next <= max || next <= characterCount(state.doc);
    },
  });
}

// ---------------------------------------------------------------------------
// Find and replace
// ---------------------------------------------------------------------------

export interface FindOptions {
  readonly matchCase?: boolean | undefined;
  readonly wholeWord?: boolean | undefined;
}

export interface FindState {
  readonly query: string;
  readonly options: FindOptions;
  readonly matches: readonly { from: number; to: number }[];
  readonly index: number;
}

export const findKey = new PluginKey<FindState>('salmonFind');
const NO_FIND: FindState = { query: '', options: {}, matches: [], index: -1 };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMatches(doc: PMNode, query: string, options: FindOptions): { from: number; to: number }[] {
  if (!query) return [];
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${escapeRegExp(query)}(?![\\p{L}\\p{N}_])` : escapeRegExp(query);
  const re = new RegExp(source, options.matchCase ? 'gu' : 'giu');
  const out: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    for (const m of text.matchAll(re)) out.push({ from: pos + 1 + m.index, to: pos + 1 + m.index + m[0].length });
    return false;
  });
  return out;
}

export function findPlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => NO_FIND,
      apply(tr, value) {
        const meta = tr.getMeta(findKey) as Partial<FindState> | null | undefined;
        if (meta === null) return NO_FIND;
        if (meta) {
          const query = meta.query ?? value.query;
          const options = meta.options ?? value.options;
          const matches = meta.matches ?? findMatches(tr.doc, query, options);
          return { query, options, matches, index: meta.index ?? (matches.length ? 0 : -1) };
        }
        if (!tr.docChanged || !value.query) return value;
        const matches = findMatches(tr.doc, value.query, value.options);
        return { ...value, matches, index: Math.min(value.index, matches.length - 1) };
      },
    },
    props: {
      decorations(state) {
        const find = findKey.getState(state);
        if (!find || !find.matches.length) return null;
        return DecorationSet.create(
          state.doc,
          find.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === find.index ? 'salmon-rich-text__match salmon-rich-text__match--current' : 'salmon-rich-text__match' })),
        );
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Format painter
// ---------------------------------------------------------------------------

export interface PainterState {
  readonly marks: readonly Mark[];
  readonly block: { readonly type: NodeType; readonly attrs: Record<string, unknown> } | null;
  readonly sticky: boolean;
}

export const painterKey = new PluginKey<PainterState | null>('salmonPainter');

export function painterPlugin(onApplied: () => void): Plugin<PainterState | null> {
  return new Plugin<PainterState | null>({
    key: painterKey,
    state: {
      init: () => null,
      apply: (tr, value) => {
        const meta = tr.getMeta(painterKey) as PainterState | null | undefined;
        return meta === undefined ? value : meta;
      },
    },
    props: {
      handleDOMEvents: {
        // A pointer selection made while the painter is active receives the format.
        mouseup: (view) => {
          if (!painterKey.getState(view.state)) return false;
          setTimeout(() => {
            if (!view.isDestroyed && !view.state.selection.empty) onApplied();
          });
          return false;
        },
      },
    },
  });
}

export function applyPainter(state: EditorState, painter: PainterState): Transaction {
  const tr = state.tr;
  const { from, to } = state.selection;
  for (const name of Object.keys(state.schema.marks)) {
    if (name !== 'link') tr.removeMark(from, to, state.schema.marks[name]);
  }
  for (const mark of painter.marks) if (mark.type.name !== 'link') tr.addMark(from, to, mark);
  if (painter.block) {
    const { type, attrs } = painter.block;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock || node.type.spec.code) return true;
      if (type.validContent(node.content)) tr.setNodeMarkup(tr.mapping.map(pos), type, { ...attrs, blockId: node.attrs['blockId'] ?? null });
      return false;
    });
  }
  if (!painter.sticky) tr.setMeta(painterKey, null);
  return tr;
}

// ---------------------------------------------------------------------------
// Slash and emoji triggers
// ---------------------------------------------------------------------------

export interface SuggestTrigger {
  readonly id: string;
  readonly char: string;
}

export interface SuggestState {
  readonly id: string;
  /** Position of the trigger character. */
  readonly from: number;
  /** The caret. */
  readonly to: number;
  readonly query: string;
}

interface SuggestPluginState {
  readonly active: SuggestState | null;
  readonly dismissed: number;
}

export const suggestKey = new PluginKey<SuggestPluginState>('salmonSuggest');

export function textBeforeCaret(state: EditorState): string | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  return $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
}

function detect(state: EditorState, triggers: readonly SuggestTrigger[]): SuggestState | null {
  const before = textBeforeCaret(state);
  if (before === null) return null;
  for (const trigger of triggers) {
    const char = escapeRegExp(trigger.char);
    const m = new RegExp(`(?:^|\\s)${char}([\\p{L}\\p{N}_+-]{0,30})$`, 'u').exec(before);
    if (m) {
      const to = state.selection.from;
      return { id: trigger.id, from: to - m[1]!.length - trigger.char.length, to, query: m[1]! };
    }
  }
  return null;
}

export function suggestPlugin(triggers: () => readonly SuggestTrigger[], onKey: (event: KeyboardEvent) => boolean): Plugin {
  return new Plugin<SuggestPluginState>({
    key: suggestKey,
    state: {
      init: (): SuggestPluginState => ({ active: null, dismissed: -1 }),
      apply(tr, value, _old, state): SuggestPluginState {
        let dismissed = tr.getMeta(suggestKey) === 'dismiss' ? (value.active?.from ?? -1) : value.dismissed;
        if (dismissed >= 0 && tr.docChanged) dismissed = tr.mapping.map(dismissed);
        const active = detect(state, triggers());
        if (!active) return { active: null, dismissed: -1 };
        if (active.from === dismissed) return { active: null, dismissed };
        return { active, dismissed: -1 };
      },
    },
    props: {
      handleKeyDown(view, event) {
        return Boolean(suggestKey.getState(view.state)?.active) && onKey(event);
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Upload placeholders
// ---------------------------------------------------------------------------

export const uploadKey = new PluginKey<DecorationSet>('salmonUpload');

export function uploadPlugin(label: () => string): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: uploadKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        let next = set.map(tr.mapping, tr.doc);
        const meta = tr.getMeta(uploadKey) as { add?: { id: string; pos: number }; remove?: string } | undefined;
        if (meta?.add) {
          const id = meta.add.id;
          const widget = (): HTMLElement => {
            const el = document.createElement('span');
            el.className = 'salmon-rich-text__uploading';
            el.setAttribute('role', 'status');
            el.textContent = label();
            return el;
          };
          next = next.add(tr.doc, [Decoration.widget(meta.add.pos, widget, { id })]);
        }
        if (meta?.remove) next = next.remove(next.find(undefined, undefined, (spec) => spec['id'] === meta.remove));
        return next;
      },
    },
    props: {
      decorations: (state) => uploadKey.getState(state) ?? null,
    },
  });
}

export function findUpload(state: EditorState, id: string): number | null {
  const found = uploadKey.getState(state)?.find(undefined, undefined, (spec) => spec['id'] === id);
  return found && found.length ? found[0]!.from : null;
}

export function pendingUploads(state: EditorState): number {
  return uploadKey.getState(state)?.find().length ?? 0;
}

// ---------------------------------------------------------------------------
// Code highlighting (application hook, no bundled highlighter)
// ---------------------------------------------------------------------------

export interface HighlightRange {
  readonly from: number;
  readonly to: number;
  readonly className: string;
}

export type HighlightFn = (code: string, language: string | null) => readonly HighlightRange[];

export function highlightPlugin(highlight: () => HighlightFn | undefined): Plugin<DecorationSet> {
  const cache = new WeakMap<PMNode, readonly HighlightRange[]>();
  const build = (doc: PMNode): DecorationSet => {
    const fn = highlight();
    if (!fn) return DecorationSet.empty;
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return true;
      let ranges = cache.get(node);
      if (!ranges) {
        ranges = fn(node.textContent, node.attrs['language'] ?? null);
        cache.set(node, ranges);
      }
      for (const r of ranges) {
        const from = Math.max(0, r.from);
        const to = Math.min(node.content.size, r.to);
        if (to > from && /^[\w -]+$/.test(r.className)) decos.push(Decoration.inline(pos + 1 + from, pos + 1 + to, { class: r.className }));
      }
      return false;
    });
    return DecorationSet.create(doc, decos);
  };
  return new Plugin<DecorationSet>({
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, set) => (tr.docChanged || tr.getMeta('salmonHighlight') ? build(tr.doc) : set),
    },
    props: {
      decorations(state) {
        return this.getState(state) ?? null;
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Checklist toggling and the keydown safeguard (Mention integration)
// ---------------------------------------------------------------------------

export function interactionPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        // Mention handles keys in the capture phase and prevents them; ProseMirror must skip those.
        keydown: (_view, event) => event.defaultPrevented,
        mousedown: (view, event) => {
          const target = event.target as HTMLElement | null;
          if (!target || target.nodeName !== 'LI' || !target.hasAttribute('data-checked') || !view.editable) return false;
          const pos = view.posAtDOM(target, 0) - 1;
          const node = view.state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'task_item') return false;
          event.preventDefault();
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs['checked'] }));
          return true;
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Exact undo limit (`undoLimit`): prosemirror-history trims its stack
// lazily, so the engine keeps a floor below which undo stops.
// ---------------------------------------------------------------------------

export const undoFloorKey = new PluginKey<number>('salmonUndoFloor');

export function undoLimitPlugin(limit: number): Plugin<number> {
  return new Plugin<number>({
    key: undoFloorKey,
    state: {
      init: () => 0,
      apply: (tr, floor, _old, state) => (tr.docChanged && !isHistoryTransaction(tr) && tr.getMeta('addToHistory') !== false ? Math.max(0, undoDepth(state) - limit) : floor),
    },
  });
}

export function canUndo(state: EditorState): boolean {
  return undoDepth(state) > (undoFloorKey.getState(state) ?? 0);
}

export const limitedUndo: Command = (state, dispatch) => canUndo(state) && undo(state, dispatch);
