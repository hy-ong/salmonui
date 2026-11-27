'use client';

import { use, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { MenuListContext, MenuRadioContext, MenuRootContext, useMenuRoot, type MenuRootContextValue, type MenuRadioContextValue } from './context.js';
import { MenuList, SUBMENU_HOVER_MS } from './list.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { pressSource as clickSource } from '@salmonui/core/internal/press';
import type { MenuActionEvent, MenuChangeEvent, MenuItemData, MenuOpenChangeReason, MenuSource, MenuSubmenuOpen } from './types.js';

function cx(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base;
}

/** Frozen `onAction` event whose `preventDefault()` cancels the built-in close. */
export function createActionEvent(id: string, item: MenuItemData | undefined, source: MenuSource): MenuActionEvent {
  let prevented = false;
  return Object.freeze({
    id,
    item,
    source,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  });
}

/** The latest value of a prop, readable from stable callbacks (written after commit). */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Root context of one menu tree; stable for the lifetime of the tree. */
export function useMenuRootValue(options: {
  readonly onAction: ((event: MenuActionEvent) => void) | undefined;
  readonly close: (reason: MenuOpenChangeReason, source: MenuSource) => void;
  readonly popup: boolean;
  readonly container: Element | null | undefined;
  readonly submenuOpen?: MenuSubmenuOpen | undefined;
  readonly hoverDelay?: number | undefined;
}): MenuRootContextValue {
  const rootId = useId();
  const latest = useLatest(options);
  const key = useRef<string | null>(null);
  const { popup, container, submenuOpen = 'hover', hoverDelay = SUBMENU_HOVER_MS } = options;
  return useMemo<MenuRootContextValue>(
    () => ({
      rootId,
      popup,
      container,
      submenuOpen,
      hoverDelay,
      act(id, item, source, own, keepOpen) {
        const event = createActionEvent(id, item, source);
        own?.(event);
        latest.current.onAction?.(event);
        if (!event.defaultPrevented && !keepOpen) latest.current.close('action', source);
        return event.defaultPrevented;
      },
      close(reason, source) {
        latest.current.close(reason, source);
      },
      takeKey() {
        const k = key.current;
        key.current = null;
        return k;
      },
      setKey(k) {
        key.current = k;
      },
    }),
    [rootId, popup, container, submenuOpen, hoverDelay, latest],
  );
}

// ---------------------------------------------------------------------------
// Items form
// ---------------------------------------------------------------------------

/**
 * `items` as entries, built when the list that holds them renders: a closed
 * popup or submenu renders no list, so it builds no item elements and its
 * render (server or client) is O(1) in the item count. Opening
 * renders the list and this in the same pass (no extra commit).
 */
function MenuItemsOf(props: { readonly items: readonly MenuItemData[]; readonly renderItem: ((item: MenuItemData) => ReactNode) | undefined }): ReactNode {
  return renderMenuItems(props.items, props.renderItem);
}

/** Renders `items` as the equivalent JSX children (normalized once per array identity by the caller). */
export function renderMenuItems(items: readonly MenuItemData[], renderItem: ((item: MenuItemData) => ReactNode) | undefined): ReactNode {
  return items.map((item, index) => {
    if (item.type === 'separator') return <MenuSeparator key={item.id ?? `separator-${index}`} />;
    const key = item.id ?? `entry-${index}`;
    if (item.type === 'group') {
      return (
        <MenuGroup key={key} label={item.label}>
          {renderMenuItems(item.items ?? [], renderItem)}
        </MenuGroup>
      );
    }
    if (item.items) {
      return (
        <Submenu key={key} label={renderItem ? renderItem(item) : item.label} icon={item.icon} disabled={item.disabled} textValue={item.textValue} title={item.title}>
          <MenuItemsOf items={item.items} renderItem={renderItem} />
        </Submenu>
      );
    }
    if (DEV && item.id === undefined) warnOnce(`menu-item-id:${index}`, 'A menu item in `items` has no `id`; ids are required and reported in onAction.');
    return (
      <MenuItem key={key} id={item.id ?? key} item={item} icon={item.icon} disabled={item.disabled} textValue={item.textValue} href={item.href} target={item.target} title={item.title}>
        {renderItem ? renderItem(item) : item.label}
      </MenuItem>
    );
  });
}

/**
 * `children` win over `items`; warns in development when both are given. The
 * `items` form is one stable element per array identity (`MenuItemsOf`), so
 * a closed popup never walks the items.
 */
export function useMenuContent(children: ReactNode, items: readonly MenuItemData[] | undefined, renderItem: ((item: MenuItemData) => ReactNode) | undefined, component: string): ReactNode {
  const fromItems = useMemo(() => (items ? <MenuItemsOf items={items} renderItem={renderItem} /> : null), [items, renderItem]);
  const both = children != null && items !== undefined;
  useLayoutEffect(() => {
    if (DEV && both) warnOnce(`menu-both:${component}`, `<${component}> received both menu children and \`items\`; the children are rendered and \`items\` is ignored.`);
  }, [both, component]);
  return children ?? fromItems;
}

// ---------------------------------------------------------------------------
// Menu (standalone)
// ---------------------------------------------------------------------------

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style' | 'onKeyDown' | 'onFocus' | 'onPointerMove' | 'role'>;

export interface MenuProps extends DivProps {
  /** JSX entries (`MenuItem`, `MenuCheckboxItem`, `MenuRadioGroup`, `MenuGroup`, `MenuSeparator`, `Submenu`). Win over `items`. */
  readonly children?: ReactNode;
  /** Data form of the entries. */
  readonly items?: readonly MenuItemData[];
  /** Content of each `items` entry (default: its `label`). */
  readonly renderItem?: (item: MenuItemData) => ReactNode;
  /** A chosen item (any level). */
  readonly onAction?: (event: MenuActionEvent) => void;
  /** Submenus open after a pointer rest of `hoverDelay` ms (default `'hover'`) or on click only. */
  readonly submenuOpen?: MenuSubmenuOpen;
  /** Hover intent of submenus in ms (default 200). */
  readonly hoverDelay?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The `role="menu"` element. */
  readonly ref?: Ref<HTMLDivElement>;
}

const noopClose = (): void => undefined;

/**
 * A menu list rendered in place (`role="menu"`, one tab stop with roving
 * focus). `MenuButton` and `SplitButton` render the same list in a popup.
 */
export function Menu(props: MenuProps): ReactElement {
  const { children, items, renderItem, onAction, submenuOpen, hoverDelay, className, style, ref, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...rest } = props;
  const root = useMenuRootValue({ onAction, close: noopClose, popup: false, container: undefined, submenuOpen, hoverDelay });
  const content = useMenuContent(children, items, renderItem, 'Menu');
  return (
    <MenuRootContext value={root}>
      <MenuList className={cx('salmon-menu', className)} style={style} label={ariaLabel} labelledBy={ariaLabelledBy} externalRef={ref} rest={rest}>
        {content}
      </MenuList>
    </MenuRootContext>
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Props passed to a custom item element (`render`): spread them all. */
export type MenuItemRenderProps = HTMLAttributes<HTMLElement> & {
  /** Callback ref (assignable to any element's ref). */
  readonly ref: (element: HTMLElement | null) => void;
  readonly role: string;
  readonly tabIndex: number;
  readonly 'data-item-id'?: string;
  readonly href?: string;
  readonly target?: string;
};

type ItemDomProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style' | 'role' | 'id' | 'onClick'>;

interface ItemCommonProps extends ItemDomProps {
  readonly children?: ReactNode;
  /** Decorative leading icon (`aria-hidden`). */
  readonly icon?: ReactNode;
  /** Skipped by arrow keys and typeahead; `aria-disabled="true"`. */
  readonly disabled?: boolean | undefined;
  /** Typeahead text when the children are not plain text. */
  readonly textValue?: string | undefined;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ref?: Ref<HTMLElement>;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
}

export interface MenuItemProps extends ItemCommonProps {
  /** Stable item key reported in `onAction` (`data-item-id`; not the DOM id). */
  readonly id: string;
  /** The data entry reported in `onAction` (set by the `items` form). */
  readonly item?: MenuItemData | undefined;
  /** Renders `<a role="menuitem" href>`. */
  readonly href?: string | undefined;
  readonly target?: string | undefined;
  /** This item was chosen; `event.preventDefault()` keeps the menu open. Runs before the menu's `onAction`. */
  readonly onAction?: (event: MenuActionEvent) => void;
  /** Custom element (router links): `render={(props) => <Link {...props} to="/x" />}`. */
  readonly render?: (props: MenuItemRenderProps) => ReactElement;
}

const CHECK_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
  </svg>
);

function ItemContent(props: { icon: ReactNode; check?: 'checkbox' | 'radio' | undefined; children: ReactNode; end?: ReactNode }) {
  return (
    <>
      {props.check ? (
        <span className="salmon-menu-item-check" aria-hidden="true" data-kind={props.check}>
          {props.check === 'checkbox' ? CHECK_ICON : <span className="salmon-menu-item-dot" />}
        </span>
      ) : null}
      {props.icon != null ? (
        <span className="salmon-menu-item-icon" aria-hidden="true">
          {props.icon}
        </span>
      ) : null}
      <span className="salmon-menu-item-label">{props.children}</span>
      {props.end}
    </>
  );
}

export function MenuItem(props: MenuItemProps): ReactElement {
  const root = useMenuRoot('MenuItem');
  const { id, item, icon, disabled, textValue, href, target, onAction, render, className, style, ref, onClick, children, ...rest } = props;
  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (disabled) {
      event.preventDefault();
      return;
    }
    root.takeKey();
    if (root.act(id, item, clickSource(event), onAction, false) && href !== undefined) event.preventDefault();
  };
  const itemProps: MenuItemRenderProps = {
    ...rest,
    ref: (element: HTMLElement | null) => assignRef(ref, element),
    role: 'menuitem',
    tabIndex: -1,
    className: cx('salmon-menu-item', className),
    style,
    'aria-disabled': disabled ? true : undefined,
    'data-item-id': id,
    ...dataAttrs(disabled, undefined, textValue),
    onClick: handleClick,
    children: <ItemContent icon={icon}>{children}</ItemContent>,
    ...(href !== undefined && !disabled ? { href } : {}),
    ...(href !== undefined && !disabled && target !== undefined ? { target } : {}),
  };
  if (render) return render(itemProps);
  return href !== undefined ? <a {...(itemProps as HTMLAttributes<HTMLAnchorElement>)} /> : <div {...(itemProps as HTMLAttributes<HTMLDivElement>)} />;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function dataAttrs(disabled: boolean | undefined, checked: boolean | undefined, textValue: string | undefined): Record<string, string | undefined> {
  return {
    'data-disabled': disabled ? '' : undefined,
    'data-checked': checked ? '' : undefined,
    'data-text-value': textValue,
  };
}

export interface MenuCheckboxItemProps extends ItemCommonProps {
  /** Item key reported in `onAction` (optional). */
  readonly id?: string;
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean, event: MenuChangeEvent) => void;
  /** Runs after the toggle; `event.preventDefault()` keeps the menu open. Space always keeps it open. */
  readonly onAction?: (event: MenuActionEvent) => void;
}

function changeEvent(source: MenuSource): MenuChangeEvent {
  return Object.freeze({ source, reason: 'action' as const });
}

/** `role="menuitemcheckbox"` with the `checked` triad. */
export function MenuCheckboxItem(props: MenuCheckboxItemProps): ReactElement {
  const root = useMenuRoot('MenuCheckboxItem');
  const { id, checked: checkedProp, defaultChecked, onCheckedChange, onAction, icon, disabled, textValue, className, style, ref, onClick, children, ...rest } = props;
  const [checked, setChecked] = useControllableState(checkedProp, defaultChecked ?? false, onCheckedChange, 'MenuCheckboxItem checked');
  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;
    const key = root.takeKey();
    const source = clickSource(event);
    setChecked(!checked, changeEvent(source));
    root.act(id ?? '', undefined, source, onAction, key === ' ');
  };
  return (
    <div
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      role="menuitemcheckbox"
      tabIndex={-1}
      aria-checked={checked}
      aria-disabled={disabled ? true : undefined}
      className={cx('salmon-menu-item', className)}
      style={style}
      data-item-id={id}
      {...dataAttrs(disabled, checked, textValue)}
      onClick={handleClick}
    >
      <ItemContent icon={icon} check="checkbox">
        {children}
      </ItemContent>
    </div>
  );
}

