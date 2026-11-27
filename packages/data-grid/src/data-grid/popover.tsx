'use client';

// Shared, dependency-free popover and menu primitives for the grid overlays
// (column menu, filter menu, column chooser, context menu, toolbar overflow):
// a portal, collision-aware positioning measured once in a layout effect
// (read phase, then one write), outside-press and Escape dismissal, roving
// focus with typeahead, and submenus. Overlays only render after a user
// action, never on the server.

import { use, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { DataGridMenuItem } from './chrome-types.js';
import { DataGridSheetContext } from './sheet.js';

import { rectOf, type AnchorRect } from './anchor.js';
import { customIcon, useDataGridIcons } from './icons.js';
import { modalHostOf } from '@salmonui/core/internal/modal-host';

export { pointRect, rectOf, type AnchorRect } from './anchor.js';

const GAP = 2;
const MARGIN = 8;

/**
 * Places a box of `size` next to `anchor` inside the viewport: below (or
 * above when it does not fit), aligned to the anchor's inline start (the
 * right edge in RTL), shifted to stay on screen. `side: 'inline'` places it
 * beside the anchor (submenus), flipping to the other side on overflow.
 */
export function placeBox(
  anchor: AnchorRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
  side: 'block' | 'inline' = 'block',
): { x: number; y: number } {
  let x: number;
  let y: number;
  if (side === 'block') {
    y = anchor.top + anchor.height + GAP;
    if (y + size.height > viewport.height - MARGIN && anchor.top - GAP - size.height >= MARGIN) y = anchor.top - GAP - size.height;
    x = rtl ? anchor.left + anchor.width - size.width : anchor.left;
  } else {
    y = anchor.top;
    const after = rtl ? anchor.left - size.width : anchor.left + anchor.width;
    const before = rtl ? anchor.left + anchor.width : anchor.left - size.width;
    x = after;
    if (after < MARGIN || after + size.width > viewport.width - MARGIN) x = before;
  }
  x = Math.min(Math.max(MARGIN, x), Math.max(MARGIN, viewport.width - MARGIN - size.width));
  y = Math.min(Math.max(MARGIN, y), Math.max(MARGIN, viewport.height - MARGIN - size.height));
  return { x: Math.round(x), y: Math.round(y) };
}

export interface DataGridPopoverProps {
  readonly anchor: AnchorRect;
  readonly container: Element;
  readonly rtl: boolean;
  readonly className: string;
  readonly style?: CSSProperties | undefined;
  readonly role?: 'menu' | 'dialog';
  readonly label: string;
  readonly side?: 'block' | 'inline';
  /** Dismissal: outside press, Escape (and Tab for menus). */
  readonly onDismiss: (reason: 'outside' | 'escape' | 'tab') => void;
  /** Elements that count as inside (the invoker, parent menus). */
  readonly insideRefs?: readonly RefObject<Element | null>[];
  readonly children: ReactNode;
  readonly elementRef?: RefObject<HTMLDivElement | null>;
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** `aria-modal` dialogs trap Tab inside. */
  readonly modal?: boolean;
  readonly dataAttributes?: Readonly<Record<string, string>>;
}

/** Portaled, positioned overlay. Focus management is the content's job. */
export function DataGridPopover(props: DataGridPopoverProps) {
  const icons = useDataGridIcons();
  const own = useRef<HTMLDivElement | null>(null);
  const ref = props.elementRef ?? own;
  const { anchor, rtl, side, onDismiss, insideRefs } = props;
  // Adaptive sheet: CSS fills the screen; no anchored placement.
  const sheet = use(DataGridSheetContext);
  const { container } = props;
  // Portaled into an open modal dialog (chrome.ts): the top layer after the dialog, so it stacks
  // above it and the dialog's transform and overflow do not offset or clip the fixed box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el?.showPopover && modalHostOf(container)) {
      el.popover = 'manual';
      el.showPopover();
    }
  }, [ref, container]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (sheet) {
      el.style.transform = '';
      el.dataset['placed'] = '';
      return;
    }
    // Read phase, then a single write (no layout thrash).
    const win = el.ownerDocument.defaultView;
    const viewport = { width: win?.innerWidth ?? 1024, height: win?.innerHeight ?? 768 };
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const { x, y } = placeBox(anchor, size, viewport, rtl, side);
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.dataset['placed'] = '';
  }, [anchor, rtl, side, ref, sheet]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const doc = el.ownerDocument;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target || el.contains(target)) return;
      for (const r of insideRefs ?? []) if (r.current?.contains(target)) return;
      // Nested popovers (submenus) are separate portals: they count as inside.
      if ((target as Element).closest?.('[data-salmon-popover]')) return;
      onDismiss('outside');
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [ref, onDismiss, insideRefs]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onDismiss('escape');
    } else if (event.key === 'Tab') {
      if (props.role === 'menu') {
        event.preventDefault();
        onDismiss('tab');
      } else if (props.modal !== false) {
        trapTab(event);
      }
    }
    // Keys never leak to the grid behind the overlay (React events bubble through portals).
    event.stopPropagation();
  };
  return createPortal(
    <div
      ref={ref}
      className={props.className}
      // Viewport coordinates are physical; the transform written after measuring places the box.
      style={props.style ? { top: 0, left: 0, ...props.style } : POPOVER_ORIGIN}
      role={props.role ?? 'dialog'}
      aria-label={props.label}
      aria-modal={props.role === 'dialog' && props.modal !== false ? true : undefined}
      dir={rtl ? 'rtl' : 'ltr'}
      data-salmon-popover=""
      data-sheet={sheet ? (props.role === 'menu' ? 'menu' : 'dialog') : undefined}
      onKeyDown={onKeyDown}
      {...props.dataAttributes}
    >
      {sheet && props.role !== 'menu' ? (
        <div className="salmon-data-grid-sheet__header">
          <span className="salmon-data-grid-sheet__title">{props.label}</span>
          <button type="button" className="salmon-data-grid-sheet__close" aria-label={sheet.closeLabel} onClick={() => onDismiss('escape')}>
            <span className="salmon-data-grid-sheet__close-icon" aria-hidden="true" data-custom-icon={customIcon(icons, 'close')}>
              {icons?.close}
            </span>
          </button>
        </div>
      ) : null}
      {props.children}
    </div>,
    container,
  );
}

