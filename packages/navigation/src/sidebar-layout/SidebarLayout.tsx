'use client';

// SidebarLayout: a CSS grid
// whose panel track switches between `size`, `railSize` (collapsed) and 0
// (push mode), or an overlay presentation (mode 'overlay', or below
// `collapseBelow`). The server cannot know the width, so with `collapseBelow`
// the markup carries a per-instance container / media query that hides the
// panel below the breakpoint before JavaScript runs; the width is read only
// in a layout effect after mount, so hydration is identical.

import { createContext, useEffect, useLayoutEffect, useId, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode, type Ref, type RefObject } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV } from '@salmonui/core/internal/dev';
import { useHydrated } from '@salmonui/core/internal/hydrated';

/** Input that caused a change. */
export type SidebarSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Why the panel opened or closed: a `SidebarTrigger`, a press outside, Escape (overlay) or a `collapseBelow` switch. */
export type SidebarOpenChangeReason = 'trigger' | 'outside' | 'escape' | 'breakpoint';

/** Second argument of `onOpenChange` (frozen in development). */
export interface SidebarOpenChangeEvent {
  readonly source: SidebarSource;
  readonly reason: SidebarOpenChangeReason;
}

/** Argument of `onBeforeOpenChange`; `preventDefault()` keeps the current state. */
export interface SidebarBeforeOpenChangeEvent extends SidebarOpenChangeEvent {
  /** The proposed state. */
  readonly open: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Second argument of `onCollapsedChange`. */
export interface SidebarCollapsedChangeEvent {
  readonly source: SidebarSource;
  readonly reason: 'trigger';
}

/** Static texts (accessible names). Plain JSON, safe to pass from a server component. */
export interface SidebarLayoutLocaleText {
  /** Default accessible name of `SidebarPanel`. */
  readonly panel: string;
  /** Name of an icon-only `SidebarTrigger` (`action="open"`). */
  readonly toggle: string;
  /** Name of an icon-only `SidebarTrigger action="collapse"`. */
  readonly collapse: string;
}

export const SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT: SidebarLayoutLocaleText = Object.freeze({
  panel: 'Sidebar',
  toggle: 'Toggle sidebar',
  collapse: 'Collapse sidebar',
});

export type SidebarPresentation = 'push' | 'overlay';

/** @internal Context shared by the parts. */
export interface SidebarContextValue {
  readonly id: string;
  readonly panelId: string;
  /** Effective open state (overlay presentation opens only after hydration). */
  readonly open: boolean;
  readonly collapsed: boolean;
  /** `undefined` until a `collapseBelow` layout has measured itself. */
  readonly presentation: SidebarPresentation | undefined;
  readonly side: 'start' | 'end';
  readonly text: SidebarLayoutLocaleText;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly requestOpen: (open: boolean, reason: SidebarOpenChangeReason, source: SidebarSource) => void;
  readonly requestCollapsed: (collapsed: boolean, source: SidebarSource) => void;
}

/** @internal */
export const SidebarContext = createContext<SidebarContextValue | null>(null);

export interface SidebarLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  /** The root `<div>`. */
  ref?: Ref<HTMLDivElement> | undefined;
  /** `'push'` (default): the main content shrinks. `'overlay'`: the panel covers the main content. */
  mode?: SidebarPresentation | undefined;
  /**
   * Push mode only: below this width the layout uses the overlay presentation.
   * A number is the layout's own (container) inline size in px; a string is a
   * media query that matches when the layout is narrow (`'(max-width: 767px)'`).
   */
  collapseBelow?: number | string | undefined;
  /** Logical side of the panel (flips under `dir="rtl"`). Default `'start'`. */
  side?: 'start' | 'end' | undefined;
  /** Panel inline size (CSS length or px). Default `16rem`. */
  size?: number | string | undefined;
  /** Inline size of the collapsed rail (CSS length or px). Default `56px`. */
  railSize?: number | string | undefined;
  open?: boolean | undefined;
  /** Default `true` in push mode, `false` in overlay mode. */
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean, event: SidebarOpenChangeEvent) => void) | undefined;
  /** Synchronous; `event.preventDefault()` cancels the change. */
  onBeforeOpenChange?: ((event: SidebarBeforeOpenChangeEvent) => void) | undefined;
  /** Icon rail: the open panel shrinks to `railSize` (push presentation). */
  collapsed?: boolean | undefined;
  defaultCollapsed?: boolean | undefined;
  onCollapsedChange?: ((collapsed: boolean, event: SidebarCollapsedChangeEvent) => void) | undefined;
  /** Push presentation: a press outside the panel and its triggers closes it. Default false. */
  closeOnOutsidePress?: boolean | undefined;
  localeText?: Partial<SidebarLayoutLocaleText> | undefined;
}

