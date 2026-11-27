'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { MenuRootContext } from './context.js';
import { MenuList } from './list.js';
import { useMenuContent, useMenuRootValue } from './Menu.js';
import { Button, type ButtonAccessibleName, type ButtonBaseProps } from '../button/Button.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { pressSource as clickSource } from '@salmonui/core/internal/press';
import type { MenuActionEvent, MenuItemData, MenuOpenChangeEvent, MenuOpenChangeReason, MenuPlacement, MenuSource, MenuSubmenuOpen } from './types.js';

/** Popup parts that accept `classNames` / `styles`. */
export type MenuButtonPart = 'menu';

export interface MenuButtonMenuProps {
  /** Menu entries as JSX (`MenuItem`, `MenuCheckboxItem`, `MenuRadioGroup`, `MenuGroup`, `MenuSeparator`, `Submenu`). Wins over `items`. */
  readonly menu?: ReactNode;
  /** Data form of the menu entries. */
  readonly items?: readonly MenuItemData[];
  /** Content of each `items` entry (default: its `label`). */
  readonly renderItem?: (item: MenuItemData) => ReactNode;
  readonly open?: boolean | undefined;
  /** Applied after hydration (server and client markup stay identical). */
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean, event: MenuOpenChangeEvent) => void;
  /** A chosen item (any level); `event.preventDefault()` keeps the menu open. */
  readonly onAction?: (event: MenuActionEvent) => void;
  /** Default `'bottom-start'`; flips and shifts to stay in the viewport; logical (mirrored in RTL). */
  readonly placement?: MenuPlacement;
  /** Portal target (default: the trigger's `document.body`). */
  readonly container?: Element | null;
  /** Submenus open after a pointer rest of `hoverDelay` ms (default `'hover'`) or on click only. */
  readonly submenuOpen?: MenuSubmenuOpen;
  /** Hover intent of submenus in ms (default 200). */
  readonly hoverDelay?: number;
}

/** `Button` props that a menu trigger keeps (no `render`, press repeat or loading states). */
type TriggerButtonProps = Omit<ButtonBaseProps, 'children' | 'ref' | 'render' | 'repeat' | 'onRepeat' | 'iconOnly'>;

export interface MenuButtonBaseProps extends MenuButtonMenuProps, TriggerButtonProps {
  /** Trigger content. */
  readonly children?: ReactNode;
  /** Trailing open indicator (default chevron, rotated while open); `false` hides it. */
  readonly indicator?: ReactNode | false;
  readonly classNames?: Partial<Record<MenuButtonPart, string>>;
  readonly styles?: Partial<Record<MenuButtonPart, CSSProperties>>;
  /** The trigger `<button>`. */
  readonly ref?: Ref<HTMLButtonElement>;
}

/** An `iconOnly` trigger needs `aria-label` or `aria-labelledby`. */
export type MenuButtonProps = MenuButtonBaseProps & ({ readonly iconOnly?: false | undefined } | ({ readonly iconOnly: true } & ButtonAccessibleName));

export const CHEVRON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 6l4 4 4-4" />
  </svg>
);

function openEvent(reason: MenuOpenChangeReason, source: MenuSource): MenuOpenChangeEvent {
  return Object.freeze({ reason, source });
}

