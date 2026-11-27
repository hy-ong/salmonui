'use client';

// Tabs: APG Tabs over a DOM-driven
// roving focus (arrow keys read the tabs from the DOM at event time; no item
// registry), controlled selection with a cancellable before-event, lazy
// panels, scroll or menu overflow, and lazy reordering (./reorder.ts).
// Scroll positions, overflow and drag transients never touch React state.

import {
  lazy,
  Suspense,
  use,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV } from '@salmonui/core/internal/dev';
import { clickSource, navigable, rtlOf, panelId, tabId, TabListContext, tabsOf, TabsContext, type TabsActions, type TabsContextValue } from './context.js';
import { useTabsOverflow } from './overflow.js';
import type {
  TabCloseEvent,
  TabIconPlacement,
  TabsActivation,
  TabsBeforeReorderEvent,
  TabsBeforeValueChangeEvent,
  TabsLocaleText,
  TabsOverflow,
  TabsPanelMount,
  TabsPlacement,
  TabsReorderEvent,
  TabsSource,
  TabsValueChangeEvent,
} from './types.js';

export const TABS_DEFAULT_LOCALE_TEXT: TabsLocaleText = Object.freeze({
  scrollBackward: 'Scroll tabs backward',
  scrollForward: 'Scroll tabs forward',
  moreTabs: 'More tabs',
  close: 'Close',
});

const OverflowMenu = lazy(() => import('./overflow-menu.js'));

const EMPTY: ReadonlySet<string> = new Set();
const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);
const flag = (on: boolean | undefined): '' | undefined => (on ? '' : undefined);
const freeze = <T extends object>(o: T): T => (DEV ? Object.freeze(o) : o);

function cancellable<T extends object>(data: T): T & { readonly defaultPrevented: boolean; preventDefault(): void } {
  let prevented = false;
  return freeze({
    ...data,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  });
}

