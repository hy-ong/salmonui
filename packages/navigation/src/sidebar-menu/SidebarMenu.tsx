'use client';

// SidebarMenu: vertical application navigation. A
// `<nav>` landmark with nested lists of links, disclosure buttons for
// submenus and non-collapsible group headings (the APG disclosure
// navigation pattern, not role="menu": menus are for application commands,
// and a menu role would take away the link semantics, the browse-mode
// reading and the plain Tab order that site navigation keeps).
//
// Every link is in the Tab order; Up / Down / Home / End and Right / Left
// (mirrored in RTL) are optional shortcuts on top. Collapsed (`collapsed`,
// the SidebarLayout rail) the top level shows icons only: a link gets a
// label tooltip, a submenu opens as a flyout next to its button (hover,
// click, Enter / Space / Right) that is rendered inside the item's `<li>`
// and shown in the top layer, so the Tab order runs through it naturally.
// Flyout and tooltip (the lazy `rail.tsx` chunk, loaded once collapsed)
// are client state that only appears after an event,
// so the server markup is the same in both modes.

import {
  createContext,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { pressSource, type PressSource } from '@salmonui/core/internal/press';
import { useCollapse } from '../internal/collapse.js';
import { SIDEBAR_MENU_DEFAULT_LOCALE_TEXT, type SidebarMenuLocaleText } from './locale.js';
import { ancestorsOf, indexSidebarMenu, initialExpanded, initialOf, isGroup, moveIndex, revealSelected, textOf, toggleExpanded, type SidebarMenuEntry, type SidebarMenuIndex, type SidebarMenuItem } from './model.js';

/** Input that caused a change. */
export type SidebarMenuSource = PressSource;

/** Second argument of `onSelectedChange`. */
export interface SidebarMenuSelectedChangeEvent {
  readonly item: SidebarMenuItem;
  readonly source: SidebarMenuSource;
}

/** Second argument of `onExpandedChange`. */
export interface SidebarMenuExpandedChangeEvent {
  /** The submenu that was toggled. */
  readonly id: string;
  readonly expanded: boolean;
  readonly source: SidebarMenuSource | 'find';
}

/** Props a link item passes to `renderLink`: spread all of them on the link element. */
export interface SidebarMenuLinkProps {
  readonly href: string;
  readonly className: string;
  readonly 'aria-current'?: 'page' | undefined;
  /** The item id; the menu reads it to select the item on click. */
  readonly 'data-sidebar-menu-item': string;
  readonly 'data-sidebar-menu-leaf': '';
  readonly children: ReactNode;
}

export interface SidebarMenuProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onSelect' | 'defaultValue'> {
  /** Items, and top-level `{ type: 'group' }` headings with their items. */
  readonly items: readonly SidebarMenuEntry[];
  /** Selected item id (`null`: none). Controlled; route-driven apps derive it from the location. */
  readonly selected?: string | null | undefined;
  readonly defaultSelected?: string | null | undefined;
  /** A leaf was clicked without modifier keys (a modified click opens a new tab and selects nothing). */
  readonly onSelectedChange?: ((id: string, event: SidebarMenuSelectedChangeEvent) => void) | undefined;
  /** Ids of the open submenus. Controlled. */
  readonly expanded?: readonly string[] | undefined;
  /** `'all'` opens every submenu; default: the submenus around the selected item. */
  readonly defaultExpanded?: readonly string[] | 'all' | undefined;
  readonly onExpandedChange?: ((expanded: readonly string[], event: SidebarMenuExpandedChangeEvent) => void) | undefined;
  /** Icon rail: top-level labels hide, links show a tooltip and submenus open as flyouts. Pass the SidebarLayout `collapsed` state. */
  readonly collapsed?: boolean | undefined;
  /** Renders link items with another element (a router link); spread the props. */
  readonly renderLink?: ((props: SidebarMenuLinkProps, item: SidebarMenuItem) => ReactNode) | undefined;
  /** Every press on an enabled leaf (modified clicks included): close a mobile drawer here. */
  readonly onItemClick?: ((item: SidebarMenuItem, event: MouseEvent<HTMLElement>) => void) | undefined;
  /** `false` renders a `<div>` instead of the `<nav>` landmark (inside a `SidebarPanel navigation`). Default true. */
  readonly landmark?: boolean | undefined;
  /** Draws a rule between the groups. Default false (groups are separated by space only). */
  readonly dividers?: boolean | undefined;
  readonly localeText?: Partial<SidebarMenuLocaleText> | undefined;
  /** The root `<nav>` (or `<div>`). */
  readonly ref?: Ref<HTMLElement> | undefined;
}

