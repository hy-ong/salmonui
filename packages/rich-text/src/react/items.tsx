// Toolbar items: the built-in item
// table, their pressed and disabled selectors over the editor store, and the
// toolbar with overflow ('menu' | 'scroll' | 'wrap').
import { createContext, use, useLayoutEffect, useRef, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { ToggleButton } from '@salmonui/buttons/button';
import { MenuButton, type MenuActionEvent, type MenuItemData } from '@salmonui/buttons/menu';
import { Icon } from './icons.js';
import { ToolbarShell } from './overlay.js';
import { useEditorState, type EditorSnapshot, type EditorStore } from './store.js';
import type { RichTextEditorLocaleText } from './locale.js';
import type { RichTextToolbarCustomItem, RichTextToolbarItem } from './types.js';

export interface ToolbarContextValue {
  readonly store: EditorStore;
  readonly locale: RichTextEditorLocaleText;
  /** Runs an item: fires onToolbarItemClick, then the command or UI action. */
  perform(id: string, ...args: unknown[]): void;
  readonly custom: (item: RichTextToolbarCustomItem) => void;
  /** Toolbar items contributed by extensions, by id. */
  readonly extensionItems: Readonly<Record<string, RichTextToolbarCustomItem>>;
  readonly locked: boolean;
  readonly sourceMode: boolean;
  readonly fullscreen: boolean;
  readonly fontFamilies: readonly { readonly label: string; readonly value: string }[];
  readonly fontSizes: readonly string[];
  readonly colors: readonly { readonly label: string; readonly value: string }[];
}

export const ToolbarContext = createContext<ToolbarContextValue | null>(null);

type Sel = (s: EditorSnapshot, ctx: ToolbarContextValue) => boolean;

interface Def {
  readonly kind: 'toggle' | 'button' | 'menu';
  readonly icon?: string;
  readonly pressed?: Sel;
  readonly disabled?: Sel;
  /** Allowed while the source view is shown. */
  readonly inSource?: boolean;
  readonly menu?: (ctx: ToolbarContextValue) => readonly { id: string; label: string; args: readonly unknown[]; command: string }[];
}

const mark = (name: keyof EditorSnapshot['marks']): Def => ({ kind: 'toggle', pressed: (s) => s.marks[name] });
const noTable: Sel = (s) => !s.inTable;
const noLink: Sel = (s) => s.link === null;
const align = (value: string): Def => ({ kind: 'toggle', icon: `align${value[0]!.toUpperCase()}${value.slice(1)}`, pressed: (s) => s.textAlign === value });
const block = (value: string): Def => ({ kind: 'toggle', pressed: (s) => s.block === value });

const BLOCKS = ['paragraph', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'blockquote', 'codeBlock'] as const;

export const ITEMS: Readonly<Record<string, Def>> = {
  bold: mark('bold'),
  italic: mark('italic'),
  underline: mark('underline'),
  strikethrough: mark('strike'),
  subscript: mark('subscript'),
  superscript: mark('superscript'),
  inlineCode: mark('code'),
  uppercase: { kind: 'button' },
  lowercase: { kind: 'button' },
  fontName: {
    kind: 'menu',
    menu: (ctx) => [{ id: 'default', label: ctx.locale.defaultFont, args: [null], command: 'fontFamily' }, ...ctx.fontFamilies.map((f) => ({ id: f.value, label: f.label, args: [f.value], command: 'fontFamily' }))],
  },
  fontSize: {
    kind: 'menu',
    menu: (ctx) => [{ id: 'default', label: ctx.locale.defaultFont, args: [null], command: 'fontSize' }, ...ctx.fontSizes.map((v) => ({ id: v, label: v, args: [v], command: 'fontSize' }))],
  },
  fontColor: { kind: 'menu', menu: (ctx) => colorMenu(ctx, 'color') },
  backgroundColor: { kind: 'menu', menu: (ctx) => colorMenu(ctx, 'backgroundColor') },
  formats: { kind: 'menu', icon: 'paragraph', menu: (ctx) => BLOCKS.map((id) => ({ id, label: ctx.locale[id], args: [], command: id })) },
  paragraph: block('p'),
  heading1: block('h1'),
  heading2: block('h2'),
  heading3: block('h3'),
  heading4: block('h4'),
  heading5: block('h5'),
  heading6: block('h6'),
  blockquote: block('blockquote'),
  codeBlock: block('code'),
  alignments: {
    kind: 'menu',
    icon: 'alignLeft',
    menu: (ctx) => (['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'] as const).map((id) => ({ id, label: ctx.locale[id], args: [], command: id })),
  },
  alignLeft: align('left'),
  alignCenter: align('center'),
  alignRight: align('right'),
  alignJustify: align('justify'),
  orderedList: { kind: 'toggle', pressed: (s) => s.list === 'ordered' },
  unorderedList: { kind: 'toggle', pressed: (s) => s.list === 'bullet' },
  checklist: { kind: 'toggle', pressed: (s) => s.list === 'task' },
  indent: { kind: 'button' },
  outdent: { kind: 'button' },
  lineHeight: {
    kind: 'menu',
    menu: (ctx) => [{ id: 'default', label: ctx.locale.defaultFont, args: [null], command: 'lineHeight' }, ...['1', '1.15', '1.5', '2'].map((v) => ({ id: v, label: v, args: [v], command: 'lineHeight' }))],
  },
  horizontalRule: { kind: 'button' },
  clearFormat: { kind: 'button' },
  link: { kind: 'toggle', pressed: (s) => s.link !== null },
  openLink: { kind: 'button', disabled: noLink },
  editLink: { kind: 'button', icon: 'link', disabled: noLink },
  removeLink: { kind: 'button', disabled: noLink },
  image: { kind: 'button' },
  editImage: { kind: 'button' },
  audio: { kind: 'button' },
  video: { kind: 'button' },
  embed: { kind: 'button' },
  removeNode: { kind: 'button' },
  table: { kind: 'button' },
  addRowBefore: { kind: 'button', disabled: noTable },
  addRowAfter: { kind: 'button', disabled: noTable },
  deleteRow: { kind: 'button', disabled: noTable },
  addColumnBefore: { kind: 'button', disabled: noTable },
  addColumnAfter: { kind: 'button', disabled: noTable },
  deleteColumn: { kind: 'button', disabled: noTable },
  mergeCells: { kind: 'button', disabled: noTable },
  splitCell: { kind: 'button', disabled: noTable },
  toggleHeaderRow: { kind: 'button', disabled: noTable },
  tableStyle: {
    kind: 'menu',
    disabled: noTable,
    menu: (ctx) => [
      { id: 'none', label: ctx.locale.tableStyleNone, args: [null], command: 'setTableStyle' },
      { id: 'bordered', label: ctx.locale.tableStyleBordered, args: ['bordered'], command: 'setTableStyle' },
      { id: 'striped', label: ctx.locale.tableStyleStriped, args: ['striped'], command: 'setTableStyle' },
    ],
  },
  deleteTable: { kind: 'button', disabled: noTable },
  undo: { kind: 'button', disabled: (s) => !s.canUndo },
  redo: { kind: 'button', disabled: (s) => !s.canRedo },
  sourceCode: { kind: 'toggle', inSource: true, pressed: (_s, ctx) => ctx.sourceMode },
  fullscreen: { kind: 'toggle', inSource: true, pressed: (_s, ctx) => ctx.fullscreen },
  print: { kind: 'button', inSource: true },
  findReplace: { kind: 'button' },
  formatPainter: { kind: 'toggle', pressed: (s) => s.painter },
  emoji: { kind: 'button' },
  import: { kind: 'button' },
  aiAssistant: { kind: 'button' },
};

const DEFAULT_COLORS = [
  { label: 'Black', value: '#000000' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Yellow', value: '#ca8a04' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#9333ea' },
];
export const DEFAULTS = {
  colors: DEFAULT_COLORS,
  fontFamilies: [
    { label: 'Sans serif', value: 'system-ui, sans-serif' },
    { label: 'Serif', value: 'Georgia, serif' },
    { label: 'Monospace', value: 'ui-monospace, monospace' },
  ],
  fontSizes: ['10pt', '12pt', '14pt', '18pt', '24pt', '36pt'],
};

function colorMenu(ctx: ToolbarContextValue, command: 'color' | 'backgroundColor') {
  return [{ id: 'none', label: ctx.locale.removeColor, args: [null], command }, ...ctx.colors.map((c) => ({ id: c.value, label: c.label, args: [c.value], command }))];
}

/** `'bold'` or `{ id: 'bold', disabled }` or a custom item, normalized. */
export function itemId(item: RichTextToolbarItem): string {
  return typeof item === 'string' ? item : item.id;
}

const keep = (event: MouseEvent) => event.preventDefault();

function ItemView(props: { readonly item: RichTextToolbarItem; readonly first: boolean }): ReactElement | null {
  const ctx = use(ToolbarContext)!;
  const { item } = props;
  const id = itemId(item);
  const def = ITEMS[id];
  const custom = def ? null : typeof item === 'object' ? (item as RichTextToolbarCustomItem) : (ctx.extensionItems[id] ?? null);
  const pressed = useEditorState(ctx.store, (s) => (def?.pressed ? def.pressed(s, ctx) : false));
  const off = useEditorState(ctx.store, (s) => (def?.disabled ? def.disabled(s, ctx) : false));
  const label = (typeof item === 'object' && 'label' in item && item.label) || (ctx.locale as Record<string, string>)[id] || id;
  const disabled = Boolean((typeof item === 'object' && item.disabled) || off || (ctx.locked && !def?.inSource) || (ctx.sourceMode && !def?.inSource));
  const common = {
    'data-salmon-toolbar-item': '',
    'data-item-id': id,
    tabIndex: -1,
    size: 'sm' as const,
    variant: 'ghost' as const,
    disabled,
    onMouseDown: keep,
  };
  if (custom) {
    if (custom.icon == null) {
      return (
        <Button {...common} aria-pressed={custom.pressed} onClick={() => ctx.custom(custom)}>
          {custom.label}
        </Button>
      );
    }
    return <Button {...common} iconOnly aria-label={custom.label} aria-pressed={custom.pressed} iconStart={custom.icon} onClick={() => ctx.custom(custom)} />;
  }
  if (!def) return null;
  const icon = <Icon name={def.icon ?? id} />;
  if (def.kind === 'menu') {
    const entries = def.menu!(ctx);
    const items: MenuItemData[] = entries.map((e) => ({ id: e.id, label: e.label }));
    return (
      <MenuButton
        {...common}
        iconOnly
        aria-label={label}
        iconStart={icon}
        items={items}
        onAction={(event: MenuActionEvent) => {
          const entry = entries.find((e) => e.id === event.id);
          if (entry) ctx.perform(entry.command, ...entry.args);
        }}
      />
    );
  }
  if (def.kind === 'toggle') {
    return <ToggleButton {...common} iconOnly aria-label={label} pressed={pressed} iconStart={icon} onPressedChange={() => ctx.perform(id)} />;
  }
  return <Button {...common} iconOnly aria-label={label} iconStart={icon} onClick={() => ctx.perform(id)} />;
}

/** Overflow menu entries for items that do not fit (`toolbarOverflow: 'menu'`). */
function overflowEntries(items: readonly RichTextToolbarItem[], ctx: ToolbarContextValue): { data: MenuItemData[]; run: Map<string, () => void> } {
  const run = new Map<string, () => void>();
  const data: MenuItemData[] = [];
  for (const item of items) {
    const id = itemId(item);
    if (id === '|') continue;
    const def = ITEMS[id];
    const label = (typeof item === 'object' && 'label' in item && item.label) || (ctx.locale as Record<string, string>)[id] || id;
    if (def?.menu) {
      const sub = def.menu(ctx);
      data.push({ id, label, items: sub.map((e) => ({ id: `${id}:${e.id}`, label: e.label })) });
      for (const e of sub) run.set(`${id}:${e.id}`, () => ctx.perform(e.command, ...e.args));
    } else {
      data.push({ id, label, disabled: Boolean(typeof item === 'object' && item.disabled) || ctx.sourceMode });
      const custom = typeof item === 'object' ? (item as RichTextToolbarCustomItem) : ctx.extensionItems[id];
      run.set(id, def ? () => ctx.perform(id) : () => custom && ctx.custom(custom));
    }
  }
  return { data, run };
}

export interface EditorToolbarProps {
  readonly items: readonly RichTextToolbarItem[];
  readonly className: string;
  readonly label: string;
  readonly controls?: string | undefined;
  readonly overflow: 'menu' | 'scroll' | 'wrap';
  readonly onEscape?: () => void;
  readonly toolbarRef?: (el: HTMLDivElement | null) => void;
  readonly children?: ReactNode;
}

export function EditorToolbar(props: EditorToolbarProps): ReactElement {
  const ctx = use(ToolbarContext)!;
  const { items, overflow } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const widths = useRef<number[]>([]);
  // How many items fit (null: all); layout-derived UI state.
  const [fit, setFit] = useState<number | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (overflow !== 'menu' || !root || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const slots = [...root.querySelectorAll<HTMLElement>(':scope > [data-salmon-slot]')];
      slots.forEach((slot, i) => {
        if (!slot.hidden) widths.current[i] = slot.getBoundingClientRect().width;
      });
      const gap = parseFloat(getComputedStyle(root).columnGap) || 0;
      const available = root.clientWidth;
      const total = widths.current.reduce((sum, w) => sum + w + gap, 0);
      if (total <= available + 1) {
        setFit(null);
        return;
      }
      const more = 36 + gap;
      let used = 0;
      let count = 0;
      for (const w of widths.current) {
        if (used + w + gap + more > available) break;
        used += w + gap;
        count++;
      }
      setFit(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [overflow, items]);
  const hidden = fit === null ? [] : items.slice(fit);
  const extra = hidden.length ? overflowEntries(hidden, ctx) : null;
  return (
    <ToolbarShell
      ref={(el) => {
        ref.current = el;
        props.toolbarRef?.(el);
      }}
      label={props.label}
      controls={props.controls}
      className={props.className}
      onEscape={props.onEscape}
      data-overflow={overflow}
    >
      {items.map((item, i) => {
        const id = itemId(item);
        return (
          <span key={`${id}-${i}`} data-salmon-slot="" className="salmon-rich-text__slot" hidden={fit !== null && i >= fit ? true : undefined}>
            {id === '|' ? <span role="separator" aria-orientation="vertical" className="salmon-rich-text__separator" /> : <ItemView item={item} first={i === 0} />}
          </span>
        );
      })}
      {extra ? (
        <MenuButton
          data-salmon-toolbar-item=""
          tabIndex={-1}
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={ctx.locale.more}
          iconStart={<Icon name="more" />}
          indicator={false}
          onMouseDown={keep}
          items={extra.data}
          onAction={(event) => extra.run.get(event.id)?.()}
        />
      ) : null}
      {props.children}
    </ToolbarShell>
  );
}
