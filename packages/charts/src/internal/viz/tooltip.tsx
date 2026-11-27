// Tooltip layer: a store-driven box inside the surface, mounted
// on the first hover (client only), placed in one layout effect (one read,
// one write) above the anchor, flipped below near the top edge and shifted
// inside the surface. Shares the Layout tooltip surface styles by class.

import { useLayoutEffect, useRef, type ReactNode } from 'react';

export interface VizTooltipProps {
  /** Anchor in surface px (drawing coordinates). */
  readonly x: number;
  readonly y: number;
  /** Drawing size, to convert to the rendered size when the SVG scales. */
  readonly width: number;
  readonly height: number;
  readonly id?: string | undefined;
  readonly children: ReactNode;
  readonly offset?: number | undefined;
}

export function VizTooltip(props: VizTooltipProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const { x, y, width, height } = props;
  const offset = props.offset ?? 10;
  useLayoutEffect(() => {
    const el = ref.current;
    const surface = el?.parentElement;
    if (!el || !surface) return;
    const sw = surface.clientWidth || width;
    const sh = surface.clientHeight || height;
    const ax = (x / width) * sw;
    const ay = (y / height) * sh;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = ax - w / 2;
    let top = ay - h - offset;
    if (top < 0) top = ay + offset;
    if (top + h > sh) top = Math.max(0, sh - h);
    left = Math.max(0, Math.min(left, sw - w));
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    el.style.visibility = 'visible';
  });
  return (
    <div ref={ref} id={props.id} role="tooltip" className="salmon-viz-tooltip" style={{ visibility: 'hidden', left: 0, top: 0 }}>
      {props.children}
    </div>
  );
}
