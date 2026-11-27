'use client';

// Overlay: a
// client-only portal, top layer through the Popover API with a fixed
// position fallback, placement measured in one layout effect (read phase,
// then one write), optional repositioning on scroll and resize, and the
// dismiss layer and focus scope bound to the overlay element. Generalized
// from `DataGridPopover` in `data-grid/popover.tsx`.
//
// The overlay writes on its element:
// - `transform: translate(x, y)` with `top: 0; left: 0` (viewport coordinates),
// - `data-placement` (resolved physical placement, `bottom-start`) and
//   `data-placed` once positioned (CSS can hide the box until then),
// - `--salmon-overlay-available-width` / `-height` (room on the resolved
//   side) and `--salmon-overlay-anchor-width` / `-height` in px.
// The overlay sets only the box geometry inline (`position: fixed`, inset,
// margin), overriding the UA `[popover]` inset and auto margins. Component
// CSS must set border, padding, background, color and overflow (the UA
// popover defaults are `border: solid`, `padding: .25em`, `Canvas` colors)
// and a z-index for the non-top-layer fallback.

import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss, type DismissReason } from './dismiss.js';
import { useFocusScope, type FocusScopeOptions } from './focus-scope.js';
import { portalScopeOf } from './modal-host.js';
import { anchorRect, computePosition, isRtl, viewportOf, type AnchorLike, type Placement, type Position } from './position.js';

const noopSubscribe = (): (() => void) => () => {};
const clientSnapshot = (): boolean => true;
const serverSnapshot = (): false => false;

/**
 * False on the server and during hydration, true afterwards: portals and
 * popups mount only after hydration, so server and client markup match.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}

/** A portal target, or a getter for one read as an external-store snapshot (not in the render body). */
export type PortalContainer = Element | DocumentFragment | null | undefined | (() => Element | DocumentFragment | null | undefined);

/**
 * Portal target as an external-store snapshot (React Compiler: no DOM or ref
 * reads in a render body): false on the server and during hydration, then
 * `read()`, else `document.body`. One hook in place
 * of `useHydrated`, so the commits are the same: none extra on a client
 * mount, one after hydration. Without a subscription the snapshot is re-read
 * on each render and checked once after the commit that mounts it, so a
 * target that appears with that commit (an anchor mounted alongside) moves
 * the portal there.
 */
export function usePortalTarget(read: () => Element | DocumentFragment | null | undefined): Element | DocumentFragment | false {
  // Client snapshots only (the server snapshot is false), so `document` exists.
  return useSyncExternalStore<Element | DocumentFragment | false>(noopSubscribe, () => read() ?? document.body, serverSnapshot);
}

/** Renders `children` into `container` (default `document.body`) after hydration. */
export function Portal(props: { readonly children: ReactNode; readonly container?: PortalContainer }): ReactNode {
  const { container } = props;
  const target = usePortalTarget(typeof container === 'function' ? container : () => container);
  return target ? createPortal(props.children, target) : null;
}

/**
 * Default portal target of a popup anchored at `el`: the open modal
 * `<dialog>` around it (everything outside a modal dialog is inert;
 * modal-host.ts), else the `ThemeProvider` scope (so theme variables apply),
 * else undefined (`usePortalTarget` falls back to the body). Event time, effects
 * or a `usePortalTarget` getter only.
 */
export function themeScopeOf(el: unknown): Element | undefined {
  return (el as Element | null)?.closest ? portalScopeOf(el as Element) : undefined;
}

/** Anchor of an overlay: an element, a ref to one, a rect or virtual element, or a getter read at placement time. */
export type OverlayAnchor = AnchorLike | RefObject<Element | null> | (() => AnchorLike | null);

function resolveAnchor(anchor: OverlayAnchor): AnchorLike | null {
  if (typeof anchor === 'function') return anchor();
  if ('current' in anchor) return anchor.current;
  return anchor as AnchorLike;
}

