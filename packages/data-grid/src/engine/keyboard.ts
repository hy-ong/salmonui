// Keymap registry. Key combos resolve to keyboard command names in
// the core, without a DOM, so the binding table is unit-testable and every
// feature registers behavior against a command name instead of a key.
// Bindings of optional features (editing, grouping, clipboard, print,
// column menu, pager) are always part of the table; a binding
// without a registered handler is simply not consumed.

/** Where focus is when the key is pressed. `global` bindings work from anywhere in the document. */
export type KeyContext = 'body' | 'header' | 'pager' | 'groupCaption' | 'groupChip' | 'editor' | 'global';

/** Structural subset of a DOM `KeyboardEvent` (the engine compiles without the DOM lib). */
export interface KeyEventLike {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export type KeyPlatform = 'mac' | 'other';

export interface KeyBinding {
  /** Keyboard command name, `<area>.<action>` (`focus.down`, `edit.begin`). */
  readonly command: string;
  /** Windows/Linux combos. `Mod` is Ctrl there and Cmd on macOS. */
  readonly keys: readonly string[];
  /** macOS combos when they differ (authoritative on Mac). */
  readonly mac?: readonly string[];
  readonly contexts: readonly KeyContext[];
  /** Feature that implements the behavior; informational. */
  readonly feature: 'focus' | 'selection' | 'sort' | 'columns' | 'pager' | 'grouping' | 'editing' | 'clipboard' | 'print' | 'menu' | 'rows' | 'grid';
  /** True for the core keyboard table rows; false for Salmon UI additions. */
  readonly core: boolean;
}

const B = (
  command: string,
  keys: readonly string[],
  contexts: readonly KeyContext[],
  feature: KeyBinding['feature'],
  core: boolean,
  mac?: readonly string[],
): KeyBinding => Object.freeze(mac ? { command, keys, mac, contexts, feature, core } : { command, keys, contexts, feature, core });

const BODY: readonly KeyContext[] = ['body'];
const HEADER: readonly KeyContext[] = ['header'];
const CELLS: readonly KeyContext[] = ['body', 'header'];
const PAGER: readonly KeyContext[] = ['pager'];
const REGIONS: readonly KeyContext[] = ['body', 'header', 'groupCaption', 'groupChip', 'pager'];
const EDITOR: readonly KeyContext[] = ['editor'];

/**
 * The complete default binding table: every core keyboard row (with the
 * macOS variant where it differs) plus the Salmon UI additions.
 */
export const DEFAULT_KEY_BINDINGS: readonly KeyBinding[] = Object.freeze([
  // Pager.
  B('pager.previous', ['PageUp', 'ArrowLeft'], PAGER, 'pager', true, ['ArrowLeft']),
  B('pager.next', ['PageDown', 'ArrowRight'], PAGER, 'pager', true, ['ArrowRight']),
  B('pager.first', ['Home', 'Ctrl+Alt+PageUp'], PAGER, 'pager', true, ['Home']),
  B('pager.last', ['End', 'Ctrl+Alt+PageDown'], PAGER, 'pager', true, ['End']),
  // Focus. Fn+Arrow on a Mac keyboard produces Home/End/PageUp/PageDown.
  B('focus.up', ['ArrowUp'], CELLS, 'focus', true),
  B('focus.down', ['ArrowDown'], CELLS, 'focus', true),
  B('focus.left', ['ArrowLeft'], CELLS, 'focus', true),
  B('focus.right', ['ArrowRight'], CELLS, 'focus', true),
  B('focus.home', ['Home'], CELLS, 'focus', true),
  B('focus.end', ['End'], CELLS, 'focus', true),
  B('focus.firstCell', ['Ctrl+Home'], CELLS, 'focus', true, ['Meta+Home']),
  B('focus.lastCell', ['Ctrl+End'], CELLS, 'focus', true, ['Meta+End']),
  B('grid.focusRoot', ['Alt+J'], ['global'], 'focus', true),
  B('grid.focusContent', ['Alt+W'], ['global'], 'focus', true),
  // Focus (Salmon UI).
  B('focus.pageUp', ['PageUp'], CELLS, 'focus', false),
  B('focus.pageDown', ['PageDown'], CELLS, 'focus', false),
  // Region cycle (toolbar, group panel, header, body, footer, pager): every grid context that holds focus.
  B('focus.nextRegion', ['F6'], REGIONS, 'focus', false),
  B('focus.previousRegion', ['Shift+F6'], REGIONS, 'focus', false),
  // Selection.
  B('selection.extendUp', ['Shift+ArrowUp'], BODY, 'selection', true),
  B('selection.extendDown', ['Shift+ArrowDown'], BODY, 'selection', true),
  B('selection.extendLeft', ['Shift+ArrowLeft'], BODY, 'selection', true),
  B('selection.extendRight', ['Shift+ArrowRight'], BODY, 'selection', true),
  B('selection.enterDown', ['Enter'], BODY, 'selection', true),
  B('selection.enterUp', ['Shift+Enter'], BODY, 'selection', true),
  B('selection.selectAll', ['Mod+A'], BODY, 'selection', true),
  B('selection.clear', ['Escape'], BODY, 'selection', true),
  // Selection (Salmon UI).
  B('selection.toggle', ['Space'], BODY, 'selection', false),
  B('selection.selectAllFiltered', ['Mod+Shift+A'], BODY, 'selection', false),
  B('selection.selectRow', ['Shift+Space'], BODY, 'selection', false),
  B('selection.selectColumn', ['Ctrl+Space'], BODY, 'selection', false),
  // Grouping.
  B('group.collapseAll', ['Mod+ArrowUp'], BODY, 'grouping', true),
  B('group.expandAll', ['Mod+ArrowDown'], BODY, 'grouping', true),
  B('header.group', ['Ctrl+Space'], HEADER, 'grouping', true),
  B('group.toggle', ['Enter'], ['groupCaption'], 'grouping', true),
  B('group.collapse', ['ArrowLeft'], ['groupCaption'], 'grouping', false),
  B('group.expand', ['ArrowRight'], ['groupCaption'], 'grouping', false),
  B('groupChip.moveLeft', ['Alt+ArrowLeft'], ['groupChip'], 'grouping', false),
  B('groupChip.moveRight', ['Alt+ArrowRight'], ['groupChip'], 'grouping', false),
  B('groupChip.remove', ['Delete', 'Backspace'], ['groupChip'], 'grouping', false),
  // Row reorder, the keyboard alternative to row drag (Salmon UI; the row drag feature registers the handlers).
  B('row.moveUp', ['Alt+Shift+ArrowUp'], BODY, 'rows', false),
  B('row.moveDown', ['Alt+Shift+ArrowDown'], BODY, 'rows', false),
  // Print and clipboard.
  B('grid.print', ['Mod+P'], CELLS, 'print', true),
  B('clipboard.copy', ['Mod+C'], BODY, 'clipboard', true),
  B('clipboard.copyWithHeaders', ['Ctrl+Shift+H'], BODY, 'clipboard', true),
  B('clipboard.paste', ['Mod+V'], BODY, 'clipboard', false),
  // Editing.
  B('edit.begin', ['F2'], BODY, 'editing', true),
  B('edit.add', ['Insert'], BODY, 'editing', true, ['Ctrl+Meta+Enter']),
  B('edit.delete', ['Delete'], BODY, 'editing', true),
  B('edit.undo', ['Mod+Z'], BODY, 'editing', true),
  B('edit.redo', ['Mod+Y', 'Mod+Shift+Z'], BODY, 'editing', true),
  B('edit.save', ['Enter'], EDITOR, 'editing', true),
  B('edit.saveUp', ['Shift+Enter'], EDITOR, 'editing', true),
  B('edit.next', ['Tab'], EDITOR, 'editing', true),
  B('edit.previous', ['Shift+Tab'], EDITOR, 'editing', true),
  B('edit.cancel', ['Escape'], EDITOR, 'editing', true),
  B('edit.saveInPlace', ['Mod+Enter'], EDITOR, 'editing', false),
  // Filter, column menu, header.
  B('header.openFilterMenu', ['Alt+ArrowDown'], HEADER, 'menu', true),
  B('header.openColumnMenu', ['Shift+Alt+ArrowDown'], HEADER, 'menu', false),
  B('header.moveLeft', ['Mod+ArrowLeft', 'Alt+ArrowLeft'], HEADER, 'columns', true),
  B('header.moveRight', ['Mod+ArrowRight', 'Alt+ArrowRight'], HEADER, 'columns', true),
  B('header.pinStart', ['Alt+Shift+ArrowLeft'], HEADER, 'columns', false),
  B('header.pinEnd', ['Alt+Shift+ArrowRight'], HEADER, 'columns', false),
  B('header.unpin', ['Alt+Shift+ArrowUp'], HEADER, 'columns', false),
  B('header.resizeNarrower', ['Ctrl+Alt+ArrowLeft'], HEADER, 'columns', false),
  B('header.resizeWider', ['Ctrl+Alt+ArrowRight'], HEADER, 'columns', false),
  B('header.autoSize', ['Ctrl+Alt+Enter'], HEADER, 'columns', false),
  B('header.sort', ['Enter'], HEADER, 'sort', true),
  B('header.sortMulti', ['Mod+Enter'], HEADER, 'sort', true),
  B('header.removeSort', ['Shift+Enter'], HEADER, 'sort', true),
  B('header.activate', ['Space'], HEADER, 'selection', false),
  B('grid.contextMenu', ['Shift+F10', 'ContextMenu'], ['body', 'header', 'pager'], 'menu', true),
]);

/** User overrides: `{ [command]: combos }` (keys for the current platform). */
export type KeyBindingOverrides = Readonly<Record<string, readonly string[]>>;

const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const;
const KEY_ALIASES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Esc: 'Escape',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Del: 'Delete',
  Apps: 'ContextMenu',
};