export interface MenuRadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'defaultValue' | 'role'> {
  readonly value?: string | null;
  readonly defaultValue?: string | null;
  readonly onValueChange?: (value: string, event: MenuChangeEvent) => void;
  /** Visible group label (also the accessible name). */
  readonly label?: ReactNode;
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
}

/** `role="group"` of `MenuRadioItem`s with the `value` triad. */
export function MenuRadioGroup(props: MenuRadioGroupProps): ReactElement {
  const { value: valueProp, defaultValue, onValueChange, label, children, className, ...rest } = props;
  const [value, setValue] = useControllableState<string | null, [MenuChangeEvent]>(valueProp, defaultValue ?? null, onValueChange as ((value: string | null, event: MenuChangeEvent) => void) | undefined, 'MenuRadioGroup value');
  const latest = useLatest(setValue);
  const ctx = useMemo<MenuRadioContextValue>(() => ({ value, select: (next, source) => latest.current(next, changeEvent(source)) }), [value, latest]);
  return (
    <GroupFrame label={label} className={className} rest={rest}>
      <MenuRadioContext value={ctx}>{children}</MenuRadioContext>
    </GroupFrame>
  );
}

export interface MenuRadioItemProps extends ItemCommonProps {
  readonly value: string;
  /** Item key reported in `onAction` (default: `value`). */
  readonly id?: string;
  /** Runs after the selection; `event.preventDefault()` keeps the menu open. Space always keeps it open. */
  readonly onAction?: (event: MenuActionEvent) => void;
}

