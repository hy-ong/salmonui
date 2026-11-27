// Canvas plot host: the server renders an empty, sized `<canvas>`;
// after hydration the lazy `plot-canvas` chunk draws the marks. A theme
// change (class or `style` change on an ancestor, `prefers-color-scheme`)
// redraws so resolved `--salmon-*` colors stay current.

import { useEffect, useRef, type ReactNode } from 'react';
import type { CanvasMark } from './plot-canvas.js';

export type { CanvasMark };

export interface VizCanvasProps {
  readonly marks: readonly CanvasMark[];
  readonly width: number;
  readonly height: number;
  readonly className?: string | undefined;
  /** Drawing-space origin of the canvas (marks keep drawing coordinates). */
  readonly originX?: number | undefined;
  readonly originY?: number | undefined;
}

export function VizCanvas({ marks, width, height, className, originX = 0, originY = 0 }: VizCanvasProps): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let draw: (() => void) | null = null;
    void import('./plot-canvas.js').then((m) => {
      if (cancelled) return;
      draw = () => m.drawMarks(canvas, marks, width, height, originX, originY);
      draw();
    });
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const onScheme = () => draw?.();
    media?.addEventListener?.('change', onScheme);
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(onScheme);
    observer?.observe(canvas.ownerDocument.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'] });
    return () => {
      cancelled = true;
      media?.removeEventListener?.('change', onScheme);
      observer?.disconnect();
    };
  }, [marks, width, height, originX, originY]);
  return <canvas ref={ref} className={className ?? 'salmon-viz-canvas'} width={width} height={height} aria-hidden="true" />;
}