function normalizeKey(key: string): string {
  const alias = KEY_ALIASES[key];
  if (alias) return alias;
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Canonical combo string: modifiers in `Ctrl+Meta+Alt+Shift` order, then the
 * key. `Mod` resolves to `Meta` on macOS and `Ctrl` elsewhere; `Cmd`/`Command`
 * mean `Meta`, `Control` means `Ctrl`, `Option` means `Alt`.
 */
export function normalizeKeyCombo(combo: string, platform: KeyPlatform = 'other'): string {
  const parts = combo.split('+');
  // "Ctrl++" style: an empty trailing part means the key is "+".
  let key = parts.pop() ?? '';
  if (key === '' && parts.length && parts[parts.length - 1] === '') {
    parts.pop();
    key = '+';
  }
  const mods = new Set<string>();
  for (const raw of parts) {
    const m = raw.trim().toLowerCase();
    if (m === 'mod') mods.add(platform === 'mac' ? 'Meta' : 'Ctrl');
    else if (m === 'ctrl' || m === 'control') mods.add('Ctrl');
    else if (m === 'meta' || m === 'cmd' || m === 'command') mods.add('Meta');
    else if (m === 'alt' || m === 'option') mods.add('Alt');
    else if (m === 'shift') mods.add('Shift');
  }
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m));
  return [...ordered, normalizeKey(key.trim() === '' ? key : key.trim())].join('+');
}

