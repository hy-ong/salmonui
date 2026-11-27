'use client';

// DashboardLayout. Panels
// are CSS grid items placed from the layout value through custom properties,
// so the server HTML has the final arrangement. A pointer drag or resize
// writes CSS only (`transform`, and the panel size while resizing) once per
// frame through internal/pointer-drag.ts and commits the layout on release;
// React renders on commit, never per pointer move. The keyboard picks a
// panel up, moves and resizes it a cell at a time with a live-region
// announcement per step, and commits or cancels. Stacking below a container
// width is a container query (`responsive.stackBelow`), so nothing is
// measured during render.

import { Children, isValidElement, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type HTMLAttributes, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { DRAG_THRESHOLD } from '@salmonui/core/internal/dnd';
import { bottom, moveItem, resizeItem, sameLayout, settle, type GridCompact, type GridLayoutItem } from '../internal/grid-layout.js';
import { announce, liveRegionProps } from '@salmonui/core/internal/live-region';
import { startPointerDrag } from '@salmonui/core/internal/pointer-drag';

/** One panel of the layout value, which is also its serialized form. */
export type DashboardLayoutItem = GridLayoutItem;

/** A resize handle: an edge or a corner, logical in the inline axis (`start` is the left in LTR, the right in RTL). */
export type DashboardResizeEdge = 'top' | 'bottom' | 'start' | 'end' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

export interface DashboardLayoutPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'children'> {
  /** Stable panel id: the `id` of its layout item. */
  readonly id: string;
  /** Header content; it names the panel for assistive technology. */
  readonly header?: ReactNode;
  readonly children?: ReactNode;
}

/** `DashboardLayout.Panel`: a descriptor read by its `DashboardLayout` (it renders through the layout). */
export function DashboardLayoutPanel(_props: DashboardLayoutPanelProps): ReactElement | null {
  return null;
}

/** Announcement templates: `{label}`, `{row}`, `{column}`, `{width}` and `{height}` are replaced. */
export interface DashboardLayoutLocaleText {
  /** `aria-roledescription` of a panel. Default `"panel"`. */
  readonly panel?: string | undefined;
  readonly instructions?: string | undefined;
  readonly grabbed?: string | undefined;
  readonly moved?: string | undefined;
  readonly resized?: string | undefined;
  readonly dropped?: string | undefined;
  readonly cancelled?: string | undefined;
}

export interface DashboardLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange'> {
  /** `DashboardLayout.Panel` children. */
  readonly children?: ReactNode;
  /** Column count. Default 12. */
  readonly columns?: number | undefined;
  /** Space between cells in px: one value, or `[inline, block]`. Default 8. */
  readonly gap?: number | readonly [number, number] | undefined;
  /** Row height in px. Without it rows follow `cellAspectRatio`. */
  readonly rowHeight?: number | undefined;
  /** Cell width / height when `rowHeight` is not set. Default 1 (square cells). */
  readonly cellAspectRatio?: number | undefined;
  readonly showGridLines?: boolean | undefined;
  /** Controlled layout (the serialized form). */
  readonly layout?: readonly DashboardLayoutItem[] | undefined;
  readonly defaultLayout?: readonly DashboardLayoutItem[] | undefined;
  /** Once per committed drag, resize or keyboard drop, with every panel's item. */
  readonly onLayoutChange?: ((layout: DashboardLayoutItem[]) => void) | undefined;
  /** Panels move with the pointer and the keyboard. Default true. */
  readonly draggable?: boolean | undefined;
  /** CSS selector of the drag handle inside a panel; default the whole panel. */
  readonly dragHandle?: string | undefined;
  /** Resize handles: true is `['bottom-end']`. Default false. */
  readonly resizable?: boolean | readonly DashboardResizeEdge[] | undefined;
  /** `'vertical'` floats panels up into free space. Default `'vertical'`. */
  readonly compact?: GridCompact | undefined;
  /** `stackBelow`: below this container width (px, at least 100) panels stack in one column in layout order. */
  readonly responsive?: { readonly stackBelow?: number | undefined } | undefined;
  readonly localeText?: DashboardLayoutLocaleText | undefined;
  /** The root element. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

/** @internal English `localeText` (read by the locale coverage test; not part of the entry). */
export const DASHBOARD_LAYOUT_DEFAULT_LOCALE_TEXT = {
  panel: 'panel',
  instructions: 'Press Enter or Space to pick up the panel. Arrow keys move it, Shift with the arrow keys resizes it, Enter or Space drops it, Escape cancels.',
  grabbed: '{label} picked up at row {row}, column {column}.',
  moved: '{label} moved to row {row}, column {column}.',
  resized: '{label} resized to {width} by {height}.',
  dropped: '{label} dropped at row {row}, column {column}.',
  cancelled: '{label} returned to row {row}, column {column}.',
};

const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);
const fill = (template: string, label: string, item: DashboardLayoutItem): string =>
  template.replace(/\{(label|row|column|width|height)\}/g, (_, k: string) => (k === 'label' ? label : String(k === 'row' ? item.y + 1 : k === 'column' ? item.x + 1 : k === 'width' ? item.w : item.h)));