interface Flyout {
  readonly id: string;
  /** Move focus to the first link (opened from the keyboard). */
  readonly focus: boolean;
  /** Opened by a press: leaving with the pointer does not close it. */
  readonly pinned: boolean;
}

interface Ctx {
  readonly index: SidebarMenuIndex;
  readonly selected: string | null;
  readonly active: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
  readonly collapsed: boolean;
  readonly flyout: Flyout | null;
  readonly tip: string | null;
  readonly renderLink: SidebarMenuProps['renderLink'];
  readonly toggle: (id: string, open: boolean, source: SidebarMenuSource | 'find') => void;
  readonly setFlyout: (next: Flyout | null) => void;
  readonly hover: (id: string, kind: 'flyout' | 'tip', on: boolean) => void;
  readonly setTip: (id: string | null) => void;
  /** The lazy rail popups, loaded after mount once the menu is collapsed. */
  readonly rail: RailModule | null;
}

/** Loads the rail chunk once `when` is true (after mount); null until then. */
function useRailModule(when: boolean): RailModule | null {
  const [mod, setMod] = useState<RailModule | null>(null);
  useEffect(() => {
    if (!when || mod) return;
    let live = true;
    void import('./rail.js').then((m) => {
      if (live) setMod(() => m);
    });
    return () => {
      live = false;
    };
  }, [when, mod]);
  return mod;
}

const SidebarMenuContext = createContext<Ctx | null>(null);
const useNav = (): Ctx => use(SidebarMenuContext)!;

const LINK = 'salmon-sidebar-menu-link';
type RailModule = typeof import('./rail.js');
const OPEN_DELAY = 80;
const CLOSE_DELAY = 200;
const TIP_DELAY = 120;