/**
 * Canonical combo of a key event. Letters are read from `code` when Alt is
 * held (macOS Option produces composed characters: Alt+J is `∆`) and from
 * `key` otherwise, so Ctrl+A follows the keyboard layout.
 */
export function keyComboFromEvent(event: KeyEventLike): string {
  let key = event.key;
  const code = event.code ?? '';
  if (event.altKey && code.startsWith('Key') && code.length === 4) key = code.slice(3);
  else if (event.altKey && code.startsWith('Digit') && code.length === 6) key = code.slice(5);
  key = normalizeKey(key);
  let out = '';
  if (event.ctrlKey) out += 'Ctrl+';
  if (event.metaKey) out += 'Meta+';
  if (event.altKey) out += 'Alt+';
  if (event.shiftKey) out += 'Shift+';
  return out + key;
}

export interface KeymapOptions {
  readonly platform?: KeyPlatform;
  /** Replaces the combos of the named commands (Custom Bindings). An empty array unbinds. */
  readonly bindings?: KeyBindingOverrides;
  readonly table?: readonly KeyBinding[];
  readonly warn?: (code: string, message: string) => void;
}

export interface Keymap {
  readonly platform: KeyPlatform;
  /** Keyboard command bound to the event's combo in `context`, or null. */
  resolve(event: KeyEventLike, context: KeyContext): string | null;
  resolveCombo(combo: string, context: KeyContext): string | null;
  /** Effective canonical combos of a command on this platform. */
  combosOf(command: string): readonly string[];
  readonly bindings: readonly KeyBinding[];
}