const INTERACTIVE = 'input,textarea,select,button,a[href],[contenteditable=""],[contenteditable="true"],.salmon-dashboard-resize';

interface Grab {
  readonly id: string;
  readonly base: DashboardLayoutItem[];
  readonly next: DashboardLayoutItem[];
}

/** DashboardLayout (`.salmon-dashboard`). */
export function DashboardLayout(props: DashboardLayoutProps): ReactElement {
  const { children, columns = 12, gap = 8, rowHeight, cellAspectRatio, showGridLines, layout: layoutProp, defaultLayout, onLayoutChange, draggable = true, dragHandle, resizable = false, compact = 'vertical', responsive, localeText: ownText, className, style, ref, ...rest } = props;
  const localeText = useLocaleText('dashboardLayout', ownText);
  const panels = Children.toArray(children)
    .filter((c): c is ReactElement<DashboardLayoutPanelProps> => isValidElement(c) && c.type === DashboardLayoutPanel)
    .map((c) => c.props);
  const [value, setValue] = useControllableState<readonly DashboardLayoutItem[]>(layoutProp, () => defaultLayout ?? [], onLayoutChange as ((v: readonly DashboardLayoutItem[]) => void) | undefined, 'DashboardLayout layout');
  // Panels without an item go to the bottom, one cell each; items without a panel are dropped.
  const known = value.filter((item) => panels.some((p) => p.id === item.id));
  const end = bottom(known);
  const resolved = settle(
    panels.map((p) => known.find((item) => item.id === p.id) ?? { id: p.id, x: 0, y: end, w: 1, h: 1 }),
    columns,
    compact,
  );
  const [grab, setGrab] = useState<Grab | null>(null);
  const shown = grab?.next ?? resolved;
  const edges: readonly DashboardResizeEdge[] = resizable === true ? ['bottom-end'] : resizable || [];
  const text = Object.fromEntries(Object.entries(DASHBOARD_LAYOUT_DEFAULT_LOCALE_TEXT).map(([k, v]) => [k, localeText?.[k as keyof typeof DASHBOARD_LAYOUT_DEFAULT_LOCALE_TEXT] ?? v])) as typeof DASHBOARD_LAYOUT_DEFAULT_LOCALE_TEXT;
  const base = useId();
  const root = useRef<HTMLDivElement | null>(null);
  const live = useRef<HTMLDivElement | null>(null);
  const label = (id: string): string => {
    const p = panels.find((x) => x.id === id);
    return p?.['aria-label'] ?? (typeof p?.header === 'string' ? p.header : id);
  };
  const latest = useRef({ resolved, columns, compact, setValue });
  useLayoutEffect(() => {
    latest.current = { resolved, columns, compact, setValue };
  });

  // Committed layout -> CSS of a drag frame: panels that the drag displaces are translated from their committed cells.
  const beginPointer = (e: ReactPointerEvent<HTMLElement>, id: string, edge: DashboardResizeEdge | null): void => {
    const l = latest.current;
    const item = l.resolved.find((i) => i.id === id);
    const handle = e.currentTarget;
    const panel = edge ? handle.parentElement : handle;
    const grid = panel?.parentElement;
    const el = root.current;
    const win = handle.ownerDocument.defaultView;
    if (!item || item.static || !panel || !grid || !el || !win || grab) return;
    if (!edge) {
      const target = e.target as Element;
      if (target.closest(INTERACTIVE) && panel.contains(target.closest(INTERACTIVE))) return;
      if (dragHandle && !(target.closest(dragHandle) && panel.contains(target.closest(dragHandle)))) return;
    }
    const cs = win.getComputedStyle(grid);
    if (cs.getPropertyValue('--salmon-dashboard-stacked').trim() === '1') return;
    const gx = Number.parseFloat(cs.columnGap) || 0;
    const gy = Number.parseFloat(cs.rowGap) || 0;
    const rect = panel.getBoundingClientRect();
    const colPitch = (rect.width + gx) / item.w;
    const rowPitch = (rect.height + gy) / item.h;
    const sign = cs.direction === 'rtl' ? -1 : 1;
    const els = new Map<string, HTMLElement>();
    for (const child of grid.children) if (child instanceof win.HTMLElement && child.dataset['id']) els.set(child.dataset['id'], child);
    const ph = grid.querySelector<HTMLElement>(':scope > .salmon-dashboard-placeholder');
    let next = l.resolved;
    const place = (layout: DashboardLayoutItem[]): void => {
      for (const it of layout) {
        const node = els.get(it.id);
        const was = l.resolved.find((i) => i.id === it.id) as DashboardLayoutItem;
        if (!node || it.id === id) continue;
        const dx = (it.x - was.x) * colPitch * sign;
        const dy = (it.y - was.y) * rowPitch;
        node.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
      }
      const t = layout.find((i) => i.id === id) as DashboardLayoutItem;
      if (ph) for (const [k, v] of [['x', t.x + 1], ['y', t.y + 1], ['w', t.w], ['h', t.h]] as const) ph.style.setProperty(`--salmon-dashboard-${k}`, String(v));
    };
    const started = startPointerDrag(e.nativeEvent, handle, {
      threshold: edge ? 0 : DRAG_THRESHOLD,
      onMove: ({ dx, dy }) => {
        if (el.dataset['active'] === undefined) {
          el.dataset['active'] = '';
          panel.dataset['dragging'] = '';
        }
        const lx = dx * sign;
        if (!edge) {
          panel.style.transform = `translate(${dx}px, ${dy}px)`;
          next = moveItem(l.resolved, id, item.x + Math.round(lx / colPitch), item.y + Math.round(dy / rowPitch), l.columns, l.compact);
        } else {
          const w0 = rect.width;
          const h0 = rect.height;
          const fromStart = edge.endsWith('start');
          const fromTop = edge.startsWith('top');
          const across = edge !== 'top' && edge !== 'bottom';
          const along = edge !== 'start' && edge !== 'end';
          const span = (n: number, pitch: number, g: number): number => n * pitch - g;
          const minW = span(Math.max(1, item.minW ?? 1), colPitch, gx);
          const maxW = span(Math.min(l.columns, item.maxW ?? l.columns, fromStart ? item.x + item.w : l.columns - item.x), colPitch, gx);
          const minH = span(Math.max(1, item.minH ?? 1), rowPitch, gy);
          const maxH = item.maxH === undefined && !fromTop ? Infinity : span(Math.min(item.maxH ?? Infinity, fromTop ? item.y + item.h : Infinity), rowPitch, gy);
          const w = across ? Math.min(Math.max(w0 + (fromStart ? -lx : lx), minW), Math.max(minW, maxW)) : w0;
          const h = along ? Math.min(Math.max(h0 + (fromTop ? -dy : dy), minH), Math.max(minH, maxH)) : h0;
          panel.style.inlineSize = `${w}px`;
          panel.style.blockSize = `${h}px`;
          const tx = fromStart ? -(w - w0) * sign : 0;
          const ty = fromTop ? -(h - h0) : 0;
          panel.style.transform = tx || ty ? `translate(${tx}px, ${ty}px)` : '';
          const cw = Math.max(1, Math.round((w + gx) / colPitch));
          const ch = Math.max(1, Math.round((h + gy) / rowPitch));
          next = resizeItem(l.resolved, id, { x: fromStart ? item.x + item.w - cw : item.x, y: fromTop ? item.y + item.h - ch : item.y, w: cw, h: ch }, l.columns, l.compact);
        }
        place(next);
      },
      onEnd: (_d, cancelled) => {
        // Transitions off first, so the cleared transforms do not animate against the new grid cells.
        delete el.dataset['active'];
        delete panel.dataset['dragging'];
        for (const node of els.values()) node.style.transform = '';
        panel.style.inlineSize = '';
        panel.style.blockSize = '';
        if (!cancelled && !sameLayout(next, l.resolved)) l.setValue(next);
      },
    });
    if (started) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const say = (template: string, id: string, layout: DashboardLayoutItem[]): void => announce(live.current, fill(template, label(id), layout.find((i) => i.id === id) as DashboardLayoutItem));

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const key = e.key;
    if (!grab || grab.id !== id) {
      if (key !== 'Enter' && key !== ' ') return;
      e.preventDefault();
      const grid = e.currentTarget.parentElement;
      const win = e.currentTarget.ownerDocument.defaultView;
      if (grid && win?.getComputedStyle(grid).getPropertyValue('--salmon-dashboard-stacked').trim() === '1') return;
      setGrab({ id, base: resolved, next: resolved });
      say(`${text.grabbed} ${text.instructions}`, id, resolved);
      return;
    }
    if (key === 'Enter' || key === ' ' || key === 'Escape') {
      e.preventDefault();
      setGrab(null);
      if (key === 'Escape') say(text.cancelled, id, grab.base);
      else {
        if (!sameLayout(grab.next, grab.base)) setValue(grab.next);
        say(text.dropped, id, grab.next);
      }
      return;
    }
    const rtl = e.currentTarget.ownerDocument.defaultView?.getComputedStyle(e.currentTarget).direction === 'rtl';
    const dx = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    const dy = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const lx = rtl ? -dx : dx;
    const resize = e.shiftKey;
    if (resize ? !edges.length : !draggable) return;
    const cur = grab.next.find((i) => i.id === id) as DashboardLayoutItem;
    // A step that the compaction undoes tries the next cell, so the panel can pass a neighbour.
    const limit = Math.max(columns, bottom(grab.next) + cur.h) + 1;
    for (let k = 1; k <= limit; k++) {
      const next = resize
        ? resizeItem(grab.base, id, { x: cur.x, y: cur.y, w: cur.w + lx * k, h: cur.h + dy * k }, columns, compact)
        : moveItem(grab.base, id, cur.x + lx * k, cur.y + dy * k, columns, compact);
      const n = next.find((i) => i.id === id) as DashboardLayoutItem;
      if (n.x === cur.x && n.y === cur.y && n.w === cur.w && n.h === cur.h) {
        // Blocked at the edge or the size limit: nothing further in this direction.
        if (resize || (lx && (cur.x + lx * k < 0 || cur.x + cur.w + lx * k > columns)) || cur.y + dy * k < 0) break;
        continue;
      }
      setGrab({ ...grab, next });
      say(resize ? text.resized : text.moved, id, next);
      return;
    }
  };

  const onBlur = (id: string) => (e: FocusEvent<HTMLDivElement>) => {
    if (grab?.id === id && e.target === e.currentTarget) {
      setGrab(null);
      say(text.cancelled, id, grab.base);
    }
  };

  const [gx, gy] = typeof gap === 'number' ? [gap, gap] : gap;
  const stack = responsive?.stackBelow;
  const rootStyle: CSSProperties = {
    '--salmon-dashboard-columns': columns,
    '--salmon-dashboard-gap-x': `${gx}px`,
    '--salmon-dashboard-gap-y': `${gy}px`,
    ...(rowHeight !== undefined ? { '--salmon-dashboard-row': `${rowHeight}px` } : { '--salmon-dashboard-ratio': cellAspectRatio ?? 1 }),
    ...(stack ? { '--salmon-dashboard-k': 100 / stack } : null),
    ...style,
  } as Record<string, unknown>;
  const order = [...shown].sort((a, b) => a.y - b.y || a.x - b.x).map((i) => i.id);
  const instructions = `${base}-help`;
  return (
    <div
      {...rest}
      ref={(node) => {
        root.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
      }}
      className={cx('salmon-dashboard', className)}
      style={rootStyle}
      data-stack-below={stack || undefined}
      data-grid-lines={showGridLines ? '' : undefined}
    >
      <div className="salmon-dashboard-scale">
        <div className="salmon-dashboard-grid">
          {panels.map((p) => {
            const item = shown.find((i) => i.id === p.id) as DashboardLayoutItem;
            const { id, header, children: content, className: panelClass, style: panelStyle, ...panelRest } = p;
            const movable = !item.static && (draggable || edges.length > 0);
            const headerId = `${base}-${id}-header`;
            return (
              <div
                key={id}
                role="group"
                aria-roledescription={text.panel}
                aria-labelledby={header !== undefined && panelRest['aria-label'] === undefined ? headerId : undefined}
                aria-describedby={movable ? instructions : undefined}
                tabIndex={movable ? 0 : undefined}
                {...panelRest}
                id={`${base}-${id}`}
                className={cx('salmon-dashboard-panel', panelClass)}
                data-id={id}
                data-static={item.static ? '' : undefined}
                data-grabbed={grab?.id === id ? '' : undefined}
                style={{ '--salmon-dashboard-x': item.x + 1, '--salmon-dashboard-y': item.y + 1, '--salmon-dashboard-w': item.w, '--salmon-dashboard-h': item.h, '--salmon-dashboard-order': order.indexOf(id), ...panelStyle } as CSSProperties}
                onPointerDown={draggable && !item.static ? (e) => beginPointer(e, id, null) : undefined}
                onKeyDown={movable ? onKeyDown(id) : undefined}
                onBlur={movable ? onBlur(id) : undefined}
                data-draggable={draggable && !item.static && !dragHandle ? '' : undefined}
              >
                {header !== undefined ? (
                  <div className="salmon-dashboard-panel-header" id={headerId}>
                    {header}
                  </div>
                ) : null}
                <div className="salmon-dashboard-panel-content">{content}</div>
                {item.static ? null : edges.map((edge) => <div key={edge} className="salmon-dashboard-resize" data-edge={edge} aria-hidden="true" onPointerDown={(e) => beginPointer(e, id, edge)} />)}
              </div>
            );
          })}
          <div className="salmon-dashboard-placeholder" aria-hidden="true" />
        </div>
      </div>
      <div id={instructions} hidden>
        {text.instructions}
      </div>
      <div ref={live} className="salmon-visually-hidden" {...liveRegionProps('polite')} />
    </div>
  );
}

DashboardLayout.Panel = DashboardLayoutPanel;
