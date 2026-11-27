'use client';

// ContextMenu: a trigger wrapper
// that opens a Menu family popup at a virtual point anchor on right-click,
// touch long-press (500 ms, cancelled by movement beyond 8 px), Shift+F10 and
// the ContextMenu key, and gives focus back to the element that had it. The
// input listeners are native (bound in an effect to the wrapper or to
// `targetRef`), so events from the portaled menu never reach them; the
// long-press timer and start point live in refs, never React state.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactElement, type ReactNode, type Ref, type RefObject } from 'react';
import { MenuRootContext } from './context.js';
import { MenuList, type MenuPopupConfig } from './list.js';
import { useMenuRootValue } from './Menu.js';
import { usePopupMenuContent } from './content.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV } from '@salmonui/core/internal/dev';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { isRtl } from '@salmonui/core/internal/position';
import type { MenuActionEvent, MenuItemData, MenuOpenChangeEvent, MenuOpenChangeReason, MenuSource, MenuSubmenuOpen } from './types.js';

/** Viewport coordinates in CSS px (`clientX` / `clientY`). */
export interface ContextMenuPoint {
  readonly x: number;
  readonly y: number;
}

/** Input that asked for the menu. */
export type ContextMenuSource = 'pointer' | 'touch' | 'keyboard';

