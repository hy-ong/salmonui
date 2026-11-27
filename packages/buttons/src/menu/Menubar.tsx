'use client';

// Menubar: APG Menubar over the
// Menu family. One tab stop with DOM-driven roving focus over the top-level
// items (no React state per arrow key), ArrowLeft / ArrowRight mirrored in RTL,
// ArrowDown / Enter / Space open a menu, and while a menu is open, moving to
// another top-level item (arrows from inside the menu, or the pointer) opens
// that one. `value` is the open top-level menu. `overflow: 'scroll'` scrolls
// the bar; its start / end indicators are toggled from scroll and resize
// listeners through data attributes, never React state.

import { createContext, use, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type Ref, type CSSProperties } from 'react';
import { MenuRootContext } from './context.js';
import { MenuList } from './list.js';
import { createActionEvent, useMenuRootValue, type MenuItemRenderProps } from './Menu.js';
import { usePopupMenuContent } from './content.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV } from '@salmonui/core/internal/dev';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { isRtl } from '@salmonui/core/internal/position';
import { pressSource } from '@salmonui/core/internal/press';
import { applyRovingMove, isTypeaheadKey, useTypeahead } from '@salmonui/core/internal/roving';
import type { MenuActionEvent, MenuItemData, MenuOpenChangeReason, MenuSource, MenuSubmenuOpen } from './types.js';

/** Why the open top-level menu changed; `'navigate'` is an arrow key or the pointer moving across the bar. */
export type MenubarValueChangeReason = MenuOpenChangeReason | 'navigate';

/** Second argument of `onValueChange` (frozen in development). */
export interface MenubarValueChangeEvent {
  readonly reason: MenubarValueChangeReason;
  readonly source: MenuSource;
}

/** `onBeforeValueChange`; `preventDefault()` keeps the current menu (or none) open. */
export interface MenubarBeforeValueChangeEvent extends MenubarValueChangeEvent {
  /** The proposed open menu, or `null` to close. */
  readonly value: string | null;
  readonly previousValue: string | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface MenubarLocaleText {
  /** Title of the scroll indicator at the start (`overflow: 'scroll'`). */
  readonly scrollBackward: string;
  readonly scrollForward: string;
}

export const MENUBAR_DEFAULT_LOCALE_TEXT: MenubarLocaleText = Object.freeze({ scrollBackward: 'Scroll backward', scrollForward: 'Scroll forward' });

export interface MenubarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'defaultValue' | 'role' | 'onChange'> {
  /** `MenubarMenu` and `MenubarItem` elements. */
  readonly children?: ReactNode;
  /** The open top-level menu (`MenubarMenu value`), or `null`. */
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null;
  readonly onValueChange?: (value: string | null, event: MenubarValueChangeEvent) => void;
  readonly onBeforeValueChange?: (event: MenubarBeforeValueChangeEvent) => void;
  /** A chosen item of any menu or a `MenubarItem`; `event.preventDefault()` keeps the menu open. */
  readonly onAction?: (event: MenuActionEvent) => void;
  /** `'hover'` (default): nested submenus open after `hoverDelay`, and while a menu is open the pointer moves it across the bar. `'click'`: both need a click. */
  readonly submenuOpen?: MenuSubmenuOpen;
  readonly hoverDelay?: number;
  /** `'scroll'`: the bar scrolls when its items do not fit, with indicators at the ends. Default `'none'`. */
  readonly overflow?: 'none' | 'scroll';
  /** Portal target of the menus (default `document.body`). */
  readonly container?: Element | null;
  readonly localeText?: Partial<MenubarLocaleText>;
  /** The `role="menubar"` element. */
  readonly ref?: Ref<HTMLDivElement>;
}

type Edge = 'first' | 'last' | null;

interface MenubarContextValue {
  readonly value: string | null;
  readonly edge: Edge;
  /** The open menu now, including a change proposed earlier in the same event. */
  readonly current: () => string | null;
  readonly request: (value: string | null, reason: MenubarValueChangeReason, source: MenuSource, edge?: Edge) => boolean;
  readonly onAction: (event: MenuActionEvent) => void;
  readonly submenuOpen: MenuSubmenuOpen;
  readonly hoverDelay: number | undefined;
  readonly container: Element | null | undefined;
}

const MenubarContext = createContext<MenubarContextValue | null>(null);

function useMenubar(component: string): MenubarContextValue {
  const bar = use(MenubarContext);
  if (!bar) throw new Error(`[salmonui] <${component}> must be rendered inside a <Menubar>.`);
  return bar;
}

const TOP = ':scope > [role="menuitem"]';

function enabled(el: Element | undefined): el is HTMLElement {
  return !!el && el.getAttribute('aria-disabled') !== 'true';
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}

const ARROW = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);