export interface OverlayPositionOptions {
  readonly placement?: Placement | undefined;
  readonly offset?: number | undefined;
  readonly margin?: number | undefined;
  readonly flip?: boolean | undefined;
  readonly shift?: boolean | undefined;
  /** Offset along the anchor edge in px. */
  readonly crossOffset?: number | undefined;
  /** Collision boundary element (a scrolling container); default the viewport. Read at placement time. */
  readonly collisionBoundary?: Element | null | undefined;
  /** Writing direction; default read from the anchor element (or the overlay's container) at placement time. */
  readonly rtl?: boolean | undefined;
  /** Reposition on window resize and on scroll of any ancestor. Default true. */
  readonly autoUpdate?: boolean | undefined;
  /** Called after each placement with the resolved position. */
  readonly onPlaced?: ((position: Position) => void) | undefined;
}

/**
 * Places the element in `ref` next to `anchor` in a layout effect (one
 * read, one write) and again on scroll / resize when `autoUpdate`. Returns a
 * function that re-places on demand (content changed size).
 */
export function useOverlayPosition(ref: RefObject<HTMLElement | null>, anchor: OverlayAnchor, options: OverlayPositionOptions = {}): () => void {
  const latest = useRef({ anchor, options });
  useLayoutEffect(() => {
    latest.current = { anchor, options };
  });
  const place = useCallback((): void => {
    const el = ref.current;
    if (!el?.isConnected) return;
    const { anchor: a, options: o } = latest.current;
    const target = resolveAnchor(a);
    if (!target) return;
    // Read phase.
    const rect = anchorRect(target);
    const doc = el.ownerDocument;
    const viewport = viewportOf(doc);
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const rtl = o.rtl ?? isRtl('getBoundingClientRect' in target && 'ownerDocument' in target ? (target as Element) : (el.parentElement ?? doc.documentElement));
    const boundary = o.collisionBoundary ? anchorRect(o.collisionBoundary) : undefined;
    const p = computePosition(rect, size, viewport, { placement: o.placement, offset: o.offset, margin: o.margin, flip: o.flip, shift: o.shift, rtl, crossOffset: o.crossOffset, boundary });
    // Write phase.
    const s = el.style;
    s.transform = `translate(${p.x}px, ${p.y}px)`;
    s.setProperty('--salmon-overlay-available-width', `${p.availableWidth}px`);
    s.setProperty('--salmon-overlay-available-height', `${p.availableHeight}px`);
    s.setProperty('--salmon-overlay-anchor-width', `${rect.width}px`);
    s.setProperty('--salmon-overlay-anchor-height', `${rect.height}px`);
    s.setProperty('--salmon-overlay-arrow', `${p.arrow}px`);
    el.dataset['placement'] = p.placement;
    el.dataset['side'] = p.side;
    el.dataset['placed'] = '';
    o.onPlaced?.(p);
  }, [ref]);
  const placement = options.placement;
  const rtl = options.rtl;
  useLayoutEffect(() => {
    place();
  }, [place, anchor, placement, rtl]);
  const autoUpdate = options.autoUpdate !== false;
  useLayoutEffect(() => {
    const el = ref.current;
    const win = el?.ownerDocument.defaultView;
    if (!autoUpdate || !win) return;
    // Scroll and resize are transients: coalesced to one placement per frame, never React state.
    let frame = 0;
    const schedule = (): void => {
      if (frame) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    win.addEventListener('resize', schedule, { passive: true });
    win.addEventListener('scroll', schedule, { passive: true, capture: true });
    return () => {
      win.cancelAnimationFrame(frame);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('scroll', schedule, { capture: true });
    };
  }, [ref, place, autoUpdate]);
  return place;
}

/**
 * Shows the element in `ref` in the top layer (Popover API) while mounted; a
 * no-op where unsupported. `mode` is the `popover` attribute: `'manual'`
 * (default) or `'hint'` (tooltips: does not close open auto popovers), which
 * falls back to `'manual'` where the browser does not know it.
 */
export function useTopLayer(ref: RefObject<HTMLElement | null>, enabled = true, mode: 'manual' | 'hint' = 'manual'): void {
  useLayoutEffect(() => {
    const el = ref.current;
    // No Popover API: the fixed-position fallback.
    if (!enabled || !el?.showPopover) return;
    el.setAttribute('popover', mode);
    if (mode === 'hint' && el.popover !== 'hint') el.setAttribute('popover', 'manual');
    try {
      el.showPopover();
    } catch {
      // Already shown or detached: the fixed-position fallback still applies.
    }
    return () => {
      try {
        el.hidePopover();
      } catch {
        // Hidden already (older engines throw) or detached.
      }
    };
  }, [ref, enabled, mode]);
}

export interface OverlayProps extends OverlayPositionOptions, Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'> {
  readonly anchor: OverlayAnchor;
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly ref?: Ref<HTMLDivElement> | undefined;
  /** Portal target; default the open modal dialog around the anchor, else its `ThemeProvider` scope, else `document.body`. */
  readonly container?: Element | null | undefined;
  /** Top layer through the Popover API. Default true; `'hint'` uses `popover="hint"` where supported (tooltips). */
  readonly topLayer?: boolean | 'hint' | undefined;
  /** Dismissal (outside press, Escape, focus leaving). Omit to make the overlay non-dismissable. */
  readonly onDismiss?: ((reason: DismissReason, event: Event) => void) | undefined;
  /** Elements that count as inside for dismissal (the trigger, parent menus). */
  readonly insideRefs?: readonly RefObject<Element | null>[] | undefined;
  readonly dismissOnOutsidePress?: boolean | ((event: PointerEvent) => boolean) | undefined;
  readonly dismissOnEscape?: boolean | undefined;
  readonly dismissOnFocusOutside?: boolean | undefined;
  /** Focus scope options; `false` leaves focus alone (a combobox keeps focus in its input). Default: first tabbable, Tab leaves, restore on close. */
  readonly focus?: FocusScopeOptions | false | undefined;
}