/** `onBeforeOpen` event; `preventDefault()` keeps the menu closed (and the browser menu shows). */
export interface ContextMenuBeforeOpenEvent {
  /** The element the event happened on (the deepest target; filter with `closest`). */
  readonly target: Element;
  readonly point: ContextMenuPoint;
  readonly source: ContextMenuSource;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `onBeforeClose` event; `preventDefault()` keeps the menu open. */
export interface ContextMenuBeforeCloseEvent {
  readonly reason: MenuOpenChangeReason;
  readonly source: MenuSource;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface ContextMenuLocaleText {
  /** Accessible name of the menu when the `Menu` element has none. */
  readonly label: string;
}

export const CONTEXT_MENU_DEFAULT_LOCALE_TEXT: ContextMenuLocaleText = Object.freeze({ label: 'Context menu' });

/** Popup parts that accept `classNames` / `styles`. */
export type ContextMenuPart = 'menu';

export interface ContextMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The target: right-click, long-press or Shift+F10 inside it opens the menu. */
  readonly children?: ReactNode;
  /** A target element the component does not wrap (wins over the wrapper). */
  readonly targetRef?: RefObject<HTMLElement | null>;
  /** A `<Menu>` element (its entries, `aria-label`, `onAction`, `className` and `style` apply to the popup) or the entries themselves. */
  readonly menu?: ReactNode;
  /** Data form of the entries. */
  readonly items?: readonly MenuItemData[];
  readonly renderItem?: (item: MenuItemData) => ReactNode;
  /** Controlled open state. */
  readonly open?: boolean | undefined;
  /** Where the menu opens while controlled (default: the pointer, or the target's start corner). */
  readonly anchorPoint?: ContextMenuPoint | undefined;
  readonly onOpenChange?: (open: boolean, event: MenuOpenChangeEvent) => void;
  /** Cancellable; update the menu entries for `event.target` here. */
  readonly onBeforeOpen?: (event: ContextMenuBeforeOpenEvent) => void;
  /** Cancellable. */
  readonly onBeforeClose?: (event: ContextMenuBeforeCloseEvent) => void;
  /** A chosen item (any level); `event.preventDefault()` keeps the menu open. */
  readonly onAction?: (event: MenuActionEvent) => void;
  readonly submenuOpen?: MenuSubmenuOpen;
  readonly hoverDelay?: number;
  /** No menu opens; the browser menu shows. */
  readonly disabled?: boolean;
  /** Portal target (default `document.body`). */
  readonly container?: Element | null;
  readonly localeText?: Partial<ContextMenuLocaleText>;
  readonly classNames?: Partial<Record<ContextMenuPart, string>>;
  readonly styles?: Partial<Record<ContextMenuPart, CSSProperties>>;
  /** The wrapper element. */
  readonly ref?: Ref<HTMLDivElement>;
}

/** APG: a touch press held this long opens the menu. */
export const LONG_PRESS_MS = 500;
/** Movement beyond this many px cancels a long-press. */
export const LONG_PRESS_SLOP = 8;

type Point = ContextMenuPoint & { readonly rtl?: boolean | undefined };

function frozen<T extends object>(event: T): T {
  return DEV ? Object.freeze(event) : event;
}

function cancellable<T extends object>(fields: T): T & { readonly defaultPrevented: boolean; preventDefault(): void } {
  let prevented = false;
  return frozen({
    ...fields,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  });
}

/** Keyboard opening point: the start-bottom corner of the focused element. */
function keyboardPoint(el: Element): Point {
  const r = el.getBoundingClientRect();
  const rtl = isRtl(el);
  return { x: rtl ? r.right : r.left, y: r.bottom, rtl };
}

/**
 * Opens a menu at the pointer for its target. `<ContextMenu menu={<Menu>...</Menu>}>{target}</ContextMenu>`,
 * or `targetRef` for an element it does not wrap.
 */
export function ContextMenu(props: ContextMenuProps): ReactElement | null {
  const {
    children,
    targetRef,
    menu: menuNode,
    items,
    renderItem,
    open: openProp,
    anchorPoint,
    onOpenChange,
    onBeforeOpen,
    onBeforeClose,
    onAction,
    submenuOpen,
    hoverDelay,
    disabled,
    container,
    localeText,
    classNames,
    styles,
    ref,
    className,
    ...rest
  } = props;
  const text = useLocaleText('contextMenu', localeText);
  const own = useRef<HTMLElement | null>(null);
  const target = (targetRef ?? own) as RefObject<HTMLElement | null>;
  const [open, setOpen] = useControllableState(openProp, false, onOpenChange, 'ContextMenu open');
  const [point, setPoint] = useState<Point | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const restore = useRef(false);
  const latest = useRef({ props, open });
  useLayoutEffect(() => {
    latest.current = { props, open };
  });

  const close = (reason: MenuOpenChangeReason, source: MenuSource): void => {
    if (onBeforeClose) {
      const event = cancellable({ reason, source });
      onBeforeClose(event);
      if (event.defaultPrevented) return;
    }
    const doc = target.current?.ownerDocument;
    const active = doc?.activeElement;
    // Outside press: give focus back only when it would otherwise be lost.
    restore.current = reason !== 'outside' || !active || active === doc?.body || !!active.closest('[role="menu"]');
    setOpen(false, Object.freeze({ reason, source }));
  };
  const root = useMenuRootValue({
    onAction: (event) => {
      menu?.onAction?.(event);
      onAction?.(event);
    },
    close,
    popup: true,
    container,
    submenuOpen,
    hoverDelay,
  });
  const { content, menu } = usePopupMenuContent(menuNode, items, renderItem, 'ContextMenu');

  // Input listeners on the target (native: the portaled menu's events never reach them).
  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    const press = { timer: undefined as ReturnType<typeof setTimeout> | undefined, x: 0, y: 0, fired: false };
    const cancelPress = (): void => {
      clearTimeout(press.timer);
      press.timer = undefined;
    };
    /** Runs `onBeforeOpen` and opens at the point; false when cancelled or disabled. */
    const request = (from: Element, p: Point, source: ContextMenuSource): boolean => {
      const { props: current, open: isOpen } = latest.current;
      if (current.disabled) return false;
      if (current.onBeforeOpen) {
        const event = cancellable({ target: from, point: Object.freeze({ x: p.x, y: p.y }), source });
        current.onBeforeOpen(event);
        if (event.defaultPrevented) return false;
      }
      if (!isOpen) {
        const active = el.ownerDocument.activeElement as HTMLElement | null;
        returnTo.current = active && el.contains(active) ? active : el;
      }
      setPoint({ x: p.x, y: p.y, rtl: p.rtl ?? isRtl(from) });
      setOpen(true, Object.freeze({ reason: 'trigger' as const, source }));
      return true;
    };
    const onContextMenu = (event: MouseEvent): void => {
      if (press.fired) {
        // The browser's own long-press contextmenu after ours.
        press.fired = false;
        event.preventDefault();
        return;
      }
      cancelPress();
      const source = (event as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer';
      if (request(event.target as Element, { x: event.clientX, y: event.clientY }, source)) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) return;
      const from = event.target as Element;
      if (request(from, keyboardPoint(from), 'keyboard')) event.preventDefault();
    };
    const onPointerDown = (event: PointerEvent): void => {
      press.fired = false;
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      cancelPress();
      press.x = event.clientX;
      press.y = event.clientY;
      const from = event.target as Element;
      press.timer = setTimeout(() => {
        press.timer = undefined;
        press.fired = request(from, { x: press.x, y: press.y }, 'touch');
      }, LONG_PRESS_MS);
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (press.timer !== undefined && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP) cancelPress();
    };
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove, { passive: true });
    el.addEventListener('pointerup', cancelPress);
    el.addEventListener('pointercancel', cancelPress);
    return () => {
      cancelPress();
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', cancelPress);
      el.removeEventListener('pointercancel', cancelPress);
    };
  }, [target]);

  // Opened through `open` without a pointer: place at the target (or `anchorPoint`) and remember
  // the focus to restore. Closed: forget the point and restore focus once the popup is gone.
  useLayoutEffect(() => {
    const el = target.current;
    if (open) {
      if (point || !el) return;
      const active = el.ownerDocument.activeElement as HTMLElement | null;
      returnTo.current = active && el.contains(active) ? active : el;
      setPoint(keyboardPoint(el));
      return;
    }
    if (point) setPoint(null);
    if (restore.current) {
      restore.current = false;
      returnTo.current?.focus({ preventScroll: true });
    }
    // `point` is read, not tracked: it only changes together with `open` here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  const at: Point | null = open && point ? (anchorPoint ? { x: anchorPoint.x, y: anchorPoint.y, rtl: point.rtl } : point) : null;
  const ax = at?.x;
  const ay = at?.y;
  const artl = at?.rtl;
  const popup = useMemo<MenuPopupConfig | null>(
    () => (ax === undefined || ay === undefined ? null : { anchorRef: target, side: 'block', point: { x: ax, y: ay, rtl: !!artl }, onOutside: () => root.close('outside', 'pointer') }),
    [ax, ay, artl, target, root],
  );

  const menuClass = ['salmon-menu', menu?.className, classNames?.menu].filter(Boolean).join(' ');
  const popupElement = popup ? (
    <MenuRootContext value={root}>
      <MenuList
        className={menuClass}
        style={menu?.style || styles?.menu ? { ...menu?.style, ...styles?.menu } : undefined}
        label={menu?.['aria-labelledby'] ? undefined : (menu?.['aria-label'] ?? text?.label ?? CONTEXT_MENU_DEFAULT_LOCALE_TEXT.label)}
        labelledBy={menu?.['aria-labelledby']}
        popup={popup}
        autoFocus="first"
      >
        {content}
      </MenuList>
    </MenuRootContext>
  ) : null;

  if (targetRef && children == null) return popupElement;
  const setRef = (el: HTMLDivElement | null): void => {
    own.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <div {...rest} ref={setRef} className={className ? `salmon-context-menu ${className}` : 'salmon-context-menu'} data-open={open ? '' : undefined}>
      {children}
      {popupElement}
    </div>
  );
}
