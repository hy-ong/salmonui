'use client';

// Splitter (APG Window Splitter). Panes are CSS flex
// items with `flex-basis`, so the server render already has the final
// layout (no measurement, no layout shift on hydration). A separator drag
// writes `flex-basis` once per frame through internal/pointer-drag.ts and
// calls `onResize`; React state changes once, on release (`onSizesChange`).

import { Children, isValidElement, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { startPointerDrag } from '@salmonui/core/internal/pointer-drag';
import { useLocaleText } from '@salmonui/core/internal/locale';

/** A pane size: px as a number (or `'240px'`), or a percentage of the splitter (`'30%'`). */
export type SplitterSize = number | `${number}px` | `${number}%`;

/** Second argument of `onCollapsedChange`; `preventDefault()` keeps an uncontrolled pane as it is. */
export interface SplitterCollapseEvent {
  readonly source: 'keyboard' | 'pointer' | 'api';
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface SplitterPaneProps extends Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'content'> {
  /** Stable pane id: the key of `sizes`, the target of `aria-controls`. */
  readonly id: string;
  readonly children?: ReactNode;
  /** Size when `sizes` has no entry for this pane. */
  readonly defaultSize?: SplitterSize | undefined;
  readonly minSize?: SplitterSize | undefined;
  readonly maxSize?: SplitterSize | undefined;
  /** Default true; a separator between two non-resizable panes is not focusable. */
  readonly resizable?: boolean | undefined;
  readonly collapsible?: boolean | undefined;
  readonly collapsed?: boolean | undefined;
  readonly defaultCollapsed?: boolean | undefined;
  readonly onCollapsedChange?: ((collapsed: boolean, event: SplitterCollapseEvent) => void) | undefined;
  /** After a collapse or expand was applied. */
  readonly onAfterCollapsedChange?: ((collapsed: boolean) => void) | undefined;
  /** Size while collapsed (a rail). Default 0. */
  readonly collapsedSize?: SplitterSize | undefined;
}

/** `Splitter.Pane`: a descriptor read by its `Splitter` (it renders through the splitter). */
export function SplitterPane(_props: SplitterPaneProps): ReactElement | null {
  return null;
}

export interface SplitterLocaleText {
  /** Separator label. Default `"Resize"`. */
  readonly resizePane?: string | undefined;
}

export interface SplitterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onResize'> {
  /** `Splitter.Pane` children. */
  readonly children?: ReactNode;
  /** Data form of the panes (props of `Splitter.Pane` plus `content`); wins over `children`. */
  readonly panes?: readonly (SplitterPaneProps & { readonly content?: ReactNode })[] | undefined;
  /** Default `'horizontal'` (panes side by side). */
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** Controlled sizes by pane id (panes without a size share the rest). */
  readonly sizes?: Readonly<Record<string, SplitterSize>> | undefined;
  readonly defaultSizes?: Readonly<Record<string, SplitterSize>> | undefined;
  /** Once at the end of a resize (pointer release or a key press), sizes in each pane's unit. */
  readonly onSizesChange?: ((sizes: Record<string, SplitterSize>) => void) | undefined;
  readonly onResizeStart?: ((paneIds: readonly [string, string]) => void) | undefined;
  /** Once per animation frame during a drag, px sizes of the two panes; not for React state. */
  readonly onResize?: ((sizes: Readonly<Record<string, number>>) => void) | undefined;
  /** Separators are inert. */
  readonly disabled?: boolean | undefined;
  readonly localeText?: SplitterLocaleText | undefined;
  /** The splitter element. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

interface Pane extends SplitterPaneProps {
  readonly content?: ReactNode;
}

const px = (v: SplitterSize | undefined): string | undefined => (typeof v === 'number' ? `${v}px` : v);
const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** px of a size inside a container of `total` px. */
function toPx(v: SplitterSize | undefined, total: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(v);
  return v.endsWith('%') ? (n / 100) * total : n;
}

/** A px value in the unit of `like` (percent sizes stay percent). */
function inUnit(value: number, like: SplitterSize | undefined, total: number): SplitterSize {
  return typeof like === 'string' && like.endsWith('%') && total > 0 ? `${Math.round((value / total) * 10000) / 100}%` : Math.round(value);
}

const event = (source: SplitterCollapseEvent['source']) => {
  let prevented = false;
  const e: SplitterCollapseEvent = {
    source,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
  return e;
};

/** Splitter (`.salmon-splitter`, `data-orientation`). */
export function Splitter(props: SplitterProps): ReactElement {
  const { children, panes: panesProp, orientation = 'horizontal', sizes: sizesProp, defaultSizes, onSizesChange, onResizeStart, onResize, disabled, localeText: ownText, className, ref, ...rest } = props;
  const localeText = useLocaleText('splitter', ownText);
  const panes: Pane[] = panesProp
    ? [...panesProp]
    : Children.toArray(children)
        .filter((c): c is ReactElement<SplitterPaneProps> => isValidElement(c) && c.type === SplitterPane)
        .map((c) => c.props);
  const [innerSizes, setInnerSizes] = useState<Record<string, SplitterSize>>(() => {
    const init: Record<string, SplitterSize> = { ...defaultSizes };
    for (const p of panes) if (init[p.id] === undefined && p.defaultSize !== undefined) init[p.id] = p.defaultSize;
    return init;
  });
  const sizes = sizesProp ?? innerSizes;
  const [innerCollapsed, setInnerCollapsed] = useState<Record<string, boolean>>(() => Object.fromEntries(panes.map((p) => [p.id, p.defaultCollapsed === true])));
  const isCollapsed = (p: Pane): boolean => p.collapsed ?? innerCollapsed[p.id] === true;
  const base = useId();
  const domId = (p: Pane): string => `${base}-${p.id}`;
  const root = useRef<HTMLDivElement | null>(null);
  const horizontal = orientation === 'horizontal';
  // Lengths along the splitter axis: a pane's outer size, the container's inner size.
  const outer = (el: HTMLElement): number => (horizontal ? el.offsetWidth : el.offsetHeight);
  const inner = (el: HTMLElement): number => (horizontal ? el.clientWidth : el.clientHeight);
  const snapshot = { panes, sizes, onSizesChange, onResize, onResizeStart, sizesProp };
  const latest = useRef(snapshot);
  useLayoutEffect(() => {
    latest.current = snapshot;
  });

  const toggle = (p: Pane, source: SplitterCollapseEvent['source']): void => {
    if (!p.collapsible) return;
    const next = !isCollapsed(p);
    const e = event(source);
    p.onCollapsedChange?.(next, e);
    if (e.defaultPrevented) return;
    if (p.collapsed === undefined) setInnerCollapsed((m) => ({ ...m, [p.id]: next }));
    p.onAfterCollapsedChange?.(next);
  };

  // aria-valuenow / -min / -max: the primary pane's share of the splitter in percent, written after
  // every render and resize (layout reads happen here, never during render).
  const syncAria = (): void => {
    const el = root.current;
    if (!el) return;
    const total = inner(el);
    const pct = (v: number): string => String(Math.round((v / total) * 100));
    for (const sep of el.querySelectorAll<HTMLElement>(':scope > .salmon-splitter-separator')) {
      const a = sep.previousElementSibling as HTMLElement | null;
      if (!a || total <= 0) continue;
      const pane = latest.current.panes.find((p) => domId(p) === a.id);
      sep.setAttribute('aria-valuenow', pct(outer(a)));
      sep.setAttribute('aria-valuemin', pct(toPx(pane?.minSize, total, 0)));
      sep.setAttribute('aria-valuemax', pct(toPx(pane?.maxSize, total, total)));
    }
  };
  useLayoutEffect(syncAria);

  /** Measures the two panes around separator `i` and returns a resize function (px delta along the logical axis). */
  const begin = (i: number) => {
    const el = root.current as HTMLDivElement;
    const { panes: ps, sizes: ss } = latest.current;
    const a = ps[i] as Pane;
    const b = ps[i + 1] as Pane;
    const find = (p: Pane): HTMLElement => el.querySelector<HTMLElement>(`[id="${domId(p)}"]`) as HTMLElement;
    const ea = find(a);
    const eb = find(b);
    const total = inner(el);
    const a0 = outer(ea);
    const b0 = outer(eb);
    const lo = Math.max(toPx(a.minSize, total, 0), a0 + b0 - toPx(b.maxSize, total, Infinity));
    const hi = Math.min(toPx(a.maxSize, total, Infinity), a0 + b0 - toPx(b.minSize, total, 0));
    // A pane without an explicit size keeps filling (only the other one gets a basis).
    const sa = ss[a.id] ?? a.defaultSize;
    const sb = ss[b.id] ?? b.defaultSize;
    const setA = sa !== undefined || sb === undefined;
    const setB = sb !== undefined;
    let last = { [a.id]: a0, [b.id]: b0 };
    const apply = (delta: number): Record<string, number> => {
      const na = Math.min(Math.max(a0 + delta, lo), Math.max(lo, hi));
      const nb = a0 + b0 - na;
      if (setA) ea.style.flexBasis = `${na}px`;
      if (setB) eb.style.flexBasis = `${nb}px`;
      last = { [a.id]: na, [b.id]: nb };
      return last;
    };
    const commit = (): void => {
      const l = latest.current;
      const next: Record<string, SplitterSize> = { ...l.sizes };
      if (setA) next[a.id] = inUnit(last[a.id] as number, sa, total);
      if (setB) next[b.id] = inUnit(last[b.id] as number, sb, total);
      if (l.sizesProp === undefined) setInnerSizes(next);
      l.onSizesChange?.(next);
      syncAria();
    };
    return { apply, commit, a0, lo, hi, cancel: () => apply(0), ids: [a.id, b.id] as const };
  };
  const logical = (dx: number, dy: number): number => {
    if (!horizontal) return dy;
    const el = root.current;
    return el && el.ownerDocument.defaultView?.getComputedStyle(el).direction === 'rtl' ? -dx : dx;
  };

  // Both handlers are attached to active separators only (never while `disabled`).
  const onPointerDown = (i: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const sep = e.currentTarget;
    const r = begin(i);
    const started = startPointerDrag(e.nativeEvent, sep, {
      onMove: (d) => latest.current.onResize?.(r.apply(logical(d.dx, d.dy))),
      onEnd: (d, cancelled) => {
        sep.removeAttribute('data-dragging');
        if (cancelled) r.cancel();
        else if (d.dx || d.dy) r.commit();
      },
    });
    if (started) {
      e.preventDefault();
      sep.dataset['dragging'] = '';
      latest.current.onResizeStart?.(r.ids);
    }
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const a = panes[i] as Pane;
    const b = panes[i + 1] as Pane;
    if (e.key === 'Enter') {
      e.preventDefault();
      toggle(a.collapsible ? a : b, 'keyboard');
      return;
    }
    const step = e.shiftKey ? 50 : 10;
    const fwd = horizontal ? 'ArrowRight' : 'ArrowDown';
    const back = horizontal ? 'ArrowLeft' : 'ArrowUp';
    let delta: number | null = null;
    const r = begin(i);
    if (e.key === fwd) delta = step;
    else if (e.key === back) delta = -step;
    else if (e.key === 'Home') delta = r.lo - r.a0;
    else if (e.key === 'End') delta = r.hi - r.a0;
    if (delta === null) return;
    e.preventDefault();
    // Arrow keys follow the reading direction in a horizontal RTL splitter.
    if (horizontal && (e.key === fwd || e.key === back)) delta = logical(delta, 0);
    r.apply(delta);
    r.commit();
  };

  const label = localeText?.resizePane ?? 'Resize';
  const out: ReactNode[] = [];
  panes.forEach((p, i) => {
    const collapsed = isCollapsed(p);
    const size = collapsed ? (p.collapsedSize ?? 0) : (sizes[p.id] ?? p.defaultSize);
    const { id: _id, children: paneChildren, content, defaultSize: _ds, minSize, maxSize, resizable: _r, collapsible: _c, collapsed: _cd, defaultCollapsed: _dc, onCollapsedChange: _oc, onAfterCollapsedChange: _oa, collapsedSize: _cs, className: paneClass, style: paneStyle, ...paneRest } = p;
    const style: CSSProperties = {
      flexBasis: px(size) ?? 0,
      flexGrow: size === undefined ? 1 : 0,
      flexShrink: size === undefined ? 1 : 0,
      [horizontal ? 'minWidth' : 'minHeight']: collapsed ? undefined : px(minSize),
      [horizontal ? 'maxWidth' : 'maxHeight']: collapsed ? undefined : px(maxSize),
      ...paneStyle,
    };
    if (i > 0) {
      const prev = panes[i - 1] as Pane;
      const active = !disabled && prev.resizable !== false && p.resizable !== false;
      out.push(
        <div
          key={`sep-${p.id}`}
          role="separator"
          className="salmon-splitter-separator"
          aria-orientation={horizontal ? 'vertical' : 'horizontal'}
          aria-controls={domId(prev)}
          aria-label={label}
          aria-disabled={active ? undefined : true}
          tabIndex={active ? 0 : undefined}
          data-disabled={active ? undefined : ''}
          onPointerDown={active ? onPointerDown(i - 1) : undefined}
          onKeyDown={active ? onKeyDown(i - 1) : undefined}
        />,
      );
    }
    out.push(
      <div key={p.id} {...paneRest} id={domId(p)} className={cx('salmon-splitter-pane', paneClass)} data-pane={p.id} data-collapsed={collapsed ? '' : undefined} style={style}>
        {content ?? paneChildren}
      </div>,
    );
  });
  return (
    <div
      {...rest}
      ref={(el) => {
        root.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
      }}
      className={cx('salmon-splitter', className)}
      data-orientation={orientation}
      data-disabled={disabled ? '' : undefined}
    >
      {out}
    </div>
  );
}

Splitter.Pane = SplitterPane;