/** Shared by `MenuButton` and `SplitButton`: the open triad, focus return and the popup. */
export function useMenuPopup(props: MenuButtonMenuProps, triggerRef: { current: HTMLButtonElement | null }, component: string) {
  const { open: openProp, defaultOpen, onOpenChange, onAction, placement = 'bottom-start', container, menu, items, renderItem, submenuOpen, hoverDelay } = props;
  const [open, setOpen] = useControllableState(openProp, false, onOpenChange, `${component} open`);
  const [edge, setEdge] = useState<'first' | 'last'>('first');
  const returnFocus = useRef(false);
  const menuId = useId();
  // defaultOpen applies after hydration, before paint.
  const initial = useRef(defaultOpen);
  useLayoutEffect(() => {
    if (initial.current && openProp === undefined) setOpen(true, openEvent('trigger', 'api'));
    initial.current = false;
    // Mount only.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (open) returnFocus.current = false;
    else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open, triggerRef]);
  const show = (source: MenuSource, at: 'first' | 'last'): void => {
    setEdge(at);
    if (!open) setOpen(true, openEvent('trigger', source));
  };
  const close = (reason: MenuOpenChangeReason, source: MenuSource): void => {
    const trigger = triggerRef.current;
    if (reason === 'tab') trigger?.focus({ preventScroll: true });
    else if (reason !== 'outside') returnFocus.current = true;
    else {
      // Outside press: give focus back only when it would otherwise be lost.
      const active = trigger?.ownerDocument.activeElement;
      if (!active || active === trigger?.ownerDocument.body || active.closest('[role="menu"]')) returnFocus.current = true;
    }
    setOpen(false, openEvent(reason, source));
  };
  const root = useMenuRootValue({ onAction, close, popup: true, container, submenuOpen, hoverDelay });
  const content = useMenuContent(menu, items, renderItem, component);
  const popup = useMemo(() => ({ anchorRef: triggerRef as { current: HTMLElement | null }, side: 'block' as const, placement, matchWidth: true, onOutside: () => root.close('outside', 'pointer') }), [triggerRef, placement, root]);
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown') show('keyboard', 'first');
    else if (event.key === 'ArrowUp') {
      if (event.altKey) {
        if (open) close('escape', 'keyboard');
      } else show('keyboard', 'last');
    } else return;
    event.preventDefault();
  };
  const onTriggerClick = (event: MouseEvent<HTMLButtonElement>): void => {
    const source = clickSource(event);
    if (open) close('trigger', source);
    else show(source, 'first');
  };
  const renderPopup = (labelledBy: string, className: string, style: CSSProperties | undefined): ReactNode =>
    open ? (
      <MenuRootContext value={root}>
        <MenuList id={menuId} className={className} style={style} labelledBy={labelledBy} popup={popup} autoFocus={edge}>
          {content}
        </MenuList>
      </MenuRootContext>
    ) : null;
  return { open, menuId, show, onTriggerKeyDown, onTriggerClick, renderPopup };
}

/**
 * APG Menu Button: a `Button` that opens a menu (`aria-haspopup="menu"`,
 * `aria-expanded`, `aria-controls` while open). Enter, Space and ArrowDown
 * open it on the first item, ArrowUp on the last.
 */
export function MenuButton(props: MenuButtonProps): ReactElement {
  const { menu, items, renderItem, open: _open, defaultOpen: _defaultOpen, onOpenChange: _onOpenChange, onAction: _onAction, placement: _placement, container: _container, submenuOpen: _submenuOpen, hoverDelay: _hoverDelay, indicator, classNames, styles, ref, children, iconEnd, iconOnly, onClick, onKeyDown, className, id, ...button } = props;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const autoId = useId();
  const triggerId = id ?? autoId;
  const popup = useMenuPopup(props, triggerRef, 'MenuButton');
  const setRef = (el: HTMLButtonElement | null): void => {
    triggerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <>
      <Button
        {...(button as TriggerButtonProps)}
        // MenuButtonProps already requires a name with iconOnly; aria-label / aria-labelledby are in the spread above.
        {...({ iconOnly } as unknown as { iconOnly?: false })}
        ref={setRef}
        id={triggerId}
        className={className ? `salmon-menu-button ${className}` : 'salmon-menu-button'}
        aria-haspopup="menu"
        aria-expanded={popup.open}
        aria-controls={popup.open ? popup.menuId : undefined}
        data-open={popup.open ? '' : undefined}
        iconEnd={
          indicator === false && iconEnd == null ? undefined : (
            <>
              {iconEnd}
              {indicator === false ? null : <span className="salmon-menu-button-indicator">{indicator ?? CHEVRON}</span>}
            </>
          )
        }
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) popup.onTriggerClick(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented) popup.onTriggerKeyDown(event);
        }}
      >
        {children}
      </Button>
      {popup.renderPopup(triggerId, classNames?.menu ? `salmon-menu ${classNames.menu}` : 'salmon-menu', styles?.menu)}
    </>
  );
}