/** `role="menuitemradio"` inside a `MenuRadioGroup`. */
export function MenuRadioItem(props: MenuRadioItemProps): ReactElement {
  const root = useMenuRoot('MenuRadioItem');
  const group = use(MenuRadioContext);
  if (!group) throw new Error('[salmonui] <MenuRadioItem> must be rendered inside a <MenuRadioGroup>.');
  const { value, id, onAction, icon, disabled, textValue, className, style, ref, onClick, children, ...rest } = props;
  const checked = group.value === value;
  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;
    const key = root.takeKey();
    const source = clickSource(event);
    if (!checked) group.select(value, source);
    root.act(id ?? value, undefined, source, onAction, key === ' ');
  };
  return (
    <div
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      role="menuitemradio"
      tabIndex={-1}
      aria-checked={checked}
      aria-disabled={disabled ? true : undefined}
      className={cx('salmon-menu-item', className)}
      style={style}
      data-item-id={id ?? value}
      {...dataAttrs(disabled, checked, textValue)}
      onClick={handleClick}
    >
      <ItemContent icon={icon} check="radio">
        {children}
      </ItemContent>
    </div>
  );
}

function GroupFrame(props: { label: ReactNode; className: string | undefined; rest: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }; children: ReactNode }) {
  const labelId = useId();
  const hasLabel = props.label != null;
  return (
    <div {...props.rest} role="group" className={cx('salmon-menu-group', props.className)} aria-labelledby={props.rest['aria-labelledby'] ?? (hasLabel ? labelId : undefined)}>
      {hasLabel ? (
        <div className="salmon-menu-group-label" id={labelId} role="presentation">
          {props.label}
        </div>
      ) : null}
      {props.children}
    </div>
  );
}

