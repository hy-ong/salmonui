'use client';
// BlockEditor client UI (lazy chunk): drag handle and block action menu, slash menu, selection toolbar with 'turnInto', context menu, image settings and paste prompt dialogs, print and mentions / labels. Pointer and
// drag transients are written to the DOM from event handlers, never to React
// state; open menus and popups are React state (they render markup).
//
// Toolbar, Dialog and Popover are the private primitives of the rich text
// family (../overlay.tsx), replaced by the shared ones when Navigation and
// Layout ship them.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement, type RefObject } from 'react';
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { Menu, MenuButton, type MenuActionEvent, type MenuItemData } from '@salmonui/buttons/menu';
import { Mention, type MentionTrigger } from '@salmonui/dropdowns/mention';
import { Dialog, Popover, ToolbarShell, focusToolbar } from '../overlay.js';
import { Icon } from '../icons.js';
import type { Block, BlockPosition } from '../../blocks/types.js';
import type { BlockController, BlockSnapshot } from './controller.js';
import type { BlockEditorLocaleText } from './locale.js';
import { TRANSFORMS, transformOf } from './transforms.js';
import type {
  BlockEditorActions,
  BlockEditorBlockAction,
  BlockEditorContextMenuItem,
  BlockEditorCustomItem,
  BlockEditorInlineToolbarItem,
  BlockEditorProps,
  BlockEditorSlashItem,
  BlockEditorSlashItemId,
  BlockEditorTransformId,
} from './types.js';

export interface UiHooks {
  suggestKey: (event: KeyboardEvent) => boolean;
  action: (id: string) => boolean;
  pastePrompt: () => Promise<'keep' | 'clean' | 'plainText' | null>;
}

export interface BlockEditorUiProps {
  readonly controller: BlockController;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly locale: BlockEditorLocaleText;
  readonly props: BlockEditorProps;
  readonly hooks: RefObject<UiHooks>;
  readonly actions: BlockEditorActions;
}

type Rect = { left: number; top: number; bottom: number };
type MenuState = { kind: 'block' | 'context'; blockId: string | null; anchor: Rect } | null;
type DialogState = { kind: 'image'; blockId: string } | { kind: 'paste'; resolve: (choice: 'keep' | 'clean' | 'plainText' | null) => void } | null;

const SLASH_DEFAULT: readonly BlockEditorSlashItemId[] = [...TRANSFORMS, 'image', 'table', 'divider'];
const INLINE_DEFAULT: readonly BlockEditorInlineToolbarItem[] = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'turnInto'];
const ACTIONS_DEFAULT: readonly BlockEditorBlockAction[] = ['turnInto', 'duplicate', 'delete', 'moveUp', 'moveDown'];
const CONTEXT_DEFAULT: readonly BlockEditorContextMenuItem[] = ['cut', 'copy', 'duplicate', 'delete', 'moveUp', 'moveDown', 'turnInto'];
const TEXT_TYPES = new Set(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checklistItem', 'quote', 'callout', 'code', 'toggle']);
const TABLE_OPS = ['addRowBefore', 'addRowAfter', 'deleteRow', 'addColumnBefore', 'addColumnAfter', 'deleteColumn', 'mergeCells', 'splitCell', 'toggleHeaderRow'] as const;
const CONTAINERS = new Set(['LI', 'BLOCKQUOTE', 'DETAILS', 'DIV']);

function useSnapshot<T>(controller: BlockController, select: (s: BlockSnapshot) => T): T {
  return useSyncExternalStore(
    controller.subscribe,
    () => select(controller.getSnapshot()),
    () => select(controller.getSnapshot()),
  );
}

function isCustom<T extends string>(item: T | BlockEditorCustomItem): item is BlockEditorCustomItem {
  return typeof item === 'object';
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, bottom: r.bottom };
}

function blockElementAt(content: HTMLElement, target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-block-id]') : null;
  return el && content.contains(el) ? el : null;
}

function isRtl(el: Element): boolean {
  return getComputedStyle(el).direction === 'rtl';
}