/** @internal Loads a module once `when` is true (after mount); null until then. */
export function useLazy<T>(when: boolean, load: () => Promise<T>): T | null {
  const [mod, setMod] = useState<T | null>(null);
  useEffect(() => {
    if (!when || mod) return;
    let live = true;
    void load().then((m) => {
      if (live) setMod(() => m);
    });
    return () => {
      live = false;
    };
    // `load` is a stable import thunk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, mod]);
  return mod;
}

const length = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v);
const freeze = <T extends object>(o: T): T => (DEV ? Object.freeze(o) : o);
/** Media query text that cannot leave its at-rule or the `<style>` element. */
const cleanQuery = (q: string): string => q.replace(/[{}<>;]/g, '');

/** Tabbable trigger of the panel outside it, for focus return. */
export function triggerOf(root: Element | null, panel: Element | null, panelId: string): HTMLElement | null {
  if (!root) return null;
  for (const el of root.ownerDocument.querySelectorAll<HTMLElement>(`[aria-controls="${panelId}"]`)) {
    if (!panel?.contains(el) && el.getClientRects().length > 0) return el;
  }
  return null;
}

export function SidebarLayout(props: SidebarLayoutProps): ReactElement {
  const {
    children,
    ref,
    mode = 'push',
    collapseBelow,
    side = 'start',
    size,
    railSize,
    open: openProp,
    defaultOpen,
    onOpenChange,
    onBeforeOpenChange,
    collapsed: collapsedProp,
    defaultCollapsed = false,
    onCollapsedChange,
    closeOnOutsidePress = false,
    localeText,
    className,
    style,
    ...rest
  } = props;
  const id = useId();
  const panelId = `${id}-panel`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const hydrated = useHydrated();
  const [open, setOpen] = useControllableState<boolean, [SidebarOpenChangeEvent]>(openProp, defaultOpen ?? mode === 'push', onOpenChange, 'SidebarLayout open');
  const [collapsed, setCollapsed] = useControllableState<boolean, [SidebarCollapsedChangeEvent]>(collapsedProp, defaultCollapsed, onCollapsedChange, 'SidebarLayout collapsed');
  // null: not measured (server, hydration, or no `collapseBelow`).
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const adaptive = mode === 'push' && collapseBelow !== undefined;
  const presentation: SidebarPresentation | undefined = mode === 'overlay' ? 'overlay' : !adaptive ? 'push' : narrow === null ? undefined : narrow ? 'overlay' : 'push';
  const effectiveOpen = presentation === 'overlay' ? open && hydrated : open;

  const requestOpen = (next: boolean, reason: SidebarOpenChangeReason, source: SidebarSource): void => {
    if (next === open) return;
    if (onBeforeOpenChange) {
      let prevented = false;
      onBeforeOpenChange(
        freeze({
          open: next,
          reason,
          source,
          get defaultPrevented() {
            return prevented;
          },
          preventDefault() {
            prevented = true;
          },
        }),
      );
      if (prevented) return;
    }
    setOpen(next, (onOpenChange ? freeze({ reason, source }) : undefined) as SidebarOpenChangeEvent);
  };
  const requestCollapsed = (next: boolean, source: SidebarSource): void =>
    setCollapsed(next, (onCollapsedChange ? freeze({ reason: 'trigger' as const, source }) : undefined) as SidebarCollapsedChangeEvent);

  // Breakpoint measurement and outside press load after mount (adaptive.tsx); CSS covers the gap.
  const adaptiveModule = useLazy(adaptive || closeOnOutsidePress, () => import('./adaptive.js'));
  const Adaptive = adaptiveModule?.SidebarAdaptive;
  // Presses before the chunk are held (the held-input pattern, inline for the initial chunk budget);
  // it checks them for an outside press when it mounts.
  const held = useRef<Event[]>([]);
  useLayoutEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!closeOnOutsidePress || Adaptive || !doc) return;
    held.current = [];
    const hold = (event: Event): number => held.current.push(event);
    doc.addEventListener('pointerdown', hold, true);
    return () => doc.removeEventListener('pointerdown', hold, true);
  }, [closeOnOutsidePress, Adaptive]);

  // Focus inside a closing panel moves to its trigger.
  useLayoutEffect(() => {
    if (effectiveOpen) return;
    const panel = panelRef.current;
    if (panel && panel.contains(panel.ownerDocument.activeElement)) triggerOf(rootRef.current, panel, panelId)?.focus();
  }, [effectiveOpen, panelId]);

  const text: SidebarLayoutLocaleText = { ...SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT, ...useLocaleText('sidebarLayout', localeText) };
  const vars: Record<string, string> = {};
  if (size !== undefined) vars['--salmon-sidebar-size'] = length(size);
  if (railSize !== undefined) vars['--salmon-sidebar-rail-size'] = length(railSize);
  const setRef = (el: HTMLDivElement | null): void => {
    rootRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const rule = adaptive
    ? `${typeof collapseBelow === 'number' ? `@container salmon-sidebar-layout (width < ${collapseBelow}px)` : `@media ${cleanQuery(collapseBelow as string)}`}{.salmon-sidebar-panel[data-layout="${id}"]:not([data-presentation]){position:absolute;inset-inline-start:0;inline-size:var(--salmon-sidebar-size);visibility:hidden}}`
    : null;
  const value: SidebarContextValue = { id, panelId, open: effectiveOpen, collapsed, presentation, side, text, panelRef, requestOpen, requestCollapsed };
  return (
    <SidebarContext value={value}>
      <div
        {...rest}
        ref={setRef}
        className={className ? `salmon-sidebar-layout ${className}` : 'salmon-sidebar-layout'}
        style={size !== undefined || railSize !== undefined ? { ...vars, ...style } : style}
        data-layout={id}
        data-side={side}
        data-mode={mode}
        data-presentation={presentation}
        data-state={effectiveOpen ? 'open' : 'closed'}
        data-collapsed={collapsed && presentation !== 'overlay' ? '' : undefined}
      >
        {rule ? <style>{rule}</style> : null}
        {children}
        {Adaptive ? (
          <Adaptive
            rootRef={rootRef}
            panelRef={panelRef}
            panelId={panelId}
            collapseBelow={!adaptive ? undefined : typeof collapseBelow === 'string' ? cleanQuery(collapseBelow) : collapseBelow}
            outside={closeOnOutsidePress && presentation === 'push' && effectiveOpen}
            open={open}
            onNarrow={setNarrow}
            requestOpen={requestOpen}
            held={held}
          />
        ) : null}
      </div>
    </SidebarContext>
  );
}
