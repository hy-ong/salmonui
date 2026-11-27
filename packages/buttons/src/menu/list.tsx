// The `role="menu"` element shared by `Menu`, the popup of `MenuButton` and
// `Submenu`: DOM-driven roving focus (no React state, so arrow keys and
// pointer moves never re-render 1,000 items), typeahead, Enter / Space
// activation through a synthetic click, submenu keys mirrored in RTL, hover
// intent in refs, and, for popups, placement and outside-press dismissal.

import { use, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { useDismiss } from '@salmonui/core/internal/dismiss';
import { Portal, themeScopeOf, useOverlayPosition, useTopLayer } from '@salmonui/core/internal/overlay';
import { isRtl, pointRect, type AnchorRect } from '@salmonui/core/internal/position';
import { applyRovingMove, firstEnabled, isTypeaheadKey, lastEnabled, rovingMove, useTypeahead } from '@salmonui/core/internal/roving';
import { MenuListContext, MenuRootContext, type MenuListContextValue, type SubmenuController } from './context.js';
import type { MenuPlacement } from './types.js';

/** APG / hover intent: submenus open (and close) after the pointer rests this long. */
export const SUBMENU_HOVER_MS = 200;

const ITEM = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';

export interface MenuPopupConfig {
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly side: 'block' | 'inline';
  readonly placement?: MenuPlacement;
  /** Minimum width of the anchor (the trigger). */
  readonly matchWidth?: boolean;
  /** Outside pointer press or focus moving out of the tree (root popup only). */
  readonly onOutside?: () => void;
  /**
   * Virtual point anchor in viewport px (context menus): the popup opens at the point instead of
   * next to `anchorRef`, whose element then only gives the direction and does not count as inside.
   */
  readonly point?: { readonly x: number; readonly y: number; readonly rtl: boolean } | undefined;
}

export interface MenuListProps {
  readonly id?: string | undefined;
  readonly className: string;
  readonly style?: CSSProperties | undefined;
  readonly label?: string | undefined;
  readonly labelledBy?: string | undefined;
  readonly popup?: MenuPopupConfig | undefined;
  /** Focus moved into the list on mount: first or last enabled item. */
  readonly autoFocus?: 'first' | 'last' | null | undefined;
  /** Submenu lists: closes this level (Escape, back arrow) and refocuses the trigger. */
  readonly closeSelf?: (() => void) | undefined;
  /** Submenu lists: the pointer entered this list (the parent cancels a pending hover close). */
  readonly onPointerInside?: (() => void) | undefined;
  readonly elementRef?: RefObject<HTMLDivElement | null> | undefined;
  /** The consumer's `ref` to the `role="menu"` element. */
  readonly externalRef?: Ref<HTMLDivElement> | undefined;
  readonly rest?: Readonly<Record<string, unknown>> | undefined;
  readonly children: ReactNode;
}

function enabled(el: Element | undefined): el is HTMLElement {
  return !!el && el.getAttribute('aria-disabled') !== 'true';
}

function focusItem(el: HTMLElement): void {
  if (el.ownerDocument.activeElement !== el) el.focus({ preventScroll: false });
}

export function MenuList(props: MenuListProps) {
  const root = use(MenuRootContext);
  const anchorRef = props.popup?.anchorRef;
  // The portal wraps the list so the list's layout effects run once its element is mounted. The
  // popup portals into the anchor's nearest open modal dialog (everything outside is inert;
  // modal-host.ts) or ThemeProvider scope (so the theme variables apply), else the body; the
  // anchor ref is read in the portal's store snapshot, not during render.
  return props.popup ? (
    <Portal container={() => root?.container ?? themeScopeOf(anchorRef?.current)}>
      <MenuListElement {...props} />
    </Portal>
  ) : (
    <MenuListElement {...props} />
  );
}

function MenuListElement(props: MenuListProps) {
  const root = use(MenuRootContext);
  const parent = use(MenuListContext);
  const own = useRef<HTMLDivElement | null>(null);
  const ref = props.elementRef ?? own;
  const level = parent ? parent.level + 1 : 0;
  // Transients: refs only.
  const typeahead = useTypeahead();
  const labels = useRef<WeakMap<Element, string>>(new WeakMap());
  const highlighted = useRef<HTMLElement | null>(null);
  const hover = useRef<{ timer: ReturnType<typeof setTimeout> | undefined; el: Element | null }>({ timer: undefined, el: null });
  const ctx = useMemo<MenuListContextValue>(
    () => ({
      level,
      subs: new Map(),
      openSub: { current: null },
      cancelHover() {
        clearTimeout(hover.current.timer);
        hover.current.timer = undefined;
        hover.current.el = null;
      },
    }),
    [level],
  );
  const { popup, autoFocus } = props;

  const items = (): HTMLElement[] => {
    const list = ref.current;
    if (!list) return [];
    const out: HTMLElement[] = [];
    for (const el of list.querySelectorAll<HTMLElement>(ITEM)) if (el.closest('[role="menu"]') === list) out.push(el);
    return out;
  };
  const labelOf = (el: HTMLElement): string => {
    let text = labels.current.get(el);
    if (text === undefined) {
      text = (el.dataset['textValue'] ?? el.textContent ?? '').trim();
      labels.current.set(el, text);
    }
    return text;
  };
  const cancelHover = ctx.cancelHover;
  useEffect(() => () => clearTimeout(hover.current.timer), []);

  // Popup: direction and minimum width first (they change the measured size), then the shared
  // top layer, placement (one read, one write, follows scroll and resize) and dismiss layer.
  const anchorRef = popup?.anchorRef ?? NO_ANCHOR;
  const matchWidth = popup?.matchWidth;
  const point = popup?.point;
  const px = point?.x;
  const py = point?.y;
  const pointAnchor = useMemo<AnchorRect | null>(() => (px === undefined || py === undefined ? null : pointRect(px, py)), [px, py]);
  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = anchorRef.current;
    if (!el || !anchor || !popup) return;
    el.dir = isRtl(anchor) ? 'rtl' : 'ltr';
    // A custom property, not an inline min-width: the menu CSS takes the larger of it and the
    // system minimum, and a `styles.menu` min-inline-size from the user still wins.
    if (matchWidth) el.style.setProperty('--salmon-menu-anchor-width', `${anchor.offsetWidth}px`);
  }, [ref, anchorRef, popup, matchWidth]);
  useTopLayer(ref, !!popup);
  useOverlayPosition(ref, pointAnchor ?? anchorRef, {
    placement: popup?.side === 'inline' ? 'end-start' : (popup?.placement ?? 'bottom-start'),
    offset: popup?.side === 'inline' || pointAnchor ? 0 : 2,
    rtl: point?.rtl,
    // A point does not move with scrolling (the pointer stays where it was).
    autoUpdate: !!popup && !pointAnchor,
  });
  // Every popup of the tree is a layer, so a press or focus in a submenu counts as inside the
  // menu that opened it; only the root list dismisses (Escape is handled by the keys below).
  const isRoot = !!popup && !parent && !!root?.popup;
  useDismiss(ref, {
    enabled: !!popup,
    onDismiss: () => {
      if (isRoot) popup?.onOutside?.();
    },
    insideRefs: point ? [] : [anchorRef],
    outsidePress: isRoot,
    escape: false,
    focusOutside: isRoot,
  });

  // Initial focus (popups) or the roving tab stop (standalone menus). After the top layer effect:
  // an element inside a popover that is not shown yet cannot take focus.
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const all = items();
    if (autoFocus) {
      const index = autoFocus === 'last' ? lastEnabled(all.length, (i) => enabled(all[i])) : firstEnabled(all.length, (i) => enabled(all[i]));
      const el = all[index];
      // A ring only when the open came from the keyboard: the element that had focus (trigger, menubar
      // item, context target) shows its own ring. A mouse open leaves focus on the body (Safari) or on an
      // element without one (the body never matches), and `focusVisible: false` keeps engines that treat
      // script focus as visible (Safari, Firefox) from ringing the first item.
      if (enabled(el)) el.focus({ preventScroll: true, focusVisible: !!list.ownerDocument.activeElement?.matches(':focus-visible') } as FocusOptions);
      // Every item disabled: focus the menu itself so Escape and Tab still close it.
      else list.focus({ preventScroll: true });
    } else if (!popup && !highlighted.current) {
      const first = all.find((el) => enabled(el));
      if (first) first.tabIndex = 0;
      highlighted.current = first ?? null;
    }
  }, [autoFocus, popup, ref]);

  /** Events bubble through portals in React: handle only this list's own DOM. */
  const owns = (event: { currentTarget: Element; target: EventTarget }): boolean => event.currentTarget.contains(event.target as Node);

  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const el = (event.target as Element).closest?.(ITEM) as HTMLElement | null;
    if (!el || !owns(event) || el.closest('[role="menu"]') !== event.currentTarget) return;
    const prev = highlighted.current;
    if (prev && prev !== el) {
      prev.removeAttribute('data-highlighted');
      prev.tabIndex = -1;
    }
    el.setAttribute('data-highlighted', '');
    el.tabIndex = 0;
    highlighted.current = el;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!owns(event)) return;
    const list = event.currentTarget;
    const all = items();
    const active = all.indexOf(list.ownerDocument.activeElement as HTMLElement);
    const current = all[active];
    const rtl = isRtl(list);
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const enabledAt = (i: number): boolean => enabled(all[i]);
    const go = (i: number): void => {
      const el = all[i];
      if (el) focusItem(el);
    };
    let handled = true;
    const move = event.key === 'PageUp' ? 'first' : event.key === 'PageDown' ? 'last' : rovingMove(event.key, { orientation: 'vertical' });
    if (event.key === 'ArrowUp' && event.altKey && root?.popup) root.close('escape', 'keyboard');
    else if (move) go(applyRovingMove(move, all.length, active, enabledAt));
    else switch (event.key) {
      case 'Enter':
      case ' ':
        if (current && enabled(current)) {
          const sub = ctx.subs.get(current);
          if (sub) sub.open(true);
          else {
            root?.setKey(event.key);
            current.click();
            root?.setKey(null);
          }
        }
        break;
      case 'Escape':
        if (props.closeSelf) props.closeSelf();
        else if (root?.popup) root.close('escape', 'keyboard');
        else handled = false;
        break;
      case 'Tab':
        if (root?.popup) {
          // Focus goes back to the trigger first; the default Tab action then moves on from there.
          root.close('tab', 'keyboard');
          event.stopPropagation();
          return;
        }
        handled = false;
        break;
      default:
        if (event.key === forward && current && enabled(current) && ctx.subs.has(current)) ctx.subs.get(current)?.open(true);
        else if (event.key === back && props.closeSelf) props.closeSelf();
        else if (isTypeaheadKey(event)) {
          const i = typeahead(event.key, event.timeStamp, all.length, active, (n) => labelOf(all[n] as HTMLElement), enabledAt);
          if (i >= 0) go(i);
        } else handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!owns(event)) return;
    props.onPointerInside?.();
    if (event.pointerType === 'touch') return;
    const el = (event.target as Element).closest?.(ITEM) as HTMLElement | null;
    if (!el || el.closest('[role="menu"]') !== event.currentTarget) return;
    if (enabled(el)) focusItem(el);
    // `submenuOpen: 'click'`: submenus open and close only by click and keyboard.
    if (root?.submenuOpen === 'click') return;
    // Hover intent: open this item's submenu, or close another open one, after a rest.
    const sub = enabled(el) ? ctx.subs.get(el) : undefined;
    const open = ctx.openSub.current;
    if ((sub && open === sub) || (!sub && !open)) {
      cancelHover();
      return;
    }
    if (hover.current.timer !== undefined && hover.current.el === el) return;
    cancelHover();
    hover.current.el = el;
    hover.current.timer = setTimeout(() => {
      hover.current.timer = undefined;
      hover.current.el = null;
      if (sub) sub.open(false);
      else ctx.openSub.current?.close(false);
    }, root?.hoverDelay ?? SUBMENU_HOVER_MS);
  };

  const { externalRef } = props;
  const setRef = (el: HTMLDivElement | null): void => {
    ref.current = el;
    if (typeof externalRef === 'function') externalRef(el);
    else if (externalRef) externalRef.current = el;
  };
  const element = (
    <div
      {...props.rest}
      ref={externalRef ? setRef : ref}
      id={props.id ?? (props.rest?.['id'] as string | undefined)}
      role="menu"
      tabIndex={-1}
      className={props.className}
      style={popup ? { ...POPUP_STYLE, ...props.style } : props.style}
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      aria-orientation="vertical"
      data-salmon-menu-root={popup ? root?.rootId : undefined}
      data-popup={popup ? '' : undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onPointerMove={onPointerMove}
      // A context menu key or long-press inside a popup menu never shows the browser menu over it.
      onContextMenu={popup ? preventDefault : undefined}
    >
      <MenuListContext value={ctx}>{props.children}</MenuListContext>
    </div>
  );
  return element;
}

const POPUP_STYLE: CSSProperties = Object.freeze({ position: 'fixed', top: 0, left: 0, right: 'auto', bottom: 'auto', margin: 0 }) as CSSProperties;
const preventDefault = (event: { preventDefault(): void }): void => event.preventDefault();
const NO_ANCHOR: RefObject<HTMLElement | null> = Object.freeze({ current: null });

export type { SubmenuController };