/** The whole client UI of one BlockEditor. */
export function BlockEditorUi(p: BlockEditorUiProps): ReactElement {
  const { controller, rootRef, contentRef, locale, props, hooks, actions } = p;
  const [menu, setMenu] = useState<MenuState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [linkEditing, setLinkEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const readOnly = props.readOnly === true;
  const toolbarVisible = useSnapshot(controller, (s) => s.focused && !s.selectionEmpty && s.textSelection && !s.inCode) && props.inlineToolbar !== false && !readOnly;

  const openBlockMenu = (blockId: string | null, anchor?: Rect): boolean => {
    const id = blockId ?? controller.currentBlockId();
    if (!id) return false;
    const el = controller.blockElement(id);
    const at = anchor ?? (el ? rectOf(el) : controller.caretRect());
    if (!at) return false;
    setMenu({ kind: 'block', blockId: id, anchor: at });
    return true;
  };

  // Hooks the controller calls (key bindings, slash keys, paste prompt).
  useEffect(() => {
    const h = hooks.current;
    h.action = (id) => {
      switch (id) {
        case 'blockMenu':
          if (toolbarRef.current && focusToolbar(toolbarRef.current)) return true;
          return openBlockMenu(null);
        case 'contextMenu': {
          if (props.contextMenu === false) return false;
          const at = controller.caretRect();
          if (!at) return false;
          setMenu({ kind: 'context', blockId: controller.currentBlockId(), anchor: at });
          return true;
        }
        case 'print':
          printContent(controller, rootRef.current);
          return true;
        case 'link':
          if (controller.getSnapshot().selectionEmpty) return false;
          setLinkEditing(true);
          return true;
        case 'image':
          fileRef.current?.click();
          return true;
        default:
          return false;
      }
    };
    h.pastePrompt = () => new Promise((resolve) => setDialog({ kind: 'paste', resolve }));
  });

  const closeMenu = (refocus = true) => {
    setMenu(null);
    if (refocus) controller.focus();
  };

  // Context menu on right click.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || props.contextMenu === false) return;
    const onContext = (event: MouseEvent) => {
      if (event.shiftKey) return; // Shift + right click keeps the browser menu.
      event.preventDefault();
      const el = blockElementAt(content, event.target);
      setMenu({ kind: 'context', blockId: el?.getAttribute('data-block-id') ?? controller.currentBlockId(), anchor: { left: event.clientX, top: event.clientY, bottom: event.clientY } });
    };
    content.addEventListener('contextmenu', onContext);
    return () => content.removeEventListener('contextmenu', onContext);
  }, [contentRef, controller, props.contextMenu]);

  const mentionTarget = controller.mentionTarget();
  const triggers: MentionTrigger[] = [];
  if (props.mentions) triggers.push({ char: props.mentions.trigger ?? '@', data: props.mentions.items });
  if (props.labels) triggers.push({ char: props.labels.trigger ?? '#', data: props.labels.items });

  return (
    <>
      {!readOnly && props.draggable !== false ? <DragHandle controller={controller} rootRef={rootRef} contentRef={contentRef} locale={locale} onOpen={openBlockMenu} /> : null}
      {!readOnly ? <SlashMenu controller={controller} locale={locale} items={props.slashMenu} hooks={hooks} actions={actions} openFile={() => fileRef.current?.click()} /> : null}
      {toolbarVisible || linkEditing ? (
        <InlineToolbar
          controller={controller}
          locale={locale}
          items={props.inlineToolbar === false ? [] : (props.inlineToolbar ?? INLINE_DEFAULT)}
          transforms={props.transforms ?? TRANSFORMS}
          actions={actions}
          toolbarRef={toolbarRef}
          linkEditing={linkEditing}
          setLinkEditing={setLinkEditing}
        />
      ) : null}
      {menu ? <BlockMenu menu={menu} controller={controller} locale={locale} props={props} actions={actions} close={closeMenu} openImage={(blockId) => setDialog({ kind: 'image', blockId })} /> : null}
      {dialog?.kind === 'image' ? <ImageDialog controller={controller} blockId={dialog.blockId} locale={locale} close={() => (setDialog(null), controller.focus())} /> : null}
      {dialog?.kind === 'paste' ? (
        <PasteDialog
          locale={locale}
          choose={(choice) => {
            dialog.resolve(choice);
            setDialog(null);
          }}
        />
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        className="salmon-block-editor__file"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          controller.focus();
          if (files.length) void controller.insertFiles(files);
        }}
      />
      {mentionTarget && triggers.length && !readOnly ? <Mention editor={mentionTarget} triggers={triggers} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drag handle: follows the hovered block (or the caret's
// block); pointer drag moves blocks, a click opens the block action menu.
// ---------------------------------------------------------------------------

function DragHandle(props: {
  readonly controller: BlockController;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly locale: BlockEditorLocaleText;
  readonly onOpen: (blockId: string, anchor?: Rect) => boolean;
}): ReactElement {
  const { controller, rootRef, contentRef, locale, onOpen } = props;
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const hovered = useRef<string | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const handle = handleRef.current;
    const indicator = indicatorRef.current;
    if (!root || !content || !handle || !indicator) return;
    let drag: { id: string; startX: number; startY: number; active: boolean; drop: BlockPosition | null; pointer: number } | null = null;

    const place = (el: HTMLElement | null) => {
      if (!el) {
        handle.dataset.visible = 'false';
        return;
      }
      const id = el.getAttribute('data-block-id');
      hovered.current = id;
      const r = el.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      const rtl = isRtl(root);
      const inline = rtl ? rr.right - r.right : r.left - rr.left;
      handle.style.top = `${Math.round(r.top - rr.top)}px`;
      handle.style.insetInlineStart = `${Math.round(inline - handle.offsetWidth - 4)}px`;
      handle.dataset.visible = 'true';
      handle.dataset.blockId = id ?? '';
    };

    const onMove = (event: PointerEvent) => {
      if (drag) return;
      if (event.target === handle || handle.contains(event.target as Node)) return;
      const el = blockElementAt(content, event.target);
      if (el) place(el);
    };
    // Keyboard users: the handle follows the caret's block.
    const offStore = controller.subscribe(() => {
      if (drag) return;
      const snap = controller.getSnapshot();
      if (snap.focused && snap.blockId && snap.blockId !== hovered.current) place(controller.blockElement(snap.blockId));
    });

    const dropAt = (event: PointerEvent): { position: BlockPosition; el: HTMLElement; nest: boolean; after: boolean } | null => {
      if (!drag) return null;
      const cr = content.getBoundingClientRect();
      const x = Math.max(cr.left + 4, Math.min(cr.right - 4, event.clientX));
      const hit = document.elementFromPoint(x, Math.max(cr.top + 1, Math.min(cr.bottom - 1, event.clientY)));
      let el = blockElementAt(content, hit);
      if (!el) return null;
      const self = controller.blockElement(drag.id);
      // Never into the dragged block itself.
      if (self && (self === el || self.contains(el))) {
        el = self;
        return { position: { before: drag.id }, el, nest: false, after: false };
      }
      const id = el.getAttribute('data-block-id') as string;
      const r = el.getBoundingClientRect();
      const after = event.clientY > r.top + r.height / 2;
      const rtl = isRtl(root);
      const offset = rtl ? r.right - event.clientX : event.clientX - r.left;
      const nest = after && offset > 48 && CONTAINERS.has(el.tagName);
      return { position: nest ? { parent: id, index: 0 } : after ? { after: id } : { before: id }, el, nest, after };
    };

    const showIndicator = (target: ReturnType<typeof dropAt>) => {
      if (!target || ('before' in target.position && target.position.before === drag?.id)) {
        indicator.dataset.visible = 'false';
        return;
      }
      const r = target.el.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      const rtl = isRtl(root);
      const inline = (rtl ? rr.right - r.right : r.left - rr.left) + (target.nest ? 24 : 0);
      indicator.style.top = `${Math.round((target.after ? r.bottom : r.top) - rr.top)}px`;
      indicator.style.insetInlineStart = `${Math.round(inline)}px`;
      indicator.style.inlineSize = `${Math.round(r.width - (target.nest ? 24 : 0))}px`;
      indicator.dataset.visible = 'true';
    };

    const onDown = (event: PointerEvent) => {
      const id = handle.dataset.blockId;
      if (!id || event.button !== 0) return;
      drag = { id, startX: event.clientX, startY: event.clientY, active: false, drop: null, pointer: event.pointerId };
      handle.setPointerCapture(event.pointerId);
    };
    const onDragMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
      if (!drag.active) {
        drag.active = true;
        root.dataset.dragging = 'true';
      }
      const target = dropAt(event);
      drag.drop = target && !('before' in target.position && target.position.before === drag.id) ? target.position : null;
      showIndicator(target);
    };
    const end = (event: PointerEvent, commit: boolean) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const d = drag;
      drag = null;
      indicator.dataset.visible = 'false';
      delete root.dataset.dragging;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if (!d.active) return;
      dragged.current = true;
      if (commit && d.drop) controller.move(d.id, d.drop, 'pointer');
    };
    const onUp = (event: PointerEvent) => end(event, true);
    const onCancel = (event: PointerEvent) => end(event, false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag) {
        const pointer = drag.pointer;
        end({ pointerId: pointer } as PointerEvent, false);
      }
    };
    root.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onDragMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    return () => {
      offStore();
      root.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onDragMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [controller, rootRef, contentRef]);

  return (
    <>
      <button
        ref={handleRef}
        type="button"
        className="salmon-block-editor__handle"
        data-visible="false"
        aria-label={locale.dragHandle}
        aria-haspopup="menu"
        title={locale.dragHandle}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          const id = event.currentTarget.dataset.blockId;
          if (id) onOpen(id, rectOf(event.currentTarget));
        }}
      >
        <span aria-hidden="true" className="salmon-block-editor__grip" />
      </button>
      <div ref={indicatorRef} className="salmon-block-editor__drop-indicator" data-visible="false" aria-hidden="true" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Block action menu and context menu on the shared Menu.
