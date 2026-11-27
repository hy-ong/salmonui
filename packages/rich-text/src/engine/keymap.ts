// Key bindings and input rules. `keyBindings` overrides the
// default table.
import { baseKeymap, chainCommands, createParagraphNear, exitCode, liftEmptyBlock, newlineInCode, splitBlock } from 'prosemirror-commands';
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { splitListItem } from 'prosemirror-schema-list';
import { goToNextCell } from 'prosemirror-tables';
import type { Command, Plugin } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import type { RichTextKeyBindings } from './types.js';

/** Default shortcut table: key -> command or action id. */
export const DEFAULT_KEY_BINDINGS: Readonly<Record<string, string>> = Object.freeze({
  'Mod-b': 'bold',
  'Mod-i': 'italic',
  'Mod-u': 'underline',
  'Mod-Shift-s': 'strike',
  'Mod-Shift-u': 'uppercase',
  'Mod-Shift-l': 'lowercase',
  'Mod-Shift-=': 'superscript',
  'Mod-=': 'subscript',
  'Mod-`': 'code',
  'Mod-k': 'link',
  'Mod-Shift-i': 'image',
  'Mod-Shift-e': 'table',
  'Mod-l': 'alignLeft',
  'Mod-e': 'alignCenter',
  'Mod-r': 'alignRight',
  'Mod-j': 'alignJustify',
  'Mod-Shift-o': 'orderedList',
  'Mod-Alt-o': 'unorderedList',
  'Mod-]': 'indent',
  'Mod-[': 'outdent',
  'Mod-z': 'undo',
  'Mod-y': 'redo',
  'Mod-Shift-z': 'redo',
  'Mod-Shift-r': 'clearFormat',
  'Mod-Shift-f': 'fullscreen',
  'Mod-Shift-h': 'sourceCode',
  'Alt-Shift-c': 'copyFormat',
  'Alt-Shift-v': 'applyFormat',
  'Mod-Alt-0': 'paragraph',
  'Mod-Alt-1': 'heading1',
  'Mod-Alt-2': 'heading2',
  'Mod-Alt-3': 'heading3',
  Escape: 'cancelFormatPainter',
});

export interface KeymapOptions {
  readonly enterKey?: 'p' | 'div' | 'br' | undefined;
  readonly shiftEnterKey?: 'p' | 'div' | 'br' | undefined;
  readonly tabKey?: 'indent' | 'focus' | undefined;
  readonly keyBindings?: RichTextKeyBindings | undefined;
  readonly extensionBindings?: readonly Readonly<Record<string, string | Command>>[];
  /** Runs a command or action id; false when unknown or not applied. */
  run(id: string): boolean;
}

export function keymaps(schema: Schema, options: KeymapOptions): Plugin[] {
  const table: Record<string, Command> = {};
  const merged: Record<string, string | false | (() => boolean)> = { ...DEFAULT_KEY_BINDINGS, ...options.keyBindings };
  for (const [key, value] of Object.entries(merged)) {
    if (value === false) continue;
    table[key] = typeof value === 'function' ? () => value() : () => options.run(value);
  }
  const hardBreak: Command = (state, dispatch) => {
    const br = schema.nodes['hard_break'];
    if (!br || state.selection.$from.parent.type.spec.code) return false;
    dispatch?.(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
    return true;
  };
  const listItem = schema.nodes['list_item']!;
  const taskItem = schema.nodes['task_item']!;
  const paragraphBreak = chainCommands(newlineInCode, splitListItem(listItem), splitListItem(taskItem), createParagraphNear, liftEmptyBlock, splitBlock);
  const enter = options.enterKey === 'br' ? chainCommands(newlineInCode, hardBreak) : paragraphBreak;
  const shiftEnter = options.shiftEnterKey === 'p' || options.shiftEnterKey === 'div' ? paragraphBreak : chainCommands(exitCode, hardBreak);
  const editing: Record<string, Command> = { Enter: enter, 'Shift-Enter': shiftEnter };
  if (options.tabKey === 'indent') {
    editing['Tab'] = chainCommands(goToNextCell(1), () => options.run('indent'), () => true);
    editing['Shift-Tab'] = chainCommands(goToNextCell(-1), () => options.run('outdent'), () => true);
  }
  const extensions = (options.extensionBindings ?? []).map((bindings) =>
    keymap(Object.fromEntries(Object.entries(bindings).map(([key, value]) => [key, typeof value === 'string' ? () => options.run(value) : value]))),
  );
  return [...extensions, keymap(table), keymap(editing), keymap(baseKeymap)];
}

export function rules(schema: Schema, extra: readonly InputRule[]): Plugin {
  const n = schema.nodes;
  const list: InputRule[] = [
    wrappingInputRule(/^\s*>\s$/, n['blockquote']!),
    wrappingInputRule(/^\s*([-+*])\s$/, n['bullet_list']!),
    wrappingInputRule(/^(\d+)\.\s$/, n['ordered_list']!, (m) => ({ start: Number(m[1]) }), (m, node) => node.childCount + Number(node.attrs['start']) === Number(m[1])),
    wrappingInputRule(/^\[( |x)?\]\s$/, n['task_list']!),
    textblockTypeInputRule(/^(#{1,6})\s$/, n['heading']!, (m) => ({ level: m[1]!.length })),
    textblockTypeInputRule(/^```([\w+#-]*)\s$/, n['code_block']!, (m) => ({ language: m[1] || null })),
    ...extra,
  ];
  return inputRules({ rules: list });
}