/** APG Menubar: `role="menubar"`, horizontal, one tab stop. */
export function Menubar(props: MenubarProps): ReactElement {
  const { children, value: valueProp, defaultValue, onValueChange, onBeforeValueChange, onAction, submenuOpen = 'hover', hoverDelay, overflow = 'none', container, localeText, ref, className, onKeyDown, onFocus, ...rest } = props;
  const [value, setValue] = useControllableState<string | null, [MenubarValueChangeEvent]>(valueProp, defaultValue ?? null, onValueChange, 'Menubar value');
  const [edge, setEdge] = useState<Edge>('first');
  const own = useRef<HTMLDivElement | null>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const typeahead = useTypeahead();
  const labels = useRef<WeakMap<Element, string>>(new WeakMap());
  const latest = useRef({ value, onBeforeValueChange, onAction, setValue });
  useLayoutEffect(() => {
    latest.current = { value, onBeforeValueChange, onAction, setValue };
  });

  const ctx = useMemo<MenubarContextValue>(
    () => ({
      value,
      edge,
      current: () => latest.current.value,
      request(next, reason, source, nextEdge = 'first') {
        const l = latest.current;
        if (Object.is(next, l.value)) return true;
        if (l.onBeforeValueChange) {
          let prevented = false;
          const event: MenubarBeforeValueChangeEvent = {
            value: next,
            previousValue: l.value,
            reason,
            source,
            get defaultPrevented() {
              return prevented;
            },
            preventDefault() {
              prevented = true;
            },
          };
          l.onBeforeValueChange(DEV ? Object.freeze(event) : event);
          if (prevented) return false;
        }
        setEdge(nextEdge);
        l.value = next;
        l.setValue(next, DEV ? Object.freeze({ reason, source }) : { reason, source });
        return true;
      },
      onAction(event) {
        latest.current.onAction?.(event);
      },
      submenuOpen,
      hoverDelay,
      container,
    }),
    [value, edge, submenuOpen, hoverDelay, container],
  );

  const items = (): HTMLElement[] => (own.current ? [...own.current.querySelectorAll<HTMLElement>(TOP)] : []);

  // The roving tab stop: the first enabled item until one takes focus (set in the DOM, not React state).
  useLayoutEffect(() => {
    const h = highlighted.current;
    if (h?.isConnected && own.current?.contains(h)) return;
    const first = items().find((el) => enabled(el));
    if (first) first.tabIndex = 0;
    highlighted.current = first ?? null;
  });

  // overflow: 'scroll' indicators.
  useLayoutEffect(() => {
    const el = own.current;
    if (overflow !== 'scroll' || !el) return;
    const update = (): void => {
      const start = Math.abs(el.scrollLeft);
      el.toggleAttribute('data-scroll-start', start > 1);
      el.toggleAttribute('data-scroll-end', start + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [overflow]);

  const focusEl = (el: HTMLElement | undefined): void => {
    if (el && el.ownerDocument.activeElement !== el) el.focus();
  };
  const popupOf = (trigger: HTMLElement): HTMLElement | null => {
    const id = trigger.getAttribute('aria-controls');
    return id ? trigger.ownerDocument.getElementById(id) : null;
  };
  /** Moves to a top-level item; `open` opens its menu (closing any other). */
  const moveTo = (el: HTMLElement, open: boolean, source: MenuSource): void => {
    const menuValue = el.getAttribute('aria-haspopup') ? el.dataset['value'] : undefined;
    if (open && menuValue !== undefined) {
      if (!ctx.request(menuValue, 'navigate', source, 'first')) focusEl(el);
      return;
    }
    ctx.request(null, 'navigate', source);
    focusEl(el);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const bar = event.currentTarget;
    const all = items();
    const target = event.target as HTMLElement;
    const rtl = isRtl(bar);
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const enabledAt = (i: number): boolean => enabled(all[i]);
    const step = (from: number, key: string): HTMLElement | undefined => all[applyRovingMove(key === forward ? 'next' : 'prev', all.length, from, enabledAt)];
    if (!bar.contains(target)) {
      // From an open menu (React events bubble through the portal): the menu did not use the key.
      if (event.key !== forward && event.key !== back) return;
      const from = all.findIndex((el) => el.getAttribute('aria-expanded') === 'true');
      const next = from < 0 ? undefined : step(from, event.key);
      if (!next) return;
      moveTo(next, true, 'keyboard');
      event.preventDefault();
      return;
    }
    const active = all.indexOf(target);
    if (active < 0) return;
    const current = all[active] as HTMLElement;
    const hasMenu = current.hasAttribute('aria-haspopup');
    const isOpen = current.getAttribute('aria-expanded') === 'true';
    const openMenu = (at: 'first' | 'last'): void => {
      if (!enabled(current) || !hasMenu) return;
      if (isOpen) {
        const list = popupOf(current);
        const entries = list ? [...list.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter((el) => el.closest('[role="menu"]') === list && enabled(el)) : [];
        focusEl(at === 'first' ? entries[0] : entries[entries.length - 1]);
      } else ctx.request(current.dataset['value'] ?? null, 'trigger', 'keyboard', at);
    };
    switch (event.key) {
      case forward:
      case back: {
        const next = step(active, event.key);
        if (next) moveTo(next, ctx.value !== null, 'keyboard');
        break;
      }
      case 'Home':
      case 'End': {
        const next = all[applyRovingMove(event.key === 'Home' ? 'first' : 'last', all.length, active, enabledAt)];
        if (next) moveTo(next, false, 'keyboard');
        break;
      }
      case 'ArrowDown':
        openMenu('first');
        break;
      case 'ArrowUp':
        openMenu('last');
        break;
      case 'Enter':
      case ' ':
        if (hasMenu) openMenu('first');
        else current.click();
        break;
      case 'Escape':
        if (ctx.value === null) return;
        ctx.request(null, 'escape', 'keyboard');
        break;
      default: {
        if (!isTypeaheadKey(event)) return;
        const labelOf = (i: number): string => {
          const el = all[i] as HTMLElement;
          let text = labels.current.get(el);
          if (text === undefined) labels.current.set(el, (text = (el.dataset['textValue'] ?? el.textContent ?? '').trim()));
          return text;
        };
        const i = typeahead(event.key, event.timeStamp, all.length, active, labelOf, enabledAt);
        if (i >= 0) moveTo(all[i] as HTMLElement, false, 'keyboard');
      }
    }
    event.preventDefault();
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>): void => {
    onFocus?.(event);
    const el = event.target as HTMLElement;
    if (el.parentElement !== event.currentTarget || el.getAttribute('role') !== 'menuitem') return;
    const prev = highlighted.current;
    if (prev && prev !== el) prev.tabIndex = -1;
    el.tabIndex = 0;
    highlighted.current = el;
  };

  const scrollBy = (direction: 1 | -1) => (event: MouseEvent<HTMLElement>): void => {
    const el = own.current;
    if (!el) return;
    event.preventDefault();
    el.scrollBy({ left: direction * (isRtl(el) ? -1 : 1) * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  const text = { ...MENUBAR_DEFAULT_LOCALE_TEXT, ...useLocaleText('menubar', localeText) };
  const setRef = (el: HTMLDivElement | null): void => {
    own.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <div
      {...rest}
      ref={setRef}
      role="menubar"
      aria-orientation="horizontal"
      className={cx('salmon-menubar', className)}
      data-overflow={overflow === 'scroll' ? 'scroll' : undefined}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
    >
      {overflow === 'scroll' ? (
        <span className="salmon-menubar-scroll" data-direction="backward" aria-hidden="true" title={text.scrollBackward} onClick={scrollBy(-1)}>
          {ARROW}
        </span>
      ) : null}
      <MenubarContext value={ctx}>{children}</MenubarContext>
      {overflow === 'scroll' ? (
        <span className="salmon-menubar-scroll" data-direction="forward" aria-hidden="true" title={text.scrollForward} onClick={scrollBy(1)}>
          {ARROW}
        </span>
      ) : null}
    </div>
  );
}

type TopItemDomProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'role' | 'id' | 'className' | 'style'>;

export interface MenubarMenuProps extends TopItemDomProps {
  /** Key of this menu in `Menubar value` (default generated). */
  readonly value?: string;
  /** Content of the top-level item (`ReactNode`). */
  readonly label: ReactNode;
  /** Decorative leading icon (`aria-hidden`). */
  readonly icon?: ReactNode;
  /** Skipped by arrow keys and typeahead; `aria-disabled="true"`. */
  readonly disabled?: boolean;
  /** Typeahead text when `label` is not plain text. */
  readonly textValue?: string;
  /** A `<Menu>` element (its entries, `aria-label`, `onAction`, `className` and `style` apply to the popup) or the entries themselves. */
  readonly children?: ReactNode;
  readonly items?: readonly MenuItemData[];
  readonly renderItem?: (item: MenuItemData) => ReactNode;
  /** DOM id of the top-level item (default generated; the menu is labelled by it). */
  readonly id?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly menuClassName?: string;
  readonly menuStyle?: CSSProperties;
  /** The top-level `role="menuitem"` element. */
  readonly ref?: Ref<HTMLDivElement>;
}

function ItemBody(props: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      {props.icon != null ? (
        <span className="salmon-menubar-item-icon" aria-hidden="true">
          {props.icon}
        </span>
      ) : null}
      <span className="salmon-menubar-item-label">{props.children}</span>
    </>
  );
}

/** A top-level item that opens a menu (`aria-haspopup="menu"`, `aria-expanded`). */
export function MenubarMenu(props: MenubarMenuProps): ReactElement {
  const bar = useMenubar('MenubarMenu');
  const { value: valueProp, label, icon, disabled, textValue, children, items, renderItem, id, className, style, menuClassName, menuStyle, ref, onClick, onPointerEnter, ...rest } = props;
  const autoValue = useId();
  const autoId = useId();
  const menuId = useId();
  const value = valueProp ?? autoValue;
  const triggerId = id ?? autoId;
  const open = bar.value === value;
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const close = (reason: MenuOpenChangeReason, source: MenuSource): void => {
    // A menu that the bar already moved away from (focus left it for the next one).
    if (bar.current() !== value) return;
    const trigger = triggerRef.current;
    const doc = trigger?.ownerDocument;
    const active = doc?.activeElement;
    const lost = !active || active === doc?.body || !!active.closest('[role="menu"]');
    if (bar.request(null, reason, source) && (reason !== 'outside' || lost)) trigger?.focus({ preventScroll: true });
  };
  const { content, menu } = usePopupMenuContent(children, items, renderItem, 'MenubarMenu');
  const root = useMenuRootValue({
    onAction: (event) => {
      menu?.onAction?.(event);
      bar.onAction(event);
    },
    close,
    popup: true,
    container: bar.container,
    submenuOpen: bar.submenuOpen,
    hoverDelay: bar.hoverDelay,
  });
  const popup = useMemo(() => ({ anchorRef: triggerRef as { current: HTMLElement | null }, side: 'block' as const, placement: 'bottom-start' as const, onOutside: () => root.close('outside', 'pointer') }), [root]);
  const setRef = (el: HTMLDivElement | null): void => {
    triggerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <>
      <div
        {...(rest as HTMLAttributes<HTMLDivElement>)}
        ref={setRef}
        id={triggerId}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={disabled ? true : undefined}
        className={cx('salmon-menubar-item', className)}
        style={style}
        data-value={value}
        data-open={open ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        data-text-value={textValue}
        onClick={(event: MouseEvent<HTMLDivElement>) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled) return;
          const source = pressSource(event);
          if (open) close('trigger', source);
          else bar.request(value, 'trigger', source, 'first');
        }}
        onPointerEnter={(event: ReactPointerEvent<HTMLDivElement>) => {
          onPointerEnter?.(event);
          // APG: while a menu is open, the pointer moves it across the bar.
          if (event.pointerType === 'touch' || disabled || open || bar.value === null || bar.submenuOpen === 'click') return;
          if (bar.request(value, 'navigate', 'pointer', null)) triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <ItemBody icon={icon}>{label}</ItemBody>
      </div>
      {open ? (
        <MenuRootContext value={root}>
          <MenuList
            id={menuId}
            className={cx('salmon-menu', menu?.className, menuClassName)}
            style={menu?.style || menuStyle ? { ...menu?.style, ...menuStyle } : undefined}
            label={menu?.['aria-label']}
            labelledBy={menu?.['aria-label'] ? undefined : triggerId}
            popup={popup}
            autoFocus={bar.edge}
          >
            {content}
          </MenuList>
        </MenuRootContext>
      ) : null}
    </>
  );
}

export interface MenubarItemProps extends TopItemDomProps {
  /** Stable key reported in `onAction`. */
  readonly id: string;
  readonly children?: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly textValue?: string;
  /** Renders `<a role="menuitem" href>`. */
  readonly href?: string;
  readonly target?: string;
  /** Runs before the bar's `onAction`; `event.preventDefault()` stops link navigation. */
  readonly onAction?: (event: MenuActionEvent) => void;
  /** Custom element (router links): `render={(props) => <Link {...props} to="/help" />}`; spread every prop. */
  readonly render?: (props: MenuItemRenderProps) => ReactElement;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ref?: Ref<HTMLElement>;
}

/** A top-level command or link without a menu. */
export function MenubarItem(props: MenubarItemProps): ReactElement {
  const bar = useMenubar('MenubarItem');
  const { id, children, icon, disabled, textValue, href, target, onAction, render, className, style, ref, onClick, ...rest } = props;
  const common = {
    ...rest,
    role: 'menuitem',
    tabIndex: -1,
    className: cx('salmon-menubar-item', className),
    style,
    'aria-disabled': disabled ? true : undefined,
    'data-item-id': id,
    'data-disabled': disabled ? '' : undefined,
    'data-text-value': textValue,
    onClick: (event: MouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (disabled) {
        event.preventDefault();
        return;
      }
      const action = createActionEvent(id, undefined, pressSource(event));
      onAction?.(action);
      bar.onAction(action);
      if (action.defaultPrevented && href !== undefined) event.preventDefault();
    },
  };
  const body = <ItemBody icon={icon}>{children}</ItemBody>;
  if (render) {
    const link = href !== undefined && !disabled ? { href, ...(target !== undefined ? { target } : {}) } : {};
    return render({ ...common, ...link, ref: (el: HTMLElement | null) => (typeof ref === 'function' ? ref(el) : ref ? (ref.current = el) : undefined), children: body } as MenuItemRenderProps);
  }
  return href !== undefined && !disabled ? (
    <a {...common} ref={ref as Ref<HTMLAnchorElement>} href={href} target={target}>
      {body}
    </a>
  ) : (
    <div {...common} ref={ref as Ref<HTMLDivElement>}>
      {body}
    </div>
  );
}