// ---------------------------------------------------------------------------

function BlockMenu(props: {
  readonly menu: NonNullable<MenuState>;
  readonly controller: BlockController;
  readonly locale: BlockEditorLocaleText;
  readonly props: BlockEditorProps;
  readonly actions: BlockEditorActions;
  readonly close: (refocus?: boolean) => void;
  readonly openImage: (blockId: string) => void;
}): ReactElement {
  const { menu, controller, locale, actions, close, openImage } = props;
  const editor = props.props;
  const ref = useRef<HTMLDivElement | null>(null);
  const block = menu.blockId ? controller.getBlock(menu.blockId) : undefined;
  const transforms = editor.transforms ?? TRANSFORMS;
  const current = block ? transformOf(block) : null;
  const custom = new Map<string, BlockEditorCustomItem>();
  const items: MenuItemData[] = [];
  const turnInto: MenuItemData | null =
    block && TEXT_TYPES.has(block.type) ? { id: 'turnInto', label: locale.turnInto, items: transforms.map((t) => ({ id: `turnInto:${t}`, label: locale[t], disabled: t === current })) } : null;
  const builtIn = (id: string): MenuItemData | null => {
    switch (id) {
      case 'turnInto':
        return turnInto;
      case 'duplicate':
      case 'delete':
      case 'moveUp':
      case 'moveDown':
      case 'cut':
      case 'copy':
        return { id, label: locale[id], disabled: !block && id !== 'cut' && id !== 'copy' };
      default:
        return null;
    }
  };
  const entries = menu.kind === 'block' ? (editor.blockActions ?? ACTIONS_DEFAULT) : (editor.contextMenu || CONTEXT_DEFAULT);
  for (const entry of entries) {
    if (isCustom(entry)) {
      custom.set(entry.id, entry);
      items.push({ id: `custom:${entry.id}`, label: entry.label, ...(entry.disabled ? { disabled: true } : {}) });
    } else {
      const item = builtIn(entry);
      if (item) items.push(item);
    }
  }
  if (block?.type === 'image') items.push({ type: 'separator' }, { id: 'editImage', label: locale.editImage });
  if (block?.type === 'table') items.push({ type: 'separator' }, ...TABLE_OPS.map((op) => ({ id: `table:${op}`, label: locale[op] })));

  // First item focused once the popover is placed (a hidden element cannot take focus).
  useEffect(() => {
    const focusFirst = () => ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true });
    focusFirst();
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) focusFirst();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Outside press closes.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(event.target as Node) && !(event.target as Element).closest?.('.salmon-menu')) close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  const onAction = (event: MenuActionEvent) => {
    const id = event.id;
    const blockId = menu.blockId;
    if (id.startsWith('turnInto:') && blockId) {
      close();
      controller.turnInto(blockId, id.slice(9) as BlockEditorTransformId);
      return;
    }
    if (id.startsWith('custom:')) {
      const item = custom.get(id.slice(7));
      close();
      item?.onSelect({ block: blockId ? (controller.getBlock(blockId) ?? null) : null, actions });
      return;
    }
    if (id.startsWith('table:') && blockId) {
      close();
      controller.selectInTable(blockId);
      controller.runAction(id.slice(6));
      return;
    }
    switch (id) {
      case 'duplicate':
        close();
        if (blockId) controller.duplicate(blockId);
        break;
      case 'delete':
        close();
        if (blockId) controller.delete(blockId);
        break;
      case 'moveUp':
        close();
        if (blockId) controller.step(-1, blockId);
        break;
      case 'moveDown':
        close();
        if (blockId) controller.step(1, blockId);
        break;
      case 'cut':
      case 'copy':
        close();
        document.execCommand(id);
        break;
      case 'editImage':
        close(false);
        if (blockId) openImage(blockId);
        break;
      default:
        close();
    }
  };

  return (
    <Popover anchor={() => menu.anchor} subscribe={controller.subscribe} className="salmon-block-editor__menu-popover" placement="below">
      <div
        ref={ref}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <Menu items={items} onAction={onAction} aria-label={menu.kind === 'block' ? locale.blockActions : locale.contextMenu} />
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Slash menu: engine `/` trigger, filtered list, keys from the editor.
// ---------------------------------------------------------------------------

interface SlashEntry {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly keywords: readonly string[];
  readonly run: () => void;
}

function SlashMenu(props: {
  readonly controller: BlockController;
  readonly locale: BlockEditorLocaleText;
  readonly items: BlockEditorProps['slashMenu'];
  readonly hooks: RefObject<UiHooks>;
  readonly actions: BlockEditorActions;
  readonly openFile: () => void;
}): ReactElement | null {
  const { controller, locale, hooks, actions, openFile } = props;
  const suggest = useSnapshot(controller, (s) => s.suggest);
  const query = suggest?.query ?? null;
  const [active, setActive] = useState(0);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(0);
  }
  const list = props.items === false ? [] : (props.items ?? SLASH_DEFAULT);
  const entries: SlashEntry[] = list.map((item: BlockEditorSlashItem) => {
    if (isCustom(item)) {
      return {
        id: item.id,
        label: item.label,
        group: item.group ?? locale.groupCustom,
        keywords: item.keywords ?? [],
        run: () => item.onSelect({ block: (controller.currentBlockId() && controller.getBlock(controller.currentBlockId() as string)) || null, actions }),
      };
    }
    const media = item === 'image' || item === 'table' || item === 'divider';
    return {
      id: item,
      label: locale[item],
      group: media ? locale.groupMedia : locale.groupBasic,
      keywords: [item],
      run: () => {
        if (item === 'image') openFile();
        else controller.runBlockAction(item);
      },
    };
  });
  const q = (query ?? '').toLowerCase();
  const shown = q ? entries.filter((e) => e.label.toLowerCase().includes(q) || e.keywords.some((k) => k.toLowerCase().startsWith(q))) : entries;
  const index = shown.length ? Math.min(active, shown.length - 1) : -1;
  const pick = (entry: SlashEntry | undefined) => {
    if (!entry) return;
    controller.engine.completeSuggest(null);
    entry.run();
  };

  useEffect(() => {
    hooks.current.suggestKey = (event) => {
      if (query === null) return false;
      switch (event.key) {
        case 'ArrowDown':
          setActive((i) => (shown.length ? (Math.min(i, shown.length - 1) + 1) % shown.length : 0));
          return true;
        case 'ArrowUp':
          setActive((i) => (shown.length ? (Math.min(i, shown.length - 1) - 1 + shown.length) % shown.length : 0));
          return true;
        case 'Enter':
        case 'Tab':
          if (!shown.length) return false;
          pick(shown[index]);
          return true;
        case 'Escape':
          controller.engine.dismissSuggest();
          return true;
        default:
          return false;
      }
    };
  });

  if (query === null) return null;
  const listId = 'salmon-block-editor-slash';
  let group = '';
  return (
    <Popover anchor={() => controller.caretRect('suggest')} subscribe={controller.subscribe} className="salmon-block-editor__slash">
      <div role="listbox" id={listId} aria-label={locale.slashMenu} className="salmon-block-editor__options">
        {shown.length === 0 ? <div className="salmon-block-editor__empty">{locale.noResults}</div> : null}
        {shown.map((entry, i) => {
          const heading = entry.group !== group ? entry.group : null;
          group = entry.group;
          return (
            <div key={entry.id} role="presentation">
              {heading ? (
                <div role="presentation" className="salmon-block-editor__group">
                  {heading}
                </div>
              ) : null}
              <div
                role="option"
                id={`${listId}-${entry.id}`}
                aria-selected={i === index}
                data-item-id={entry.id}
                className="salmon-block-editor__option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(entry)}
                onPointerMove={() => i !== index && setActive(i)}
              >
                {entry.label}
              </div>
            </div>
          );
        })}
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Selection toolbar
// ---------------------------------------------------------------------------

const MARK_ITEMS = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikethrough', code: 'inlineCode' } as const;

function InlineToolbar(props: {
  readonly controller: BlockController;
  readonly locale: BlockEditorLocaleText;
  readonly items: readonly BlockEditorInlineToolbarItem[];
  readonly transforms: readonly BlockEditorTransformId[];
  readonly actions: BlockEditorActions;
  readonly toolbarRef: RefObject<HTMLDivElement | null>;
  readonly linkEditing: boolean;
  readonly setLinkEditing: (on: boolean) => void;
}): ReactElement {
  const { controller, locale, items, transforms, actions, toolbarRef, linkEditing, setLinkEditing } = props;
  const marks = useSnapshot(controller, (s) => s.marks);
  const link = useSnapshot(controller, (s) => s.link);
  const keep = (event: { preventDefault(): void }) => event.preventDefault();
  const common = { 'data-salmon-toolbar-item': '', tabIndex: -1, size: 'sm' as const, variant: 'ghost' as const, onMouseDown: keep };
  const blockId = controller.currentBlockId();
  const block = blockId ? controller.getBlock(blockId) : undefined;
  if (linkEditing) {
    return (
      <Popover anchor={() => controller.caretRect()} subscribe={controller.subscribe} className="salmon-block-editor__toolbar-popover" placement="above">
        <LinkForm
          locale={locale}
          initial={link ?? ''}
          done={(href) => {
            setLinkEditing(false);
            controller.focus();
            if (href === null) return;
            if (href) controller.engine.commands.setLink({ href });
            else controller.engine.commands.unsetLink();
          }}
        />
      </Popover>
    );
  }
  return (
    <Popover anchor={() => controller.caretRect()} subscribe={controller.subscribe} className="salmon-block-editor__toolbar-popover" placement="above">
      <ToolbarShell ref={toolbarRef} label={locale.inlineToolbar} className="salmon-block-editor__toolbar" onEscape={() => controller.focus()}>
        {items.map((item) => {
          if (isCustom(item)) {
            return (
              <Button key={item.id} {...common} disabled={item.disabled} onClick={() => item.onSelect({ block: block ?? null, actions })}>
                {item.label}
              </Button>
            );
          }
          if (item === 'link') {
            return <ToggleButton key="link" {...common} iconOnly aria-label={locale.link} pressed={link !== null} iconStart={<Icon name="link" />} onPressedChange={() => setLinkEditing(true)} />;
          }
          if (item === 'turnInto') {
            if (!block || !TEXT_TYPES.has(block.type)) return null;
            const current = transformOf(block);
            return (
              <MenuButton
                key="turnInto"
                {...common}
                items={transforms.map((t) => ({ id: t, label: locale[t], disabled: t === current }))}
                onAction={(event: MenuActionEvent) => {
                  controller.turnInto(block.id, event.id as BlockEditorTransformId);
                  controller.focus();
                }}
              >
                {locale.turnInto}
              </MenuButton>
            );
          }
          const mark = item as keyof typeof MARK_ITEMS;
          const label = mark === 'code' ? locale.inlineCode : locale[mark];
          return (
            <ToggleButton
              key={item}
              {...common}
              iconOnly
              aria-label={label}
              data-item-id={item}
              pressed={marks[mark]}
              iconStart={<Icon name={MARK_ITEMS[mark]} />}
              onPressedChange={() => {
                controller.runAction(mark);
              }}
            />
          );
        })}
      </ToolbarShell>
    </Popover>
  );
}

function LinkForm(props: { readonly locale: BlockEditorLocaleText; readonly initial: string; readonly done: (href: string | null) => void }): ReactElement {
  const { locale, initial, done } = props;
  const ref = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <form
      className="salmon-block-editor__link-form"
      onSubmit={(event) => {
        event.preventDefault();
        done(ref.current?.value.trim() ?? '');
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          done(null);
        }
      }}
    >
      <input ref={ref} type="url" aria-label={locale.linkUrl} placeholder="https://" defaultValue={initial} className="salmon-block-editor__link-input" />
      <Button type="submit" size="sm">
        {locale.apply}
      </Button>
      {initial ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => done('')}>
          {locale.removeLink}
        </Button>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dialogs: image settings, paste prompt
// ---------------------------------------------------------------------------

function ImageDialog(props: { readonly controller: BlockController; readonly blockId: string; readonly locale: BlockEditorLocaleText; readonly close: () => void }): ReactElement {
  const { controller, blockId, locale, close } = props;
  const block: Block | undefined = controller.getBlock(blockId);
  const alt = typeof block?.props?.alt === 'string' ? block.props.alt : '';
  const width = typeof block?.props?.width === 'number' ? block.props.width : undefined;
  return (
    <Dialog title={locale.editImage} onClose={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const w = Number.parseInt(String(data.get('width') ?? ''), 10);
          controller.updateImage(blockId, { alt: String(data.get('alt') ?? ''), width: Number.isFinite(w) && w > 0 ? w : null });
          close();
        }}
      >
        <div className="salmon-rich-text__field">
          <label htmlFor={`${blockId}-alt`}>{locale.altText}</label>
          <input id={`${blockId}-alt`} name="alt" defaultValue={alt} data-autofocus="" />
        </div>
        <div className="salmon-rich-text__field">
          <label htmlFor={`${blockId}-width`}>{locale.width}</label>
          <input id={`${blockId}-width`} name="width" type="number" min={1} defaultValue={width} />
        </div>
        <div className="salmon-rich-text__dialog-actions">
          <Button type="button" variant="ghost" onClick={close}>
            {locale.cancel}
          </Button>
          <Button type="submit">{locale.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function PasteDialog(props: { readonly locale: BlockEditorLocaleText; readonly choose: (choice: 'keep' | 'clean' | 'plainText' | null) => void }): ReactElement {
  const { locale, choose } = props;
  return (
    <Dialog title={locale.pastePrompt} onClose={() => choose(null)}>
      <div className="salmon-rich-text__dialog-actions">
        <Button data-autofocus="" onClick={() => choose('keep')}>
          {locale.pasteKeep}
        </Button>
        <Button onClick={() => choose('clean')}>{locale.pasteClean}</Button>
        <Button onClick={() => choose('plainText')}>{locale.pastePlain}</Button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Print: the content only, in an isolated frame with the page styles.
// ---------------------------------------------------------------------------

function printContent(controller: BlockController, root: HTMLElement | null): void {
  const doc = root?.ownerDocument ?? document;
  doc.querySelector('.salmon-block-editor__print-frame')?.remove();
  const frame = doc.createElement('iframe');
  frame.className = 'salmon-block-editor__print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;inset-inline-start:-10000px;inline-size:1px;block-size:1px;border:0;';
  const styles = [...doc.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join('');
  const dir = root ? getComputedStyle(root).direction : 'ltr';
  frame.srcdoc = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8">${styles}</head><body><div class="salmon-rich-text-content salmon-block-editor__print">${controller.getHtml()}</div></body></html>`;
  frame.addEventListener('load', () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  });
  doc.body.appendChild(frame);
}
