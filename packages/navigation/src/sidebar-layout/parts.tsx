'use client';

import { use, type ButtonHTMLAttributes, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { SidebarContext, useLazy, type SidebarContextValue } from './SidebarLayout.js';

function useSidebar(part: string): SidebarContextValue {
  const ctx = use(SidebarContext);
  if (!ctx) throw new Error(`[salmonui] ${part} must be rendered inside a SidebarLayout.`);
  return ctx;
}

function assign<T>(ref: Ref<T> | undefined, el: T): void {
  if (typeof ref === 'function') ref(el);
  else if (ref) ref.current = el;
}

const cls = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** Props `render` receives; spread all of them onto the returned element. */
export type SidebarRenderProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<never> | undefined;
  [dataAttribute: `data-${string}`]: string | number | undefined;
};

export interface SidebarPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'id'> {
  children?: ReactNode;
  /** Renders `<nav>` (navigation landmark) instead of `<aside>` (complementary). */
  navigation?: boolean | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/**
 * The panel: `<aside>` or `<nav>` with an accessible name (`aria-label` defaults to `localeText.panel`),
 * painted by the theme's `sidebar` surface (`data-salmon-surface="sidebar"`, overridable).
 */
export function SidebarPanel(props: SidebarPanelProps): ReactElement {
  const { children, navigation = false, ref, className, ...rest } = props;
  const ctx = useSidebar('SidebarPanel');
  const overlay = ctx.presentation === 'overlay';
  const Overlay = useLazy(overlay, () => import('./overlay.js'))?.SidebarOverlay;
  const Tag = navigation ? 'nav' : 'aside';
  const named = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
  const panel = (
    <Tag
      aria-label={named ? undefined : ctx.text.panel}
      // The theme's sidebar surface; matches no rule without one.
      data-salmon-surface="sidebar"
      {...rest}
      id={ctx.panelId}
      ref={(el: HTMLElement | null) => {
        ctx.panelRef.current = el;
        assign(ref, el);
      }}
      className={cls('salmon-sidebar-panel', className)}
      data-layout={ctx.id}
      data-side={ctx.side}
      data-presentation={ctx.presentation}
      data-state={ctx.open ? 'open' : 'closed'}
      data-collapsed={ctx.collapsed && !overlay ? '' : undefined}
      inert={!ctx.open || undefined}
    >
      {children}
    </Tag>
  );
  // The overlay presentation is a lazily loaded module (`./overlay.js`), the seam
  // where the Layout category's Drawer plugs in; push-only pages never load it.
  if (!overlay || !Overlay) return panel;
  return (
    <Overlay
      open={ctx.open}
      side={ctx.side}
      panel={panel}
      panelRef={ctx.panelRef}
      panelId={ctx.panelId}
      onDismiss={(reason, source) => ctx.requestOpen(false, reason, source)}
    />
  );
}

export interface SidebarMainProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  ref?: Ref<HTMLDivElement> | undefined;
  /** Renders another element (`<main>`) with the computed props. */
  render?: ((props: SidebarRenderProps) => ReactElement) | undefined;
}

/** The content beside the panel; its inline size follows the panel track. */
export function SidebarMain(props: SidebarMainProps): ReactElement {
  const { render, className, ...rest } = props;
  const ctx = useSidebar('SidebarMain');
  const own = { ...rest, className: cls('salmon-sidebar-main', className), 'data-side': ctx.side };
  return render ? render(own as SidebarRenderProps) : <div {...own} />;
}

export interface SidebarTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  /** `'open'` (default) toggles the panel; `'collapse'` toggles the icon rail. */
  action?: 'open' | 'collapse' | undefined;
  /** Replaces the built-in icon (decorative). */
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement> | undefined;
  /** Renders another element with the computed props (ARIA and handlers included). */
  render?: ((props: SidebarRenderProps) => ReactElement) | undefined;
}

const MENU_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </svg>
);

/** The rail toggle's icon: a panel with a narrow column, so it differs from the menu icon beside it. */
const RAIL_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2.5 3h11v10h-11zM6.5 3v10" />
  </svg>
);

/** A button that toggles the panel (or its rail) with `aria-expanded` and `aria-controls`. */
export function SidebarTrigger(props: SidebarTriggerProps): ReactElement {
  const { children, action = 'open', icon, render, onClick, className, ...rest } = props;
  const ctx = useSidebar('SidebarTrigger');
  const expanded = action === 'open' ? ctx.open : ctx.open && !ctx.collapsed;
  const named = children != null || rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // Keyboard-synthesized clicks have detail 0 (internal/press.ts `pressSource`).
    const source = event.detail === 0 ? 'keyboard' : (event.nativeEvent as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer';
    if (action === 'open') ctx.requestOpen(!ctx.open, 'trigger', source);
    else ctx.requestCollapsed(!ctx.collapsed, source);
  };
  const own = {
    type: 'button' as const,
    'aria-label': named ? undefined : action === 'open' ? ctx.text.toggle : ctx.text.collapse,
    ...rest,
    className: cls('salmon-sidebar-trigger', className),
    'aria-expanded': expanded,
    'aria-controls': ctx.panelId,
    'data-action': action,
    'data-state': expanded ? 'open' : 'closed',
    onClick: handleClick,
    children: (
      <>
        <span className="salmon-sidebar-trigger__icon" aria-hidden="true">
          {icon ?? (action === 'open' ? MENU_ICON : RAIL_ICON)}
        </span>
        {children}
      </>
    ),
  };
  if (render) {
    const { type: _type, ...renderProps } = own;
    return render(renderProps as SidebarRenderProps);
  }
  return <button {...own} />;
}
