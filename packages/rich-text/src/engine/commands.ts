// Built-in commands over ProseMirror
// transactions. They run headless: `exec` applies a command to the engine
// state with or without a view.
import { lift, selectAll, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { redo } from 'prosemirror-history';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { NodeSelection, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable, mergeCells, splitCell, toggleHeaderRow } from 'prosemirror-tables';
import { Slice, type Mark, type MarkType, type Node as PMNode, type NodeType, type ResolvedPos, type Schema } from 'prosemirror-model';
import { applyPainter, findKey, findMatches, limitedUndo, painterKey, type FindState } from './plugins.js';
import type { RichTextCommands } from './types.js';

export interface CommandContext {
  readonly schema: Schema;
  state(): EditorState;
  exec(command: Command): boolean;
  parseSlice(html: string): Slice;
}

const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{0,2}\/|[^:]*$)/i;

export function safeHref(href: string): boolean {
  const trimmed = href.trim();
  return trimmed !== '' && SAFE_URL.test(trimmed) && !/^\s*(javascript|vbscript|data):/i.test(trimmed);
}

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

export function markValue(state: EditorState, type: MarkType): string | null {
  const { $from, empty } = state.selection;
  const marks: readonly Mark[] = empty ? (state.storedMarks ?? $from.marks()) : ($from.nodeAfter?.marks ?? $from.marks());
  return (type.isInSet(marks)?.attrs['value'] as string | undefined) ?? null;
}

export function ancestor(state: EditorState, test: (node: PMNode) => boolean): { node: PMNode; pos: number; depth: number } | null {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (test(node)) return { node, pos: $from.before(d), depth: d };
  }
  return null;
}

function linkRange($pos: ResolvedPos, type: MarkType): { from: number; to: number } | null {
  const parent = $pos.parent;
  const start = $pos.parentOffset;
  let index = $pos.index();
  let child = parent.maybeChild(index);
  if ((!child || !type.isInSet(child.marks)) && index > 0) child = parent.maybeChild(--index);
  if (!child) return null;
  const mark = type.isInSet(child.marks);
  if (!mark) return null;
  let from = $pos.start();
  for (let i = 0; i < index; i++) from += parent.child(i).nodeSize;
  let s = index;
  let fromPos = from;
  while (s > 0 && mark.isInSet(parent.child(s - 1).marks)) fromPos -= parent.child(--s).nodeSize;
  let e = index;
  let toPos = from + parent.child(index).nodeSize;
  while (e + 1 < parent.childCount && mark.isInSet(parent.child(e + 1).marks)) toPos += parent.child(++e).nodeSize;
  void start;
  return { from: fromPos, to: toPos };
}

function textblocks(state: EditorState, visit: (node: PMNode, pos: number) => void): void {
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      visit(node, pos);
      return false;
    }
    return true;
  });
}

function setTextAttr(name: string, value: unknown): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    textblocks(state, (node, pos) => {
      if (name in node.attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [name]: value });
    });
    if (!tr.docChanged) return false;
    dispatch?.(tr);
    return true;
  };
}

function styleMark(type: MarkType, value: string | null): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    const tr = state.tr;
    if (empty) {
      tr.removeStoredMark(type);
      if (value) tr.addStoredMark(type.create({ value }));
    } else {
      tr.removeMark(from, to, type);
      if (value) tr.addMark(from, to, type.create({ value }));
    }
    dispatch?.(tr);
    return true;
  };
}

function changeCase(upper: boolean): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return true;
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      const text = node.text!.slice(start - pos, end - pos);
      const next = upper ? text.toUpperCase() : text.toLowerCase();
      if (next !== text) tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), state.schema.text(next, node.marks));
      return false;
    });
    tr.setSelection(TextSelection.create(tr.doc, from, tr.mapping.map(to)));
    dispatch?.(tr);
    return true;
  };
}

function listAncestor(state: EditorState): { node: PMNode; pos: number } | null {
  return ancestor(state, (n) => n.type.name === 'bullet_list' || n.type.name === 'ordered_list' || n.type.name === 'task_list');
}