const POPOVER_ORIGIN: CSSProperties = Object.freeze({ top: 0, left: 0 });

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapTab(event: ReactKeyboardEvent<HTMLDivElement>): void {
  const root = event.currentTarget;
  const list = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.offsetParent !== null);
  if (!list.length) return;
  const first = list[0] as HTMLElement;
  const last = list[list.length - 1] as HTMLElement;
  const active = root.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export interface DataGridMenuProps {
  readonly items: readonly DataGridMenuItem[];
  readonly anchor: AnchorRect;
  readonly container: Element;
  readonly rtl: boolean;
  readonly label: string;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly side?: 'block' | 'inline';
  /**
   * Returns false when the click event was prevented (a link item then does
   * not navigate). `source` is the input that activated the item: Enter /
   * Space report `keyboard`, a touch tap `touch`.
   */
  readonly onAction: (item: DataGridMenuItem, source: MenuSource) => boolean | void;
  /** Closes this menu; `all` closes parent menus too. */
  readonly onClose: (reason: 'outside' | 'escape' | 'tab' | 'action' | 'collapse') => void;
  readonly insideRefs?: readonly RefObject<Element | null>[];
  readonly dataAttributes?: Readonly<Record<string, string>>;
  /** Submenus: the pointer moved over this menu (the parent cancels a pending hover close). */
  readonly onPointerInside?: () => void;
}

const TYPEAHEAD_MS = 500;
/**
 * hover intent: a submenu opens after the pointer rests on its item
 * this long, and an open submenu closes this long after the pointer moves to
 * a sibling, so a diagonal path into the submenu across siblings keeps it.
 */
export const SUBMENU_HOVER_MS = 200;

/** Input that activated a menu item. */
export type MenuSource = 'pointer' | 'keyboard' | 'touch';