export interface MenuGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  /** Visible group label (also the accessible name through `aria-labelledby`). */
  readonly label?: ReactNode;
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
}

/** `role="group"` of items with an optional visible label. */
export function MenuGroup(props: MenuGroupProps): ReactElement {
  const { label, children, className, ...rest } = props;
  return (
    <GroupFrame label={label} className={className} rest={rest}>
      {children}
    </GroupFrame>
  );
}

export interface MenuSeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  readonly ref?: Ref<HTMLDivElement>;
}

/** `role="separator"`; never focusable. */
export function MenuSeparator(props: MenuSeparatorProps): ReactElement {
  const { className, ...rest } = props;
  return <div {...rest} role="separator" className={cx('salmon-menu-separator', className)} />;
}

// ---------------------------------------------------------------------------
// Submenu
// ---------------------------------------------------------------------------

const SUBMENU_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export interface SubmenuProps extends Omit<ItemCommonProps, 'children' | 'onClick'> {
  /** DOM id of the submenu item (default generated; the submenu is labelled by it). */
  readonly id?: string;
  /** Content of the item that opens the submenu. */
  readonly label: ReactNode;
  /** The submenu entries. */
  readonly children?: ReactNode;
  /** Class name and style of the submenu popup. */
  readonly menuClassName?: string;
  readonly menuStyle?: CSSProperties;
}