const OVERLAY_BOX: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 'auto',
  bottom: 'auto',
  margin: 0,
};

/**
 * A positioned, dismissable overlay. Render it only while open: it mounts
 * after hydration, places itself in a layout effect and is removed on
 * close (focus restored by the focus scope).
 */
export function Overlay(props: OverlayProps): ReactNode {
  // Default target: the anchor's modal dialog, else its theme scope (so `--salmon-*` variables apply), else the body.
  const target = usePortalTarget(() => props.container ?? themeScopeOf(resolveAnchor(props.anchor)));
  return target ? <OverlayClient {...props} container={target as Element} /> : null;
}

function OverlayClient(props: OverlayProps & { readonly container: Element }): ReactNode {
  const {
    anchor,
    children,
    className,
    style,
    ref,
    container,
    topLayer,
    onDismiss,
    insideRefs,
    dismissOnOutsidePress,
    dismissOnEscape,
    dismissOnFocusOutside,
    focus,
    placement,
    offset,
    margin,
    flip,
    shift,
    crossOffset,
    collisionBoundary,
    rtl,
    autoUpdate,
    onPlaced,
    ...rest
  } = props;
  const own = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      own.current = el;
      // A callback ref's cleanup (React 19) is passed through.
      if (typeof ref === 'function') return ref(el);
      if (ref) ref.current = el;
    },
    [ref],
  );
  // Order matters: top layer (makes the box measurable), placement, then focus.
  useTopLayer(own, topLayer !== false, topLayer === 'hint' ? 'hint' : 'manual');
  // The props carry the position options (read by name); the destructuring above keeps them off the element.
  useOverlayPosition(own, anchor, props);
  useDismiss(own, {
    enabled: onDismiss !== undefined,
    // Only called while enabled, so defined.
    onDismiss: onDismiss!,
    insideRefs,
    outsidePress: dismissOnOutsidePress,
    escape: dismissOnEscape,
    focusOutside: dismissOnFocusOutside,
  });
  useFocusScope(own, focus === false ? { enabled: false } : (focus ?? {}));
  return createPortal(
    <div {...rest} ref={setRef} className={className} style={{ ...OVERLAY_BOX, ...style }} data-salmon-overlay="">
      {children}
    </div>,
    container,
  );
}
