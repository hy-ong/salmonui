// Derived toolbar state (`onToolbarStateChange`): a small plain
// object computed after each transaction; React reads it through
// useSyncExternalStore with narrow selectors.
import { redoDepth } from 'prosemirror-history';
import { NodeSelection } from 'prosemirror-state';
import { isInTable } from 'prosemirror-tables';
import { ancestor, markActive, markValue } from './commands.js';
import { canUndo, characterCount, isEmptyDoc, painterKey } from './plugins.js';
import type { RichTextEngine } from './core.js';
import type { RichTextToolbarState } from './types.js';

const MARKS = ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'code'] as const;

export function toolbarState(engine: RichTextEngine): RichTextToolbarState {
  const state = engine.state;
  const { schema, selection } = state;
  const marks: Record<string, boolean> = {};
  for (const name of MARKS) marks[name] = schema.marks[name] ? markActive(state, schema.marks[name]) : false;
  const parent = selection.$from.parent;
  const block =
    parent.type.name === 'heading' ? `h${parent.attrs['level']}` : parent.type.name === 'code_block' ? 'code' : ancestor(state, (n) => n.type.name === 'blockquote') ? 'blockquote' : 'p';
  const list = ancestor(state, (n) => /^(bullet|ordered|task)_list$/.test(n.type.name));
  const node = selection instanceof NodeSelection ? selection.node.type.name : ancestor(state, (n) => n.type.name === 'figure') ? 'figure' : null;
  const find = engine.findState;
  const suggest = engine.suggest;
  return {
    marks: marks as RichTextToolbarState['marks'],
    fontFamily: markValue(state, schema.marks['fontFamily']!),
    fontSize: markValue(state, schema.marks['fontSize']!),
    color: markValue(state, schema.marks['color']!),
    backgroundColor: markValue(state, schema.marks['backgroundColor']!),
    block,
    textAlign: (parent.attrs['textAlign'] as RichTextToolbarState['textAlign']) ?? null,
    lineHeight: (parent.attrs['lineHeight'] as string | null) ?? null,
    list: list ? (list.node.type.name.split('_')[0] as 'bullet' | 'ordered' | 'task') : null,
    link: linkHref(engine),
    inTable: isInTable(state),
    node: node as RichTextToolbarState['node'],
    canUndo: engine.historyCommands ? engine.historyCommands.undo(state) : canUndo(state),
    canRedo: engine.historyCommands ? engine.historyCommands.redo(state) : redoDepth(state) > 0,
    count: characterCount(state.doc),
    empty: isEmptyDoc(state.doc),
    selectionEmpty: selection.empty,
    painter: Boolean(painterKey.getState(state)),
    findCount: find?.matches.length ?? 0,
    findIndex: find?.index ?? -1,
    suggest: suggest ? { id: suggest.id, query: suggest.query, from: suggest.from } : null,
  };
}

function linkHref(engine: RichTextEngine): string | null {
  const state = engine.state;
  const type = state.schema.marks['link']!;
  const { $from, from, to, empty } = state.selection;
  const mark = type.isInSet(empty ? $from.marks() : ($from.nodeAfter?.marks ?? [])) ?? (empty ? type.isInSet($from.nodeBefore?.marks ?? []) : null);
  if (mark) return mark.attrs['href'] as string;
  if (!empty && state.doc.rangeHasMark(from, to, type)) {
    let href: string | null = null;
    state.doc.nodesBetween(from, to, (n) => {
      href ??= (type.isInSet(n.marks)?.attrs['href'] as string | undefined) ?? null;
    });
    return href;
  }
  return null;
}
