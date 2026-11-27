// Sparkline tooltip, a lazy chunk loaded on the first pointer
// enter or focus. It attaches its listeners to the owning SVG only then
// (no listener at rest), keeps the hovered index in its own state, draws
// the track line inside the SVG and the tooltip in a fixed-position portal.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SparkModel, SparkPoint } from './model.js';
import type { SparklinePointEvent, SparklineTooltipOptions } from './types.js';

export interface SparklineTooltipProps {
  readonly model: SparkModel;
  readonly options: SparklineTooltipOptions;
  /** False when only `onPointHover` armed the listeners. */
  readonly show: boolean;
  readonly onPointHover?: ((event: SparklinePointEvent | null) => void) | undefined;
  readonly onPointClick?: ((event: SparklinePointEvent) => void) | undefined;
  /** Client x of the pointer enter that loaded the chunk (shows the point under it at once). */
  readonly startX?: number | null | undefined;
}

export default function SparklineTooltip({ model, options, show, onPointHover, onPointClick, startX }: SparklineTooltipProps): ReactNode {
  const g = useRef<SVGGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const latest = useRef({ model, onPointHover, onPointClick, active, startX });
  useLayoutEffect(() => {
    latest.current = { model, onPointHover, onPointClick, active, startX };
  });
  useEffect(() => {
    const svg = g.current?.ownerSVGElement;
    if (!svg) return;
    const emit = (i: number, nativeEvent: PointerEvent | KeyboardEvent, source: 'pointer' | 'keyboard') => {
      const { model: m, onPointHover: cb } = latest.current;
      const p = m.points[i];
      cb?.(p ? { point: p, source, nativeEvent: nativeEvent as never } : null);
    };
    const at = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      return nearestPoint(latest.current.model.points, rect.width ? ((e.clientX - rect.left) / rect.width) * latest.current.model.width : 0);
    };
    const click = (e: MouseEvent) => {
      const p = latest.current.model.points[at(e)];
      if (p) latest.current.onPointClick?.({ point: p, source: 'pointer', nativeEvent: e as never });
    };
    const move = (e: PointerEvent) => {
      const cur = latest.current.active;
      const i = at(e);
      if (i !== cur) {
        setActive(i);
        emit(i, e, 'pointer');
      }
    };
    const leave = (e: PointerEvent) => {
      setActive(-1);
      emit(-1, e, 'pointer');
    };
    const key = (e: KeyboardEvent) => {
      const { model: m, active: cur } = latest.current;
      const last = m.points.length - 1;
      let i = cur;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = Math.min(last, cur + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = Math.max(0, cur - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = last;
      else if (e.key === 'Escape') i = -1;
      else if (e.key === 'Enter' && m.points[cur]) {
        latest.current.onPointClick?.({ point: m.points[cur], source: 'keyboard', nativeEvent: e as never });
        return;
      } else return;
      e.preventDefault();
      setActive(i);
      emit(i, e, 'keyboard');
    };
    const focus = () => {
      if (latest.current.active < 0) setActive(latest.current.model.points.length - 1);
    };
    const blur = () => setActive(-1);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('click', click);
    svg.addEventListener('pointerleave', leave);
    svg.addEventListener('keydown', key);
    svg.addEventListener('focus', focus);
    svg.addEventListener('blur', blur);
    // Armed by focus: show the last point at once.
    if (svg.ownerDocument.activeElement === svg) focus();
    else {
      const x0 = latest.current.startX;
      if (typeof x0 === 'number' && svg.matches(':hover')) {
        const rect = svg.getBoundingClientRect();
        const i = nearestPoint(latest.current.model.points, rect.width ? ((x0 - rect.left) / rect.width) * latest.current.model.width : 0);
        setActive(i);
        const p = latest.current.model.points[i];
        if (p) latest.current.onPointHover?.({ point: p, source: 'pointer', nativeEvent: new PointerEvent('pointermove') as never });
      }
    }
    return () => {
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('click', click);
      svg.removeEventListener('pointerleave', leave);
      svg.removeEventListener('keydown', key);
      svg.removeEventListener('focus', focus);
      svg.removeEventListener('blur', blur);
    };
  }, []);
  const p = model.points[active];
  useLayoutEffect(() => {
    const el = tip.current;
    const svg = g.current?.ownerSVGElement;
    if (!el || !svg || !p) return;
    const r = svg.getBoundingClientRect();
    const ax = r.left + (p.px / model.width) * r.width;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = svg.ownerDocument.documentElement.clientWidth;
    const left = Math.max(4, Math.min(ax - w / 2, vw - w - 4));
    const top = r.top - h - 6 < 0 ? r.bottom + 6 : r.top - h - 6;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    el.style.visibility = 'visible';
  });
  const text = p ? (options.format ? options.format(p) : model.format(p.y)) : '';
  return (
    <g ref={g} className="salmon-sparkline-hover" aria-hidden="true">
      {p && show && options.trackLine !== false ? <line className="salmon-sparkline-track" x1={p.px} x2={p.px} y1={0} y2={model.height} /> : null}
      {p && show ? <circle className="salmon-sparkline-focus" cx={p.px} cy={p.bar ? p.bar.y : p.py} r={3} /> : null}
      {p && show
        ? createPortal(
            <div ref={tip} role="tooltip" className="salmon-sparkline-tooltip" style={{ visibility: 'hidden' }}>
              {options.render ? options.render(p) : text}
            </div>,
            g.current?.ownerDocument.body ?? document.body,
          )
        : null}
    </g>
  );
}

/** Nearest point to a drawing x (sorted by px). */
function nearestPoint(points: readonly SparkPoint[], x: number): number {
  let best = -1;
  let dist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs((points[i] as SparkPoint).px - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}