const levelStyle = (depth: number): CSSProperties => ({ ['--salmon-sidebar-menu-level' as string]: depth });
const cls = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** Vertical application navigation: links, submenus, group headings, selection and an icon rail. */
export function SidebarMenu(props: SidebarMenuProps): ReactElement {
  const {
    items,
    selected: selectedProp,
    defaultSelected,
    onSelectedChange,
    expanded: expandedProp,
    defaultExpanded,
    onExpandedChange,
    collapsed = false,
    renderLink,
    onItemClick,
    landmark = true,
    dividers = false,
    localeText: ownText,
    ref,
    className,
    onClick,
    onKeyDown,
    ...rest
  } = props;
  const localeText = useLocaleText('sidebarMenu', ownText);
  const index = useMemo(() => indexSidebarMenu(items), [items]);
  const [selected, setSelected] = useControllableState<string | null, [SidebarMenuSelectedChangeEvent]>(selectedProp, defaultSelected ?? null, onSelectedChange as ((id: string | null, event: SidebarMenuSelectedChangeEvent) => void) | undefined, 'SidebarMenu selected');

  // Expansion: uncontrolled state also follows a new selection (its submenus open).
  const [innerExpanded, setInnerExpanded] = useState(() => initialExpanded(index, defaultExpanded, selected));
  const [revealed, setRevealed] = useState({ selected, index });
  const expandedControlled = expandedProp !== undefined;
  if (revealed.selected !== selected || revealed.index !== index) {
    setRevealed({ selected, index });
    if (!expandedControlled) {
      const next = revealSelected(index, innerExpanded, selected);
      if (next !== innerExpanded) setInnerExpanded(next);
    }
  }
  const expandedIds = expandedProp ?? innerExpanded;
  const latestExpanded = useRef(expandedIds);
  useEffect(() => {
    latestExpanded.current = expandedIds;
  });
  const wasControlled = useRef(expandedControlled);
  useEffect(() => {
    if (DEV && wasControlled.current !== expandedControlled) {
      warnOnce(
        `sidebar-menu:expanded:${expandedControlled}`,
        `SidebarMenu is changing expanded from ${wasControlled.current ? 'controlled' : 'uncontrolled'} to ${expandedControlled ? 'controlled' : 'uncontrolled'}. Decide between a controlled (expanded given) and an uncontrolled value for the component's lifetime.`,
      );
    }
    wasControlled.current = expandedControlled;
  }, [expandedControlled]);
  useEffect(() => {
    if (DEV && index.duplicates.length) warnOnce(`sidebar-menu:duplicate:${index.duplicates.join()}`, `SidebarMenu: duplicate item ids ${index.duplicates.map((id) => `"${id}"`).join(', ')}. Give every item a unique id; the later items cannot be selected or expanded.`);
  }, [index]);

  const toggle = (id: string, open: boolean, source: SidebarMenuSource | 'find'): void => {
    const current = latestExpanded.current;
    const next = toggleExpanded(current, id, open);
    if (next === current) return;
    latestExpanded.current = next;
    if (!expandedControlled) setInnerExpanded(next);
    onExpandedChange?.(next, { id, expanded: open, source });
  };

  // Rail transients: at most one flyout and one tooltip. Pointer hover only
  // schedules timers (refs); the open item is state because it renders.
  const [flyoutState, setFlyout] = useState<Flyout | null>(null);
  const [tipState, setTip] = useState<string | null>(null);
  // Leaving the rail drops its transients (they would reappear on the next collapse).
  if (!collapsed && (flyoutState !== null || tipState !== null)) {
    setFlyout(null);
    setTip(null);
  }
  const timers = useRef<{ flyout?: ReturnType<typeof setTimeout>; tip?: ReturnType<typeof setTimeout> }>({});
  const flyoutRef = useRef(flyoutState);
  useEffect(() => {
    flyoutRef.current = flyoutState;
  });
  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.flyout);
      clearTimeout(t.tip);
    };
  }, []);
  const hover = (id: string, kind: 'flyout' | 'tip', on: boolean): void => {
    const t = timers.current;
    clearTimeout(t[kind]);
    if (kind === 'tip') {
      t.tip = setTimeout(() => setTip((cur) => (on ? id : cur === id ? null : cur)), on ? TIP_DELAY : 0);
      return;
    }
    const cur = flyoutRef.current;
    if (on) {
      if (cur?.id === id) return;
      // Moving between items with a flyout open switches at once.
      t.flyout = setTimeout(() => setFlyout({ id, focus: false, pinned: false }), cur ? 0 : OPEN_DELAY);
    } else if (cur?.id === id && !cur.pinned) {
      t.flyout = setTimeout(() => setFlyout((c) => (c?.id === id && !c.pinned ? null : c)), CLOSE_DELAY);
    }
  };

  const rail = useRailModule(collapsed);
  const active = useMemo(() => new Set(ancestorsOf(index, selected)), [index, selected]);
  const ctx: Ctx = {
    index,
    selected,
    active,
    expanded: new Set(expandedIds),
    collapsed,
    flyout: collapsed ? flyoutState : null,
    tip: collapsed ? tipState : null,
    renderLink,
    toggle,
    setFlyout: (next) => {
      clearTimeout(timers.current.flyout);
      setFlyout(next);
      if (next) setTip(null);
    },
    hover,
    setTip,
    rail,
  };

  // Delegated selection: links come from `renderLink` too, so the click is
  // read from the `data-sidebar-menu-item` attribute, not a handler on the link.
  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    onClick?.(event);
    const el = (event.target as Element).closest?.(`[data-sidebar-menu-leaf]`);
    if (!el || !event.currentTarget.contains(el)) return;
    const node = index.nodes.get(el.getAttribute('data-sidebar-menu-item') ?? '');
    if (!node) return;
    if (node.item.disabled) {
      event.preventDefault();
      return;
    }
    onItemClick?.(node.item, event);
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setSelected(node.item.id, { item: node.item, source: pressSource(event) });
    ctx.setFlyout(null);
    setTip(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    onKeyDown?.(event);
    if (event.key === 'Escape' && tipState !== null) setTip(null);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (!target.classList?.contains(LINK)) return;
    const flyout = target.closest('.salmon-sidebar-menu-flyout');
    const scope: Element = flyout ?? event.currentTarget;
    const links = Array.from(scope.querySelectorAll<HTMLElement>(`.${LINK}`)).filter(
      (el) => el.closest('.salmon-sidebar-menu-flyout') === flyout && !el.closest('[data-state="closed"]') && !el.matches(':disabled, [aria-disabled="true"]'),
    );
    const next = moveIndex(event.key, links.indexOf(target), links.length);
    if (next >= 0) {
      event.preventDefault();
      links[next]?.focus();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const rtl = getComputedStyle(target).direction === 'rtl';
    const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const id = target.getAttribute('data-sidebar-menu-item') ?? '';
    const node = index.nodes.get(id);
    if (!node) return;
    const branch = !!node.item.children?.length && !target.hasAttribute('data-sidebar-menu-leaf');
    const focusItem = (itemId: string | null): void => {
      if (itemId === null) return;
      for (const el of links) if (el.getAttribute('data-sidebar-menu-item') === itemId) return el.focus();
    };
    if (forward) {
      if (!branch) return;
      event.preventDefault();
      if (target.hasAttribute('data-sidebar-menu-flyout')) ctx.setFlyout({ id, focus: true, pinned: true });
      else if (!ctx.expanded.has(id)) toggle(id, true, 'keyboard');
      else focusItem(node.item.children?.find((c) => !c.disabled)?.id ?? null);
      return;
    }
    event.preventDefault();
    if (branch && ctx.expanded.has(id) && !target.hasAttribute('data-sidebar-menu-flyout')) toggle(id, false, 'keyboard');
    else if (links.some((el) => el.getAttribute('data-sidebar-menu-item') === node.parentId)) focusItem(node.parentId);
    else if (flyout) {
      const trigger = flyout.parentElement?.querySelector<HTMLElement>(`:scope > .${LINK}`);
      ctx.setFlyout(null);
      trigger?.focus();
    }
  };

  const text = localeText ? { ...SIDEBAR_MENU_DEFAULT_LOCALE_TEXT, ...localeText } : SIDEBAR_MENU_DEFAULT_LOCALE_TEXT;
  const named = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
  const Tag = landmark ? 'nav' : 'div';
  return (
    <SidebarMenuContext value={ctx}>
      <Tag
        aria-label={landmark && !named ? text.label : undefined}
        {...rest}
        ref={ref as Ref<HTMLElement & HTMLDivElement>}
        className={cls('salmon-sidebar-menu', className)}
        data-collapsed={collapsed ? '' : undefined}
        data-dividers={dividers ? '' : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <ul className="salmon-sidebar-menu-list">
          {items.map((entry) => (isGroup(entry) ? <Group key={entry.id} id={entry.id} label={entry.label} items={entry.children} /> : <Item key={entry.id} item={entry} depth={1} rail={collapsed} />))}
        </ul>
      </Tag>
    </SidebarMenuContext>
  );
}

function Group(props: { readonly id: string; readonly label: ReactNode; readonly items: readonly SidebarMenuItem[] }): ReactElement {
  const labelId = useId();
  const rail = useNav().collapsed;
  return (
    <li className="salmon-sidebar-menu-group" data-group={props.id}>
      <div className="salmon-sidebar-menu-group-label" id={labelId}>
        {props.label}
      </div>
      <ul className="salmon-sidebar-menu-list" aria-labelledby={labelId}>
        {props.items.map((item) => (
          <Item key={item.id} item={item} depth={1} rail={rail} />
        ))}
      </ul>
    </li>
  );
}

function Content(props: { readonly item: SidebarMenuItem; readonly rail: boolean; readonly chevron?: boolean }): ReactElement {
  const { item, rail } = props;
  return (
    <>
      {item.icon != null ? (
        <span className="salmon-sidebar-menu-icon" aria-hidden="true">
          {item.icon}
        </span>
      ) : rail ? (
        <span className="salmon-sidebar-menu-icon" data-initial="" aria-hidden="true">
          {initialOf(textOf(item))}
        </span>
      ) : null}
      <span className="salmon-sidebar-menu-label">{item.label}</span>
      {item.badge != null && <span className="salmon-sidebar-menu-badge">{item.badge}</span>}
      {props.chevron && <span className="salmon-sidebar-menu-chevron" aria-hidden="true" />}
    </>
  );
}

/** One item: a leaf link (or action button), an inline submenu, or (rail, top level) a flyout trigger. */
function Item(props: { readonly item: SidebarMenuItem; readonly depth: number; readonly rail: boolean }): ReactElement {
  const { item, depth, rail } = props;
  if (item.children?.length) return rail ? <RailBranch item={item} /> : <Branch item={item} depth={depth} />;
  return <Leaf item={item} rail={rail} />;
}

function Leaf(props: { readonly item: SidebarMenuItem; readonly rail: boolean }): ReactElement {
  const { item, rail } = props;
  const ctx = useNav();
  const li = useRef<HTMLLIElement>(null);
  const current = ctx.selected === item.id;
  const content = <Content item={item} rail={rail} />;
  let link: ReactNode;
  if (item.disabled) {
    link = (
      <a role="link" aria-disabled="true" className={LINK} data-sidebar-menu-item={item.id} data-sidebar-menu-leaf="">
        {content}
      </a>
    );
  } else if (item.href !== undefined) {
    const linkProps: SidebarMenuLinkProps = { href: item.href, className: LINK, 'aria-current': current ? 'page' : undefined, 'data-sidebar-menu-item': item.id, 'data-sidebar-menu-leaf': '', children: content };
    link = ctx.renderLink ? ctx.renderLink(linkProps, item) : <a {...linkProps} />;
  } else {
    link = (
      <button type="button" className={LINK} aria-current={current ? 'true' : undefined} data-sidebar-menu-item={item.id} data-sidebar-menu-leaf="">
        {content}
      </button>
    );
  }
  return (
    <li ref={li} className="salmon-sidebar-menu-item" {...(rail ? tipHandlers(ctx, item.id) : null)}>
      {link}
      {rail && ctx.rail && ctx.tip === item.id && <ctx.rail.Tip anchor={li}>{item.label}</ctx.rail.Tip>}
    </li>
  );
}

function tipHandlers(ctx: Ctx, id: string): HTMLAttributes<HTMLLIElement> {
  return {
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && ctx.flyout?.id !== id && ctx.hover(id, 'tip', true),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && ctx.hover(id, 'tip', false),
    onFocus: (e) => {
      const el = e.target as Element;
      if (el.parentElement === e.currentTarget && el.classList.contains(LINK) && el.matches(':focus-visible') && ctx.flyout?.id !== id) ctx.setTip(id);
    },
    onBlur: () => ctx.setTip(null),
  };
}

function Branch(props: { readonly item: SidebarMenuItem; readonly depth: number }): ReactElement {
  const { item, depth } = props;
  const ctx = useNav();
  const open = ctx.expanded.has(item.id);
  const panelId = useId();
  const collapse = useCollapse<HTMLUListElement>(open, { forceMount: true, onReveal: () => ctx.toggle(item.id, true, 'find') });
  return (
    <li className="salmon-sidebar-menu-item" data-expanded={open ? '' : undefined}>
      <button
        type="button"
        className={LINK}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={item.disabled || undefined}
        data-sidebar-menu-item={item.id}
        data-active={ctx.active.has(item.id) ? '' : undefined}
        onClick={(e) => ctx.toggle(item.id, !open, pressSource(e))}
      >
        <Content item={item} rail={false} chevron />
      </button>
      <ul ref={collapse.ref} id={panelId} className="salmon-sidebar-menu-list salmon-sidebar-menu-submenu" data-state={collapse.state} style={levelStyle(depth + 1)}>
        {item.children!.map((child) => (
          <Item key={child.id} item={child} depth={depth + 1} rail={false} />
        ))}
      </ul>
    </li>
  );
}

function RailBranch(props: { readonly item: SidebarMenuItem }): ReactElement {
  const { item } = props;
  const ctx = useNav();
  const flyout = ctx.flyout?.id === item.id ? ctx.flyout : null;
  const li = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const buttonId = useId();
  const flyoutId = useId();
  const tips = tipHandlers(ctx, item.id);
  return (
    <li
      ref={li}
      className="salmon-sidebar-menu-item"
      data-expanded={flyout ? '' : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && !item.disabled) ctx.hover(item.id, 'flyout', true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') ctx.hover(item.id, 'flyout', false);
      }}
      onFocus={tips.onFocus}
      onBlur={tips.onBlur}
    >
      <button
        ref={button}
        id={buttonId}
        type="button"
        className={LINK}
        aria-expanded={!!flyout}
        aria-controls={flyout ? flyoutId : undefined}
        disabled={item.disabled || undefined}
        data-sidebar-menu-item={item.id}
        data-sidebar-menu-flyout=""
        data-active={ctx.active.has(item.id) ? '' : undefined}
        onClick={(e) => {
          const source = pressSource(e);
          // A hover-opened flyout stays open on the press (pinned); a pinned one closes.
          if (flyout?.pinned) ctx.setFlyout(null);
          else ctx.setFlyout({ id: item.id, focus: source === 'keyboard', pinned: true });
        }}
      >
        <Content item={item} rail />
      </button>
      {flyout && ctx.rail && (
        <ctx.rail.FlyoutPanel id={flyoutId} anchor={li} trigger={button} title={item.label} focus={flyout.focus} onDismiss={() => ctx.setFlyout(null)}>
          <ul className="salmon-sidebar-menu-list" aria-labelledby={buttonId} style={levelStyle(1)}>
            {item.children!.map((child) => (
              <Item key={child.id} item={child} depth={1} rail={false} />
            ))}
          </ul>
        </ctx.rail.FlyoutPanel>
      )}
      {!flyout && ctx.rail && ctx.tip === item.id && <ctx.rail.Tip anchor={li}>{item.label}</ctx.rail.Tip>}
    </li>
  );
}