function toggleList(ctx: CommandContext, typeName: 'bullet_list' | 'ordered_list' | 'task_list', style: string | null | undefined): boolean {
  const { schema } = ctx;
  const type = schema.nodes[typeName]!;
  const item = schema.nodes[typeName === 'task_list' ? 'task_item' : 'list_item']!;
  const list = listAncestor(ctx.state());
  if (list) {
    if (list.node.type === type) {
      if (style !== undefined && style !== null && list.node.attrs['listStyle'] !== style) {
        return ctx.exec((state, dispatch) => (dispatch?.(state.tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, listStyle: style })), true));
      }
      return ctx.exec(liftListItem(item));
    }
    const sameItem = list.node.type.contentMatch.defaultType === item;
    if (sameItem) {
      return ctx.exec((state, dispatch) => (dispatch?.(state.tr.setNodeMarkup(list.pos, type, { ...(type.name === 'task_list' ? {} : { listStyle: style ?? null }), blockId: list.node.attrs['blockId'] ?? null })), true));
    }
    ctx.exec(liftListItem(list.node.type.contentMatch.defaultType!));
  }
  return ctx.exec(wrapInList(type, typeName === 'task_list' ? null : { listStyle: style ?? null }));
}

function insertNode(node: PMNode): Command {
  return (state, dispatch) => {
    const tr = state.tr.replaceSelectionWith(node);
    // After a block atom the caret goes into the next text block (one is added at the end).
    if (!node.isInline && tr.selection instanceof NodeSelection) {
      const end = tr.selection.to;
      if (!tr.doc.resolve(end).nodeAfter?.isTextblock) tr.insert(end, state.schema.nodes['paragraph']!.create());
      tr.setSelection(TextSelection.create(tr.doc, end + 1));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

function find(ctx: CommandContext): FindState | undefined {
  return findKey.getState(ctx.state());
}

function selectMatch(ctx: CommandContext, index: number): boolean {
  const state = find(ctx);
  if (!state || !state.matches.length) return false;
  const i = (index + state.matches.length) % state.matches.length;
  const m = state.matches[i]!;
  return ctx.exec((s, dispatch) => (dispatch?.(s.tr.setSelection(TextSelection.create(s.doc, m.from, m.to)).setMeta(findKey, { index: i, matches: state.matches }).scrollIntoView()), true));
}

export function createCommands(ctx: CommandContext): RichTextCommands {
  const { schema } = ctx;
  const m = schema.marks;
  const n = schema.nodes;
  const mark = (name: string) => () => (m[name] ? ctx.exec(toggleMark(m[name])) : false);
  const blockType = (type: NodeType, attrs: Record<string, unknown>) =>
    ctx.exec((state, dispatch) => {
      const tr = state.tr;
      textblocks(state, (node, pos) => {
        if (node.type.spec.code && type !== node.type) return;
        const keep = 'textAlign' in node.attrs ? { textAlign: node.attrs['textAlign'], lineHeight: node.attrs['lineHeight'], indent: node.attrs['indent'] } : {};
        const next = { ...(type.spec.code ? {} : keep), ...attrs, blockId: node.attrs['blockId'] ?? null };
        if (type.validContent(node.content) || type.spec.code) tr.setBlockType(pos, pos + node.nodeSize, type, next);
      });
      if (!tr.docChanged) return setBlockType(type, attrs)(state, dispatch);
      dispatch?.(tr);
      return true;
    });
  const inParent = (name: string) => ctx.state().selection.$from.parent.type.name === name;
  const cmds: RichTextCommands = {
    bold: mark('bold'),
    italic: mark('italic'),
    underline: mark('underline'),
    strike: mark('strike'),
    subscript: mark('subscript'),
    superscript: mark('superscript'),
    code: mark('code'),
    uppercase: () => ctx.exec(changeCase(true)),
    lowercase: () => ctx.exec(changeCase(false)),
    fontFamily: (value) => ctx.exec(styleMark(m['fontFamily']!, value)),
    fontSize: (value) => ctx.exec(styleMark(m['fontSize']!, value)),
    color: (value) => ctx.exec(styleMark(m['color']!, value)),
    backgroundColor: (value) => ctx.exec(styleMark(m['backgroundColor']!, value)),
    paragraph: () => blockType(n['paragraph']!, {}),
    heading: (level) => {
      const parent = ctx.state().selection.$from.parent;
      if (parent.type === n['heading'] && parent.attrs['level'] === level) return blockType(n['paragraph']!, {});
      return blockType(n['heading']!, { level });
    },
    blockquote: () => (ancestor(ctx.state(), (node) => node.type === n['blockquote']) ? ctx.exec(lift) : ctx.exec(wrapIn(n['blockquote']!))),
    codeBlock: (language) => (inParent('code_block') ? blockType(n['paragraph']!, {}) : blockType(n['code_block']!, { language: language ?? null })),
    setCodeLanguage: (language) => {
      const block = ancestor(ctx.state(), (node) => node.type === n['code_block']);
      if (!block) return false;
      return ctx.exec((state, dispatch) => (dispatch?.(state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, language })), true));
    },
    textAlign: (align) => ctx.exec(setTextAttr('textAlign', align)),
    lineHeight: (value) => ctx.exec(setTextAttr('lineHeight', value)),
    indent: () => {
      const state = ctx.state();
      const item = ancestor(state, (node) => node.type === n['list_item'] || node.type === n['task_item']);
      if (item) return ctx.exec(sinkListItem(item.node.type));
      const parent = state.selection.$from.parent;
      return ctx.exec(setTextAttr('indent', Math.min(8, ((parent.attrs['indent'] as number) ?? 0) + 1)));
    },
    outdent: () => {
      const state = ctx.state();
      const item = ancestor(state, (node) => node.type === n['list_item'] || node.type === n['task_item']);
      if (item) return ctx.exec(liftListItem(item.node.type));
      const indent = (state.selection.$from.parent.attrs['indent'] as number) ?? 0;
      return indent > 0 ? ctx.exec(setTextAttr('indent', indent - 1)) : false;
    },
    bulletList: (style) => toggleList(ctx, 'bullet_list', style),
    orderedList: (style) => toggleList(ctx, 'ordered_list', style),
    taskList: () => toggleList(ctx, 'task_list', undefined),
    toggleTask: () => {
      const item = ancestor(ctx.state(), (node) => node.type === n['task_item']);
      if (!item) return false;
      return ctx.exec((state, dispatch) => (dispatch?.(state.tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked: !item.node.attrs['checked'] })), true));
    },
    horizontalRule: () => ctx.exec(insertNode(n['horizontal_rule']!.create())),
    clearFormat: () =>
      ctx.exec((state, dispatch) => {
        const { from, to } = state.selection;
        const tr = state.tr;
        for (const [name, type] of Object.entries(m)) if (name !== 'link') tr.removeMark(from, to, type);
        if (state.selection.empty) tr.setStoredMarks([]);
        textblocks(state, (node, pos) => {
          if (node.type.spec.code) return;
          tr.setNodeMarkup(pos, n['paragraph'], { blockId: node.attrs['blockId'] ?? null });
        });
        dispatch?.(tr);
        return true;
      }),
    setLink: (link) => {
      if (!safeHref(link.href)) return false;
      const type = m['link']!;
      const attrs = { href: link.href.trim(), title: link.title || null, target: link.target === '_blank' ? '_blank' : null };
      return ctx.exec((state, dispatch) => {
        const { from, to, empty, $from } = state.selection;
        const tr = state.tr;
        if (empty) {
          const range = linkRange($from, type);
          if (range) {
            if (link.text !== undefined && link.text !== state.doc.textBetween(range.from, range.to)) {
              tr.insertText(link.text, range.from, range.to);
              tr.addMark(range.from, range.from + link.text.length, type.create(attrs));
            } else tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, type.create(attrs));
          } else {
            const text = link.text || link.href;
            tr.insert(from, schema.text(text, [...$from.marks().filter((mk) => mk.type !== type), type.create(attrs)]));
            tr.setSelection(TextSelection.create(tr.doc, from + text.length));
          }
        } else {
          if (link.text !== undefined && link.text !== '' && link.text !== state.doc.textBetween(from, to)) {
            tr.insertText(link.text, from, to);
            tr.addMark(from, from + link.text.length, type.create(attrs));
          } else tr.removeMark(from, to, type).addMark(from, to, type.create(attrs));
        }
        dispatch?.(tr);
        return true;
      });
    },
    unsetLink: () =>
      ctx.exec((state, dispatch) => {
        const type = m['link']!;
        const { from, to, empty, $from } = state.selection;
        const range = empty ? linkRange($from, type) : { from, to };
        if (!range || !state.doc.rangeHasMark(range.from, range.to, type)) return false;
        dispatch?.(state.tr.removeMark(range.from, range.to, type));
        return true;
      }),
    insertImage: (image) => {
      const attrs = { src: image.src, alt: image.alt ?? '', title: image.title ?? null, width: image.width ?? null, height: image.height ?? null };
      if (image.caption) return ctx.exec(insertNode(n['figure']!.create(attrs, schema.text(image.caption))));
      return ctx.exec(insertNode(n['image']!.create(attrs)));
    },
    updateImage: (image) =>
      ctx.exec((state, dispatch) => {
        const sel = state.selection;
        let pos = -1;
        let node: PMNode | null = null;
        if (sel instanceof NodeSelection && (sel.node.type === n['image'] || sel.node.type === n['figure'])) {
          pos = sel.from;
          node = sel.node;
        } else {
          const fig = ancestor(state, (x) => x.type === n['figure']);
          if (fig) ({ pos, node } = fig);
        }
        if (!node) return false;
        const { caption, ...rest } = image;
        const attrs = { ...node.attrs, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) };
        const tr = state.tr.setNodeMarkup(pos, undefined, attrs);
        if (sel instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, pos));
        dispatch?.(tr);
        void caption;
        return true;
      }),
    insertAudio: (media) => ctx.exec(insertNode(n['audio']!.create({ src: media.src }))),
    insertVideo: (media) => ctx.exec(insertNode(n['video']!.create({ src: media.src, width: media.width ?? null, height: media.height ?? null }))),
    insertEmbed: (media) => ctx.exec(insertNode(n['embed']!.create({ src: media.src, width: media.width ?? null, height: media.height ?? null }))),
    deleteNode: () =>
      ctx.exec((state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) return false;
        dispatch?.(state.tr.deleteSelection());
        return true;
      }),
    insertTable: ({ rows, cols, headerRow }) => {
      const r = Math.max(1, Math.min(50, Math.floor(rows)));
      const c = Math.max(1, Math.min(20, Math.floor(cols)));
      const row = (header: boolean) => n['table_row']!.create(null, Array.from({ length: c }, () => n[header ? 'table_header' : 'table_cell']!.createAndFill()!));
      const table = n['table']!.create(null, Array.from({ length: r }, (_, i) => row(Boolean(headerRow) && i === 0)));
      return ctx.exec((state, dispatch) => {
        const tr = state.tr.replaceSelectionWith(table);
        // Caret into the first cell.
        const start = tr.selection.from;
        let pos = -1;
        tr.doc.nodesBetween(Math.max(0, start - table.nodeSize - 2), Math.min(tr.doc.content.size, start + 2), (node, p) => {
          if (pos < 0 && node === table) pos = p;
          return pos < 0;
        });
        if (pos >= 0) tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 4)));
        dispatch?.(tr.scrollIntoView());
        return true;
      });
    },
    addRowBefore: () => ctx.exec(addRowBefore),
    addRowAfter: () => ctx.exec(addRowAfter),
    deleteRow: () => ctx.exec(deleteRow),
    addColumnBefore: () => ctx.exec(addColumnBefore),
    addColumnAfter: () => ctx.exec(addColumnAfter),
    deleteColumn: () => ctx.exec(deleteColumn),
    mergeCells: () => ctx.exec(mergeCells),
    splitCell: () => ctx.exec(splitCell),
    toggleHeaderRow: () => ctx.exec(toggleHeaderRow),
    setTableStyle: (style) => {
      if (!isInTable(ctx.state())) return false;
      const table = ancestor(ctx.state(), (node) => node.type === n['table']);
      if (!table) return false;
      return ctx.exec((state, dispatch) => (dispatch?.(state.tr.setNodeMarkup(table.pos, undefined, { ...table.node.attrs, variant: style })), true));
    },
    deleteTable: () => ctx.exec(deleteTable),
    insertText: (text) => ctx.exec((state, dispatch) => (dispatch?.(state.tr.insertText(text).scrollIntoView()), true)),
    insertHtml: (html, options) => {
      const parsed = ctx.parseSlice(html);
      const slice = options?.blocks ? new Slice(parsed.content, 0, 0) : parsed;
      return ctx.exec((state, dispatch) => (dispatch?.(state.tr.replaceSelection(slice).scrollIntoView()), true));
    },
    selectAll: () => ctx.exec(selectAll),
    undo: () => ctx.exec(limitedUndo),
    redo: () => ctx.exec(redo),
    find: (query, options = {}) => {
      ctx.exec((state, dispatch) => (dispatch?.(state.tr.setMeta(findKey, { query, options, matches: findMatches(state.doc, query, options) })), true));
      const found = find(ctx);
      if (found?.matches.length) selectMatch(ctx, 0);
      return found?.matches.length ?? 0;
    },
    findNext: () => selectMatch(ctx, (find(ctx)?.index ?? -1) + 1),
    findPrevious: () => selectMatch(ctx, (find(ctx)?.index ?? 1) - 1),
    replace: (text) => {
      const state = find(ctx);
      if (!state || state.index < 0) return false;
      const match = state.matches[state.index]!;
      const index = state.index;
      ctx.exec((s, dispatch) => (dispatch?.(s.tr.insertText(text, match.from, match.to)), true));
      const after = find(ctx);
      if (after?.matches.length) selectMatch(ctx, Math.min(index, after.matches.length - 1));
      return true;
    },
    replaceAll: (text) => {
      const state = find(ctx);
      if (!state || !state.matches.length) return 0;
      const count = state.matches.length;
      ctx.exec((s, dispatch) => {
        const tr = s.tr;
        for (let i = state.matches.length - 1; i >= 0; i--) tr.insertText(text, state.matches[i]!.from, state.matches[i]!.to);
        dispatch?.(tr);
        return true;
      });
      return count;
    },
    clearFind: () => ctx.exec((state, dispatch) => (dispatch?.(state.tr.setMeta(findKey, null)), true)),
    copyFormat: (sticky = false) =>
      ctx.exec((state, dispatch) => {
        const { $from } = state.selection;
        const marks = state.selection.empty ? (state.storedMarks ?? $from.marks()) : ($from.nodeAfter?.marks ?? $from.marks());
        const parent = $from.parent;
        const block = parent.isTextblock && !parent.type.spec.code ? { type: parent.type, attrs: { ...parent.attrs } } : null;
        dispatch?.(state.tr.setMeta(painterKey, { marks, block, sticky }));
        return true;
      }),
    applyFormat: () => {
      const painter = painterKey.getState(ctx.state());
      if (!painter || ctx.state().selection.empty) return false;
      return ctx.exec((state, dispatch) => (dispatch?.(applyPainter(state, painter)), true));
    },
    cancelFormatPainter: () => {
      if (!painterKey.getState(ctx.state())) return false;
      return ctx.exec((state, dispatch) => (dispatch?.(state.tr.setMeta(painterKey, null)), true));
    },
  };
  return cmds;
}
