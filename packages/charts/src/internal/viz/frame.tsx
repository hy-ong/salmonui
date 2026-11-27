// Frame plumbing shared by the figure-based families without cartesian axes
// (PieChart, FunnelChart, HeatMap, TreeMap, SankeyChart): the per-instance
// store with size, hover and focus transients, the measured surface, the
// `ref` instance, titles drawn in the SVG, pointer-to-drawing coordinates
// and the frozen change-event object.

import { useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref, type RefObject } from 'react';
import { n2, type FrameLayout } from '#viz';
import { useAnimateAttribute } from './animate.js';
import { createVizInstance, type VizInstance, type VizInstanceSource } from './instance.js';
import { initialSize, useMeasuredSize, useSize, type SizeState } from './size.js';
import { useVizSelector, useVizStore, type VizStore } from './store.js';

export interface FrameState extends SizeState {
  /** Hovered target index (family-defined), -1 for none. */
  readonly hover: number;
  /** Keyboard focus target index, -1 before the first arrow key. */
  readonly focus: number;
  /** Highlighted legend item index (legend hover), -1 for none. */
  readonly legendHover: number;
  /** Tooltip anchor in drawing px, null when hidden. */
  readonly tip: { readonly x: number; readonly y: number } | null;
}

export interface FrameOptions {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly nominalHeight?: number | undefined;
  readonly onResize?: ((size: SizeState) => void) | undefined;
  /** Entrance and update transitions; default true. */
  readonly animated?: boolean | undefined;
}

export interface Frame {
  readonly store: VizStore<FrameState>;
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly size: SizeState;
}

export function useFrame(options: FrameOptions): Frame {
  const store = useVizStore<FrameState>(() => ({ ...initialSize(options, options.nominalHeight), hover: -1, focus: -1, legendHover: -1, tip: null }));
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  useMeasuredSize(surfaceRef, store, options, options.onResize);
  useAnimateAttribute(rootRef, options.animated);
  const size = useSize(store);
  return { store, surfaceRef, rootRef, size };
}


/** Binds the family instance (`HeatMapApi`, ...) to `ref`. */
export function useVizInstance(ref: Ref<VizInstance> | undefined, frame: Frame, source: Omit<VizInstanceSource, 'root'>): void {
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  useImperativeHandle(ref, () => createVizInstance({ root: () => frame.rootRef.current, get name() { return latest.current.name; }, csv: () => latest.current.csv?.() ?? { columns: [], rows: [] } }), [frame]);
}

/**
 * Surface style: a given `width` / `height` fixes that side (the drawing then
 * maps 1:1 to the surface, so pointer coordinates stay exact); otherwise the
 * container decides and the measured size relays out once. Without
 * `height` the surface fills a root whose height CSS fixes (`height`,
 * `aspect-ratio`, a stretched grid cell); with an auto root height `100%`
 * resolves to auto and the drawing keeps its nominal aspect ratio.
 */
export const surfaceStyle = (width: number | undefined, height: number | undefined): CSSProperties => ({ ...(width === undefined ? {} : { inlineSize: width, maxInlineSize: '100%' }), blockSize: height ?? '100%' });

/**
 * Pointer position in drawing coordinates. Uses the inverse screen matrix of
 * the surface SVG (exact under `viewBox` letterboxing), else maps the
 * element's box to the whole `width` x `height` drawing.
 */
export function toDrawing(event: { clientX: number; clientY: number }, el: Element, width: number, height: number): { x: number; y: number } {
  const svg = el.parentElement?.querySelector('svg');
  const m = svg?.getScreenCTM?.();
  if (m) {
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  const r = el.getBoundingClientRect();
  return { x: r.width ? ((event.clientX - r.left) / r.width) * width : 0, y: r.height ? ((event.clientY - r.top) / r.height) * height : 0 };
}

/**
 * Title and subtitle drawn in the SVG (aria-hidden with the drawing; the
 * figcaption carries them). `@salmonui/charts/viz-rtl.css` mirrors them under
 * an inherited `dir="rtl"`.
 */
export function FrameTitles({ frame }: { readonly frame: Pick<FrameLayout, 'title' | 'subtitle'> }): ReactNode {
  return (
    <>
      {frame.title ? (
        <text className="salmon-viz-title" x={n2(frame.title.x)} y={n2(frame.title.y)}>
          {frame.title.text}
        </text>
      ) : null}
      {frame.subtitle ? (
        <text className="salmon-viz-subtitle" x={n2(frame.subtitle.x)} y={n2(frame.subtitle.y)}>
          {frame.subtitle.text}
        </text>
      ) : null}
    </>
  );
}

export type VizChangeSource = 'pointer' | 'keyboard' | 'touch' | 'api';

export interface VizChangeEvent<R extends string = string> {
  readonly source: VizChangeSource;
  readonly reason: R;
}

/** The frozen change-event object. */
export const changeEvent = <R extends string>(source: VizChangeSource, reason: R): VizChangeEvent<R> => Object.freeze({ source, reason });

/** Pointer type to change source. */
export const pointerSource = (pointerType: string | undefined): VizChangeSource => (pointerType === 'touch' ? 'touch' : 'pointer');

/** Toggles `item` in a list (selection, hidden items). */
export function toggleIn<T>(list: readonly T[], item: T, equal: (a: T, b: T) => boolean = Object.is, multiple = true): T[] {
  const has = list.some((x) => equal(x, item));
  if (has) return list.filter((x) => !equal(x, item));
  return multiple ? [...list, item] : [item];
}

/** Live region text of the keyboard-focused target (subscribes to `focus` only, so the figure root does not re-render). */
export function FocusAnnouncement({ frame, describe }: { readonly frame: Frame; readonly describe: (index: number) => string }): ReactNode {
  const focus = useVizSelector(frame.store, (s) => s.focus);
  return focus >= 0 ? describe(focus) : null;
}