/**
 * Compiles the binding table for one platform. User bindings replace the
 * combos of their command; a user combo that a built-in binding also uses in
 * the same context logs a development warning and wins (the built-in loses
 * that combo in that context).
 */
export function createKeymap(options: KeymapOptions = {}): Keymap {
  const platform = options.platform ?? 'other';
  const table = options.table ?? DEFAULT_KEY_BINDINGS;
  const overrides = options.bindings ?? {};
  const byContext = new Map<KeyContext, Map<string, string>>();
  const combos = new Map<string, string[]>();
  const userOwned = new Map<KeyContext, Set<string>>();
  const known = new Set(table.map((b) => b.command));

  const put = (context: KeyContext, combo: string, command: string, user: boolean): void => {
    let map = byContext.get(context);
    if (!map) {
      map = new Map();
      byContext.set(context, map);
    }
    if (user) {
      let owned = userOwned.get(context);
      if (!owned) {
        owned = new Set();
        userOwned.set(context, owned);
      }
      owned.add(combo);
      map.set(combo, command);
      return;
    }
    const existing = map.get(combo);
    if (userOwned.get(context)?.has(combo)) {
      if (existing !== command) {
        options.warn?.('key-binding-conflict', `Key binding "${combo}" for "${existing}" replaces the built-in binding of "${command}" in the ${context} context.`);
      }
      return;
    }
    if (existing === undefined) map.set(combo, command);
  };

  // User bindings first so the built-ins never overwrite them.
  for (const [command, keys] of Object.entries(overrides)) {
    if (!known.has(command)) options.warn?.('key-binding-unknown', `Key binding for unknown keyboard command "${command}".`);
    const contexts = table.find((b) => b.command === command)?.contexts ?? (['body'] as const);
    const normalized = keys.map((k) => normalizeKeyCombo(k, platform));
    combos.set(command, normalized);
    for (const context of contexts) for (const combo of normalized) put(context, combo, command, true);
  }
  for (const binding of table) {
    if (Object.prototype.hasOwnProperty.call(overrides, binding.command)) continue;
    const keys = platform === 'mac' && binding.mac ? binding.mac : binding.keys;
    const normalized = keys.map((k) => normalizeKeyCombo(k, platform));
    combos.set(binding.command, [...(combos.get(binding.command) ?? []), ...normalized]);
    for (const context of binding.contexts) for (const combo of normalized) put(context, combo, binding.command, false);
  }
  // Built-ins that lost a combo to a user binding: drop it from combosOf().
  for (const [context, owned] of userOwned) {
    for (const binding of table) {
      if (!binding.contexts.includes(context) || Object.prototype.hasOwnProperty.call(overrides, binding.command)) continue;
      const list = combos.get(binding.command);
      if (list && list.some((c) => owned.has(c) && byContext.get(context)?.get(c) !== binding.command)) {
        combos.set(binding.command, list.filter((c) => !owned.has(c) || byContext.get(context)?.get(c) === binding.command));
      }
    }
  }

  const resolveCombo = (combo: string, context: KeyContext): string | null => byContext.get(context)?.get(combo) ?? null;
  return Object.freeze({
    platform,
    resolve: (event: KeyEventLike, context: KeyContext) => resolveCombo(keyComboFromEvent(event), context),
    resolveCombo,
    combosOf: (command: string) => Object.freeze([...(combos.get(command) ?? [])]),
    bindings: table,
  });
}