function assignRef<T>(ref: Ref<T> | undefined, value: T): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function useTabs(component: string): TabsContextValue {
  const ctx = use(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  return ctx;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type RootDomProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style' | 'defaultValue' | 'onChange'>;

export interface TabsProps extends RootDomProps {
  /** `TabList` and `TabPanel` elements (in any order; `placement` arranges them). */
  readonly children?: ReactNode;
  /** Selected tab value (controlled). */
  readonly value?: string | undefined;
  /** Initial selected value; without `value` and `defaultValue` the first enabled tab is selected after mount. */
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string, event: TabsValueChangeEvent) => void;
  /** Runs before a selection change; `event.preventDefault()` keeps the current tab. */
  readonly onBeforeValueChange?: (event: TabsBeforeValueChangeEvent) => void;
  /** Side of the panels the tab list sits on. Default `'top'`; `'start'` / `'end'` make the list vertical. */
  readonly placement?: TabsPlacement;
  /** Default `'automatic'` (selection follows focus). */
  readonly activation?: TabsActivation;
  /** Default `'lazy'`. */
  readonly panelMount?: TabsPanelMount;
  /** Default `'scroll'`. */
  readonly overflow?: TabsOverflow;
  /** Pixels per scroll button press (`overflow="scroll"`). Default 100. */
  readonly scrollStep?: number;
  /** Disables every tab. */
  readonly disabled?: boolean;
  /** Tabs can be reordered by pointer drag and Alt+Arrow keys; the application moves the tab in `onReorder`. */
  readonly reorderable?: boolean;
  readonly onBeforeReorder?: (event: TabsBeforeReorderEvent) => void;
  readonly onReorder?: (event: TabsReorderEvent) => void;
  readonly localeText?: Partial<TabsLocaleText>;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The root element. */
  readonly ref?: Ref<HTMLDivElement>;
}

interface PendingClose {
  readonly value: string;
  readonly neighbor: HTMLElement | undefined;
  readonly selected: boolean;
  readonly focused: boolean;
}

/**
 * APG Tabs root. Arranges a `TabList` and its `TabPanel`s in a CSS grid by
 * `placement` and owns the selection (`value` / `defaultValue` /
 * `onValueChange`).
 */
export function Tabs(props: TabsProps): ReactElement {
  const {
    children,
    value: valueProp,
    defaultValue,
    onValueChange,
    onBeforeValueChange: _before,
    placement = 'top',
    activation = 'automatic',
    panelMount = 'lazy',
    overflow = 'scroll',
    scrollStep = 100,
    disabled = false,
    reorderable = false,
    onBeforeReorder: _beforeReorder,
    onReorder: _reorder,
    localeText: ownText,
    className,
    style,
    ref,
    ...rest
  } = props;
  const localeText = useLocaleText('tabs', ownText);
  const base = useId();
  const [selected, setValue] = useControllableState<string | undefined, [TabsValueChangeEvent]>(
    valueProp,
    defaultValue,
    onValueChange as ((value: string | undefined, event: TabsValueChangeEvent) => void) | undefined,
    'Tabs value',
  );
  const [implicit, setImplicit] = useState<string | undefined>(undefined);
  const value = selected ?? implicit;
  const latest = useRef({ props, value, setValue });
  useLayoutEffect(() => {
    latest.current = { props, value, setValue };
  });
  const pending = useRef<PendingClose | null>(null);
  const actions = useMemo<TabsActions>(() => {
    const select = (next: string, source: TabsSource): void => {
      const l = latest.current;
      const previousValue = l.value;
      if (next === previousValue || l.props.disabled) return;
      const before = l.props.onBeforeValueChange;
      if (before) {
        const event = cancellable({ value: next, previousValue, source });
        before(event);
        if (event.defaultPrevented) return;
      }
      l.setValue(next, (l.props.onValueChange ? freeze({ value: next, previousValue, source }) : undefined) as TabsValueChangeEvent);
      l.value = next;
    };
    return {
      select,
      closing(value, el) {
        const list = el.closest('[role="tablist"]');
        const tabs = list ? tabsOf(list) : [];
        const i = tabs.indexOf(el);
        const ok = (t: HTMLElement | undefined): t is HTMLElement => !!t && t !== el && navigable(t);
        const neighbor = tabs.slice(i + 1).find(ok) ?? tabs.slice(0, Math.max(i, 0)).reverse().find(ok);
        pending.current = { value, neighbor, selected: latest.current.value === value, focused: el.ownerDocument.activeElement === el };
      },
      removed(value) {
        const p = pending.current;
        if (!p || p.value !== value) return;
        pending.current = null;
        const n = p.neighbor;
        if (!n?.isConnected) return;
        if (p.focused) n.focus();
        if (p.selected && latest.current.value === value) select(n.dataset['value']!, 'api');
      },
      reorder(value, fromIndex, toIndex, source) {
        const p = latest.current.props;
        if (fromIndex === toIndex || !p.onReorder) return false;
        if (p.onBeforeReorder) {
          const event = cancellable({ value, fromIndex, toIndex, source });
          p.onBeforeReorder(event);
          if (event.defaultPrevented) return false;
        }
        p.onReorder(freeze({ value, fromIndex, toIndex, source }));
        return true;
      },
      initial(value) {
        if (latest.current.value === undefined) setImplicit(value);
      },
    };
  }, []);
  const text = useMemo(() => (localeText ? { ...TABS_DEFAULT_LOCALE_TEXT, ...localeText } : TABS_DEFAULT_LOCALE_TEXT), [localeText]);
  const vertical = placement === 'start' || placement === 'end';
  const ctx = useMemo<TabsContextValue>(
    () => ({ base, value, vertical, activation, panelMount, overflow, scrollStep, reorderable, disabled, text, actions }),
    [base, value, vertical, activation, panelMount, overflow, scrollStep, reorderable, disabled, text, actions],
  );
  return (
    <div
      {...rest}
      ref={ref}
      className={cx('salmon-tabs', className)}
      style={style}
      data-placement={placement}
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      data-disabled={flag(disabled)}
    >
      <TabsContext value={ctx}>{children}</TabsContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabList
// ---------------------------------------------------------------------------

type ListDomProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style' | 'role'>;

export interface TabListProps extends ListDomProps {
  /** `Tab` elements. */
  readonly children?: ReactNode;
  /** On the `.salmon-tab-list` wrapper (which also holds the scroll buttons and the overflow menu button). */
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The `role="tablist"` element (which also receives `aria-label` and the other DOM props). */
  readonly ref?: Ref<HTMLDivElement>;
}

function toggleAttr(el: Element, name: string, on: boolean): void {
  if (el.hasAttribute(name) !== on) el.toggleAttribute(name, on);
}

/** The `role="tablist"` strip; arrow keys by orientation (mirrored in RTL), Home / End, Delete, Alt+Arrow. */
export function TabList(props: TabListProps): ReactElement {
  const { children, className, style, ref, onKeyDown, ...rest } = props;
  const ctx = useTabs('TabList');
  const { vertical, overflow, actions } = ctx;
  const wrap = useRef<HTMLDivElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const forced = useRef<HTMLElement | null>(null);
  const scroll = overflow === 'scroll';

  // Scroll state as attributes on the wrapper (shows the scroll buttons); never React state.
  const updateScroll = (): void => {
    const list = strip.current;
    const w = wrap.current;
    if (!list || !w || !scroll) return;
    const pos = Math.abs(vertical ? list.scrollTop : list.scrollLeft);
    const max = vertical ? list.scrollHeight - list.clientHeight : list.scrollWidth - list.clientWidth;
    toggleAttr(w, 'data-scrollable', max > 1);
    toggleAttr(w, 'data-scroll-back', pos > 1);
    toggleAttr(w, 'data-scroll-forward', pos < max - 1);
  };
  const latestUpdate = useRef(updateScroll);
  useLayoutEffect(() => {
    latestUpdate.current = updateScroll;
    const list = strip.current;
    if (!list) return;
    const tabs = tabsOf(list);
    // No value yet: the first enabled tab becomes the initial value.
    if (ctx.value === undefined) {
      const first = tabs.find(navigable);
      if (first) actions.initial(first.dataset['value']!);
    }
    // Exactly one tab stop even when the value names no rendered tab.
    if (forced.current && forced.current.getAttribute('aria-selected') !== 'true') forced.current.tabIndex = -1;
    forced.current = null;
    if (!tabs.some((t) => t.tabIndex === 0 && navigable(t))) {
      const first = tabs.find(navigable);
      if (first) {
        first.tabIndex = 0;
        forced.current = first;
      }
    }
    updateScroll();
  });
  useLayoutEffect(() => {
    const list = strip.current;
    const win = list?.ownerDocument.defaultView;
    if (!scroll || !list || !win) return;
    const update = (): void => latestUpdate.current();
    list.addEventListener('scroll', update, { passive: true });
    const observer = win.ResizeObserver ? new win.ResizeObserver(update) : undefined;
    observer?.observe(list);
    return () => {
      list.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [scroll]);
  // Keep the selected tab inside the scrolled strip (selection by API or pointer).
  useLayoutEffect(() => {
    const list = strip.current;
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!scroll || !list || !tab || list.scrollWidth + list.scrollHeight <= list.clientWidth + list.clientHeight) return;
    const a = tab.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    if (vertical) {
      if (a.top < b.top) list.scrollTop -= b.top - a.top;
      else if (a.bottom > b.bottom) list.scrollTop += a.bottom - b.bottom;
    } else if (a.left < b.left) list.scrollLeft -= b.left - a.left;
    else if (a.right > b.right) list.scrollLeft += a.right - b.right;
  }, [ctx.value, scroll, vertical]);

  const menu = useTabsOverflow(wrap, strip, overflow === 'menu', vertical, ctx.value);

  const scrollBy = (dir: 1 | -1): void => {
    const list = strip.current;
    if (!list) return;
    const d = dir * ctx.scrollStep;
    list.scrollBy(vertical ? { top: d, behavior: 'smooth' } : { left: rtlOf(list) ? -d : d, behavior: 'smooth' });
  };
  const scrollButton = (dir: 1 | -1): ReactNode =>
    scroll ? (
      <button
        type="button"
        className="salmon-tab-scroll"
        data-direction={dir < 0 ? 'backward' : 'forward'}
        tabIndex={-1}
        aria-hidden="true"
        title={dir < 0 ? ctx.text.scrollBackward : ctx.text.scrollForward}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => scrollBy(dir)}
      />
    ) : null;

  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    const list = strip.current;
    const tab = (event.target as Element).closest?.<HTMLElement>('[role="tab"]');
    if (event.defaultPrevented || !list || !tab || !list.contains(tab) || event.ctrlKey || event.metaKey) return;
    // APG keys (the internal/roving.ts table): arrows by orientation, mirrored in RTL; Home / End.
    const key = event.key;
    const edge = key === 'Home' ? -1 : key === 'End' ? 1 : 0;
    let step = vertical ? (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0) : key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    if (!step && !edge) return;
    if (step && !vertical && rtlOf(list)) step = -step;
    if (event.altKey) {
      if (!ctx.reorderable || !step) return;
      event.preventDefault();
      const by = step as 1 | -1;
      void import('./reorder.js').then((m) => m.moveByKey(actions, list, tab, by));
      return;
    }
    event.preventDefault();
    const tabs = tabsOf(list);
    const n = tabs.length;
    const dir = edge ? -edge : step;
    let i = edge < 0 ? -1 : edge > 0 ? n : tabs.indexOf(tab);
    let el: HTMLElement | undefined;
    for (let k = 0; k < n && !el; k++) {
      i = edge ? i + dir : (i + dir + n) % n;
      const t = tabs[i];
      if (t && navigable(t)) el = t;
    }
    if (!el || el === tab) return;
    el.focus();
    if (ctx.activation === 'automatic') actions.select(el.dataset['value']!, 'keyboard');
  };

  return (
    <div ref={wrap} className={cx('salmon-tab-list', className)} style={style} data-overflow={overflow} data-overflow-root={flag(!!menu)}>
      {scrollButton(-1)}
      <div
        {...rest}
        ref={(el) => {
          strip.current = el;
          assignRef(ref, el);
        }}
        role="tablist"
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        className="salmon-tab-list-strip"
        onKeyDown={onKey}
      >
        <TabListContext value={menu ? menu.hidden : EMPTY}>{children}</TabListContext>
      </div>
      {scrollButton(1)}
      {menu ? (
        <>
          <button
            ref={menu.triggerRef}
            type="button"
            className="salmon-tab-more"
            data-overflow-trigger=""
            hidden={menu.hidden.size === 0 && !menu.open}
            aria-label={ctx.text.moreTabs}
            aria-haspopup="menu"
            aria-expanded={menu.open}
            aria-controls={menu.open ? `${ctx.base}menu` : undefined}
            data-open={flag(menu.open)}
            onClick={menu.toggle}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!menu.open) menu.toggle();
              }
            }}
          />
          {menu.open ? (
            <Suspense fallback={null}>
              <OverflowMenu
                id={`${ctx.base}menu`}
                label={ctx.text.moreTabs}
                anchorRef={menu.triggerRef}
                entries={menu.entries()}
                onSelect={(value, source) => {
                  menu.close();
                  actions.select(value, source);
                  // The chosen tab is shown (pinned) only after the commit and re-measure.
                  requestAnimationFrame(() => strip.current?.querySelector<HTMLElement>(`[role="tab"][data-value="${CSS.escape(value)}"]`)?.focus());
                }}
                onClose={menu.close}
              />
            </Suspense>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

/** Props passed to a custom tab element (`render`): spread them all. */
export type TabRenderProps = HTMLAttributes<HTMLElement> & {
  readonly ref: (element: HTMLElement | null) => void;
  readonly role: 'tab';
  readonly id: string;
  readonly tabIndex: number;
  readonly 'data-value': string;
} & { readonly [attribute: `data-${string}`]: string | undefined };

type TabDomProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style' | 'role' | 'id' | 'hidden'>;

export interface TabProps extends TabDomProps {
  /** Stable key of the tab; matches its `TabPanel value`. */
  readonly value: string;
  /** The label. */
  readonly children?: ReactNode;
  /** Decorative icon (`aria-hidden`). */
  readonly icon?: ReactNode;
  /** Default `'start'`. */
  readonly iconPlacement?: TabIconPlacement;
  /** `aria-disabled="true"`: skipped by arrow keys, not selectable. */
  readonly disabled?: boolean | undefined;
  /** Not shown (the element stays in the DOM with `hidden`). */
  readonly hidden?: boolean | undefined;
  /** Shows a close button and handles Delete on the focused tab; the application removes the tab. */
  readonly onClose?: ((event: TabCloseEvent) => void) | undefined;
  /** Custom element (a router link); receives every computed prop. */
  readonly render?: ((props: TabRenderProps) => ReactElement) | undefined;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The `role="tab"` element. */
  readonly ref?: Ref<HTMLElement>;
}

/** One `role="tab"` button. */
export function Tab(props: TabProps): ReactElement {
  const { value, children, icon, iconPlacement = 'start', disabled, hidden, onClose, render, className, style, ref, onClick, onKeyDown, onPointerDown, ...rest } = props;
  const ctx = useTabs('Tab');
  const { actions, base } = ctx;
  const selected = ctx.value === value;
  const off = !!disabled || ctx.disabled;
  const overflowed = use(TabListContext).has(value);
  const el = useRef<HTMLElement | null>(null);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  });
  useLayoutEffect(() => () => actions.removed(valueRef.current), [actions]);
  const close = (source: TabsSource): void => {
    if (!onClose || off || !el.current) return;
    actions.closing(value, el.current);
    onClose(freeze({ value, source }));
  };
  const p: TabRenderProps = {
    ...rest,
    ref: (node) => {
      el.current = node;
      assignRef(ref, node);
    },
    role: 'tab',
    id: tabId(base, value),
    'aria-selected': selected,
    'aria-controls': panelId(base, value),
    'aria-disabled': off || undefined,
    'aria-keyshortcuts': onClose ? 'Delete' : undefined,
    tabIndex: selected ? 0 : -1,
    hidden: hidden || overflowed,
    className: cx('salmon-tab', className),
    style,
    'data-value': value,
    'data-overflow-item': ctx.overflow === 'menu' && !hidden ? value : undefined,
    'data-overflow-hidden': flag(overflowed),
    'data-selected': flag(selected),
    'data-disabled': flag(off),
    'data-icon-placement': icon == null ? undefined : iconPlacement,
    onClick: (event: MouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented && !off) actions.select(value, clickSource(event));
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === 'Delete' && onClose) {
        event.preventDefault();
        close('keyboard');
      }
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      onPointerDown?.(event);
      if (!ctx.reorderable || off || event.button !== 0 || event.defaultPrevented || (event.target as Element).closest('.salmon-tab-close')) return;
      const tab = event.currentTarget;
      const native = event.nativeEvent;
      // The drag chunk loads on the first press; a release before it arrives cancels the gesture.
      const gesture = { ended: false };
      const end = (): void => void (gesture.ended = true);
      tab.ownerDocument.addEventListener('pointerup', end, { once: true, capture: true });
      tab.ownerDocument.addEventListener('pointercancel', end, { once: true, capture: true });
      void import('./reorder.js').then((m) => m.startDrag(actions, tab, native, gesture));
    },
    children: (
      <>
        {icon == null ? null : (
          <span className="salmon-tab-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="salmon-tab-label">{children}</span>
        {onClose ? (
          <span
            className="salmon-tab-close"
            aria-hidden="true"
            title={ctx.text.close}
            onClick={(event) => {
              event.stopPropagation();
              close(clickSource(event));
            }}
          />
        ) : null}
      </>
    ),
  };
  return render ? render(p) : <button type="button" {...(p as HTMLAttributes<HTMLButtonElement>)} ref={p.ref} />;
}

// ---------------------------------------------------------------------------
// TabPanel
// ---------------------------------------------------------------------------

type PanelDomProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style' | 'role' | 'id' | 'hidden'>;

export interface TabPanelProps extends PanelDomProps {
  /** The `Tab value` this panel belongs to. */
  readonly value: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The `role="tabpanel"` element. */
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * The panel of one tab (`role="tabpanel"`, labelled by its tab). The element
 * is always rendered (so `aria-controls` resolves); its content mounts per
 * `Tabs panelMount`.
 */
export function TabPanel(props: TabPanelProps): ReactElement {
  const { value, children, className, style, ref, ...rest } = props;
  const ctx = useTabs('TabPanel');
  const selected = ctx.value === value;
  const [visited, setVisited] = useState(selected);
  if (selected && !visited) setVisited(true);
  const mount = selected || ctx.panelMount === 'eager' || (ctx.panelMount === 'lazy' && visited);
  return (
    <div
      tabIndex={0}
      {...rest}
      ref={ref}
      role="tabpanel"
      id={panelId(ctx.base, value)}
      aria-labelledby={tabId(ctx.base, value)}
      hidden={!selected}
      className={cx('salmon-tab-panel', className)}
      style={style}
      data-selected={flag(selected)}
    >
      {mount ? children : null}
    </div>
  );
}