/**
 * An item that opens a nested menu: ArrowRight (ArrowLeft in RTL), Enter or
 * Space open it and focus its first item; ArrowLeft or Escape close it; the
 * pointer opens it after a 200 ms rest.
 */
export function Submenu(props: SubmenuProps): ReactElement {
  useMenuRoot('Submenu');
  const list = use(MenuListContext);
  const { label, children, icon, disabled, textValue, className, style, menuClassName, menuStyle, ref, id, ...rest } = props;
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<{ readonly focus: boolean } | null>(null);
  const menuId = useId();
  const autoId = useId();
  const triggerId = id ?? autoId;
  const controller = useMemo(
    () => ({
      open(focus: boolean) {
        if (list && list.openSub.current && list.openSub.current !== controller) list.openSub.current.close(false);
        if (list) list.openSub.current = controller;
        setOpen({ focus });
      },
      close(focusTrigger: boolean) {
        if (list && list.openSub.current === controller) list.openSub.current = null;
        setOpen(null);
        if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
      },
    }),
    [list],
  );
  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el || !list) return;
    list.subs.set(el, controller);
    return () => {
      list.subs.delete(el);
      if (list.openSub.current === controller) list.openSub.current = null;
    };
  }, [list, controller]);
  const setRefs = (el: HTMLDivElement | null): void => {
    triggerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const anchorRef = triggerRef as { current: HTMLElement | null };
  const popup = useMemo(() => ({ anchorRef, side: 'inline' as const }), [anchorRef]);
  return (
    <>
      <div
        {...rest}
        ref={setRefs}
        id={triggerId}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open ? menuId : undefined}
        aria-disabled={disabled ? true : undefined}
        className={cx('salmon-menu-item', className)}
        style={style}
        data-submenu=""
        data-open={open ? '' : undefined}
        {...dataAttrs(disabled, undefined, textValue)}
        onClick={(event) => {
          if (disabled) return;
          // Pointer: opens immediately (no hover delay); keyboard opens through the list keys.
          if (open) return;
          controller.open(clickSource(event) === 'keyboard');
        }}
      >
        <ItemContent
          icon={icon}
          end={
            <span className="salmon-menu-submenu-indicator" aria-hidden="true">
              {SUBMENU_ICON}
            </span>
          }
        >
          {label}
        </ItemContent>
      </div>
      {open ? (
        <MenuList
          id={menuId}
          className={cx('salmon-menu', menuClassName)}
          style={menuStyle}
          labelledBy={triggerId}
          popup={popup}
          autoFocus={open.focus ? 'first' : null}
          closeSelf={() => controller.close(true)}
          onPointerInside={list?.cancelHover}
        >
          {children}
        </MenuList>
      ) : null}
    </>
  );
}