/** Source of a click: keyboard-synthesized clicks have `detail === 0`; taps carry `pointerType: 'touch'`. */
function clickSource(event: { readonly detail?: number; readonly nativeEvent?: unknown }): MenuSource {
  if (event.detail === 0) return 'keyboard';
  const native = event.nativeEvent as { pointerType?: string } | undefined;
  return native?.pointerType === 'touch' ? 'touch' : 'pointer';
}

function enabled(item: DataGridMenuItem): boolean {
  return !item.separator && !item.disabled;
}

/**
 * `role="menu"`: roving focus (ArrowUp/Down, Home/End), typeahead by first
 * letters, Enter/Space activate, ArrowRight/Left (mirrored in RTL) open and
 * close submenus, Escape closes and the opener restores focus.
 */
export function DataGridMenu(props: DataGridMenuProps) {
  const { items, rtl } = props;
  const icons = useDataGridIcons();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(() => items.findIndex(enabled));
  const [open, setOpen] = useState<{ index: number; anchor: AnchorRect } | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  // Hover intent timer (pointer transient: a ref, never React state).
  const hover = useRef<{ timer: ReturnType<typeof setTimeout> | undefined; index: number }>({ timer: undefined, index: -1 });
  const cancelHover = (): void => {
    clearTimeout(hover.current.timer);
    hover.current.timer = undefined;
    hover.current.index = -1;
  };
  useEffect(() => () => clearTimeout(hover.current.timer), []);

  useLayoutEffect(() => {
    if (open) return;
    // Every item disabled: focus the menu itself, so Escape and Tab still close it.
    let el: HTMLElement | null | undefined = itemRefs.current[active];
    if (active < 0 && (el = listRef.current) && !el.hasAttribute('tabindex')) el.tabIndex = -1;
    if (el && el.ownerDocument.activeElement !== el) el.focus({ preventScroll: true });
  }, [active, open]);

  const move = (from: number, step: 1 | -1): number => {
    const n = items.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + step * k) % n) + n) % n;
      if (enabled(items[i] as DataGridMenuItem)) return i;
    }
    return from;
  };
  const openSub = (index: number): void => {
    const el = itemRefs.current[index];
    if (!el || !(items[index] as DataGridMenuItem).items?.length) return;
    setOpen({ index, anchor: rectOf(el) });
  };
  /** `click` is the pointer event of a link item (prevented when the action is). */
  const activate = (index: number, source: MenuSource, click?: { preventDefault(): void }): void => {
    const item = items[index];
    if (!item || !enabled(item)) {
      click?.preventDefault();
      return;
    }
    if (item.items?.length) {
      click?.preventDefault();
      openSub(index);
      return;
    }
    if (item.href !== undefined && !click) {
      // Keyboard on a link item: a native click keeps link semantics (target, modifiers).
      itemRefs.current[index]?.click();
      return;
    }
    if (props.onAction(item, source) === false) click?.preventDefault();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget && !(event.target as Element).closest('[role^="menuitem"]')) return;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let handled = true;
    switch (event.key) {
      case 'ArrowDown':
        setActive((a) => move(a, 1));
        break;
      case 'ArrowUp':
        setActive((a) => move(a, -1));
        break;
      case 'Home':
        setActive(move(-1, 1));
        break;
      case 'End':
        setActive(move(items.length, -1));
        break;
      case 'Enter':
      case ' ':
        activate(active, 'keyboard');
        break;
      default:
        if (event.key === forward) openSub(active);
        else if (event.key === back && props.side === 'inline') props.onClose('collapse');
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = event.timeStamp;
          const t = typeahead.current;
          t.text = now - t.at > TYPEAHEAD_MS ? event.key.toLowerCase() : t.text + event.key.toLowerCase();
          t.at = now;
          const start = t.text.length === 1 ? active : active - 1;
          for (let k = 1; k <= items.length; k++) {
            const i = (start + k) % items.length;
            const item = items[i] as DataGridMenuItem;
            if (enabled(item) && (item.label ?? item.id).toLowerCase().startsWith(t.text)) {
              setActive(i);
              break;
            }
          }
        } else handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  /** Pointer over item `index`: schedule opening its submenu, or closing another open one. */
  const hoverItem = (index: number): void => {
    const item = items[index] as DataGridMenuItem;
    const opens = enabled(item) && !!item.items?.length;
    if (open?.index === index || (!opens && !open)) {
      cancelHover();
      return;
    }
    if (hover.current.timer !== undefined && hover.current.index === index) return;
    cancelHover();
    hover.current.index = index;
    hover.current.timer = setTimeout(() => {
      hover.current.timer = undefined;
      hover.current.index = -1;
      if (opens) openSub(index);
      else setOpen(null);
    }, SUBMENU_HOVER_MS);
  };
  const sub = open ? (items[open.index] as DataGridMenuItem) : null;
  return (
    <DataGridPopover
      anchor={props.anchor}
      container={props.container}
      rtl={rtl}
      className={props.className ? `salmon-data-grid-menu ${props.className}` : 'salmon-data-grid-menu'}
      style={props.style}
      role="menu"
      label={props.label}
      side={props.side ?? 'block'}
      onDismiss={props.onClose}
      elementRef={listRef}
      onKeyDown={onKeyDown}
      {...(props.insideRefs ? { insideRefs: props.insideRefs } : {})}
      {...(props.dataAttributes ? { dataAttributes: props.dataAttributes } : {})}
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={item.id || `sep-${i}`} role="separator" className="salmon-data-grid-menu__separator" />;
        const Tag = item.href !== undefined ? 'a' : 'div';
        return (
          <Tag
            key={item.id}
            ref={(el: HTMLElement | null) => {
              itemRefs.current[i] = el;
            }}
            {...(item.href !== undefined ? { href: item.href, ...(item.target !== undefined ? { target: item.target } : {}) } : {})}
            role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked !== undefined ? item.checked : undefined}
            aria-disabled={item.disabled ? true : undefined}
            aria-haspopup={item.items?.length ? 'menu' : undefined}
            aria-expanded={item.items?.length ? open?.index === i : undefined}
            title={item.disabled ? item.disabledReason : undefined}
            tabIndex={i === active ? 0 : -1}
            className="salmon-data-grid-menu__item"
            data-item-id={item.id}
            data-active={i === active ? '' : undefined}
            onPointerMove={(event: { pointerType: string }) => {
              props.onPointerInside?.();
              if (enabled(item) && active !== i) setActive(i);
              if (event.pointerType !== 'touch') hoverItem(i);
            }}
            onClick={(event: { preventDefault(): void; detail?: number; nativeEvent?: unknown }) => {
              setActive(i);
              activate(i, clickSource(event), item.href !== undefined ? event : undefined);
            }}
          >
            {item.icon ? (
              <span className="salmon-data-grid-menu__icon" aria-hidden="true">
                {item.icon}
              </span>
            ) : item.checked !== undefined ? (
              <span className="salmon-data-grid-menu__check" aria-hidden="true" data-checked={item.checked ? '' : undefined} data-custom-icon={customIcon(icons, 'check')}>
                {item.checked ? icons?.check : null}
              </span>
            ) : (
              <span className="salmon-data-grid-menu__icon" aria-hidden="true" />
            )}
            <span className="salmon-data-grid-menu__text">{item.render ? item.render() : (item.label ?? item.id)}</span>
            {item.items?.length ? (
              <span className="salmon-data-grid-menu__submenu-arrow" aria-hidden="true" data-custom-icon={customIcon(icons, 'submenu')}>
                {icons?.submenu}
              </span>
            ) : null}
          </Tag>
        );
      })}
      {sub && open ? (
        <DataGridMenu
          items={sub.items ?? []}
          anchor={open.anchor}
          container={props.container}
          rtl={rtl}
          label={sub.label ?? sub.id}
          side="inline"
          insideRefs={[listRef]}
          onAction={props.onAction}
          onPointerInside={cancelHover}
          onClose={(reason) => {
            cancelHover();
            setOpen(null);
            // Escape and ArrowLeft close the submenu only; focus returns to its item.
            if (reason !== 'collapse' && reason !== 'escape') props.onClose(reason);
          }}
        />
      ) : null}
    </DataGridPopover>
  );
}
