'use client';

// Tooltip (APG Tooltip): opens on hover
// and keyboard focus, closes on Escape, blur and pointer leave (after
// `closeDelay`), stays open while its content is hovered (WCAG 1.4.13),
// never on touch. Content renders only while open (client only); the
// trigger's `aria-describedby` is set only while open, so server and client
// markup match. Lean by design (4 KB budget): positioning and top layer
// (`popover="hint"`) come from the overlay primitives; no dismiss stack or
// focus scope, and the one Escape listener exists only while open.

import {
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { themeScopeOf, useHydrated, useOverlayPosition, usePortalTarget, useTopLayer } from '@salmonui/core/internal/overlay';
import { splitOffset, toPlacement, type OverlayOffset, type OverlayPlacement } from '../internal/placement.js';
import { pointRect, type AnchorLike } from '@salmonui/core/internal/position';

export type TooltipPlacement = OverlayPlacement;
export type TooltipOffset = OverlayOffset;
export type TooltipOpenChangeReason = 'hover' | 'focus' | 'blur' | 'leave' | 'escape' | 'press';

/** Second argument of `onOpenChange`: frozen, allocated only when a callback is bound. */
export interface TooltipOpenChangeEvent {
  readonly reason: TooltipOpenChangeReason;
  readonly source: 'pointer' | 'keyboard';
}

/** Mutable box shared by a provider's tooltips (a ref, never React state). */
interface Shared {
  /** Time the skip-delay window started (a tooltip of the provider closed or started closing). */
  at: number;
  /** Closes the provider's open tooltip at once when another one opens (one tooltip at a time). */
  close: (() => void) | null;
}

interface Timing {
  readonly delay: number;
  readonly closeDelay: number;
  readonly skipDelay: number;
  readonly shared: Shared;
}

const TimingContext = createContext<Timing | null>(null);

export interface TooltipProviderProps {
  readonly children?: ReactNode;
  /** Open delay in ms for every tooltip inside. Default 600. */
  readonly delay?: number | undefined;
  /** Close delay in ms. Default 100. */
  readonly closeDelay?: number | undefined;
  /** After a tooltip closes, the next one opens without delay for this many ms. Default 300. */
  readonly skipDelay?: number | undefined;
}

/** Shares `delay` / `closeDelay` and the skip-delay window between tooltips (moving between triggers opens instantly). */
export function TooltipProvider(props: TooltipProviderProps): ReactElement {
  const shared = useState<Shared>(() => ({ at: -Infinity, close: null }))[0];
  const value: Timing = { delay: props.delay ?? 600, closeDelay: props.closeDelay ?? 100, skipDelay: props.skipDelay ?? 300, shared };
  return <TimingContext value={value}>{props.children}</TimingContext>;
}

/** Props `Tooltip` computes for the trigger (spread them in `render`). */
export interface TooltipTriggerProps {
  readonly 'aria-describedby'?: string | undefined;
  readonly onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove?: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly ref: (el: HTMLElement | null) => void;
}

export type TooltipPart = 'content' | 'arrow';

/** `contentProps`: DOM attributes of the content element, `data-*` attributes included. */
export type TooltipContentProps = Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'role'> & { readonly [attribute: `data-${string}`]: string | number | boolean | undefined };

export interface TooltipProps {
  /** Tooltip text or nodes (no interactive content: use `Popover`). Rendered only while open. */
  readonly content: ReactNode;
  /** The trigger, wrapped in a `display: contents` span; the first element child is the anchor and gets `aria-describedby`. */
  readonly children?: ReactNode;
  /** Renders the trigger element itself with the computed props (no wrapper span). Wins over `children`. */
  readonly render?: ((props: TooltipTriggerProps) => ReactElement) | undefined;
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean, event: TooltipOpenChangeEvent) => void) | undefined;
  /** After the content is shown / removed. */
  readonly onAfterOpen?: (() => void) | undefined;
  readonly onAfterClose?: (() => void) | undefined;
  /** Logical placement resolved against `dir`. Default `'top'`. */
  readonly placement?: TooltipPlacement | undefined;
  /** Gap to the anchor in px (default 6) or `{ mainAxis, crossAxis }`. */
  readonly offset?: TooltipOffset | undefined;
  /** Arrow pointing at the anchor. Default true. */
  readonly arrow?: boolean | undefined;
  /** Element whose box limits flip and shift. Default the viewport. */
  readonly collisionBoundary?: Element | null | undefined;
  /** Portal target (the tooltip is in the top layer where the Popover API exists). Default `document.body`. */
  readonly container?: Element | null | undefined;
  /** Open delay in ms (default from `Tooltip.Provider`, else 600). */
  readonly delay?: number | undefined;
  /** Close delay in ms (default from `Tooltip.Provider`, else 100). */
  readonly closeDelay?: number | undefined;
  /** Follows the pointer over the trigger (CSS translate written per frame, never React state). */
  readonly followCursor?: boolean | undefined;
  /** Never opens. */
  readonly disabled?: boolean | undefined;
  /** Extra attributes for the content element, `data-*` included (`id` is reserved for `aria-describedby`). */
  readonly contentProps?: TooltipContentProps | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: Partial<Record<TooltipPart, string>> | undefined;
  readonly styles?: Partial<Record<TooltipPart, CSSProperties>> | undefined;
  /** The content element (`role="tooltip"`). */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/**
 * Tooltip. Styling hooks: `.salmon-tooltip` (content, `data-side`,
 * `data-placement`), `.salmon-tooltip-arrow`, `.salmon-tooltip-trigger`
 * (the `display: contents` wrapper).
 */
export function Tooltip(props: TooltipProps): ReactElement {
  const { open: openProp, defaultOpen, onOpenChange, onAfterOpen, onAfterClose, disabled, render, children, followCursor } = props;
  const provider = use(TimingContext);
  // Without a provider each tooltip keeps its own box (no module-level state).
  const own = useState<Shared>(() => ({ at: -Infinity, close: null }))[0];
  const shared = provider?.shared ?? own;
  const delay = props.delay ?? provider?.delay ?? 600;
  const closeDelay = props.closeDelay ?? provider?.closeDelay ?? 100;
  const skipDelay = provider?.skipDelay ?? 0;
  const notify = onOpenChange && ((next: boolean, reason: TooltipOpenChangeReason, source: 'pointer' | 'keyboard') => onOpenChange(next, Object.freeze({ reason, source })));
  const [openState, setOpen] = useControllableState<boolean, [TooltipOpenChangeReason, 'pointer' | 'keyboard']>(openProp, defaultOpen ?? false, notify, 'Tooltip open');
  const hydrated = useHydrated();
  const open = openState && hydrated && !disabled;
  const id = useId();
  // Transients: timers, the trigger element, the pointer point. Never state.
  const live = useState<{ timer: number; trigger: HTMLElement | null; point: AnchorLike | null; place: () => void }>(() => ({ timer: 0, trigger: null, point: null, place: () => {} }))[0];
  const clear = (): void => {
    globalThis.clearTimeout(live.timer);
    live.timer = 0;
  };
  const schedule = (next: boolean, ms: number, reason: TooltipOpenChangeReason, source: 'pointer' | 'keyboard'): void => {
    clear();
    const run = (): void => {
      live.timer = 0;
      if (next) {
        if (shared.close !== close) shared.close?.();
        shared.close = close;
      } else {
        if (shared.close === close) shared.close = null;
        shared.at = performance.now();
      }
      setOpen(next, reason, source);
    };
    if (ms <= 0) run();
    else live.timer = globalThis.setTimeout(run, ms) as unknown as number;
  };
  const openDelay = (): number => (performance.now() - shared.at < skipDelay ? 0 : delay);
  // Stable per instance: lets a sibling tooltip of the provider close this one.
  const close = useState(() => () => schedule(false, 0, 'leave', 'pointer'))[0];
  useEffect(() => clear, []); // eslint-disable-line react-hooks/exhaustive-deps
  // After-open / after-close notifications (not on mount).
  const was = useRef(open);
  useEffect(() => {
    if (was.current === open) return;
    was.current = open;
    (open ? onAfterOpen : onAfterClose)?.();
  });
  // Escape closes the tooltip only (capture, so a surrounding dialog keeps its state); installed only while open.
  useEffect(() => {
    if (!open) return;
    const doc = live.trigger?.ownerDocument ?? globalThis.document;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      schedule(false, 0, 'escape', 'keyboard');
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  });
  const triggerProps: TooltipTriggerProps = {
    'aria-describedby': open ? id : undefined,
    ref: (el) => {
      live.trigger = el;
    },
    onPointerEnter: (event) => {
      if (disabled || event.pointerType === 'touch') return;
      if (followCursor) live.point = pointRect(event.clientX, event.clientY);
      schedule(true, openDelay(), 'hover', 'pointer');
    },
    onPointerMove: followCursor
      ? (event) => {
          live.point = pointRect(event.clientX, event.clientY);
          live.place();
        }
      : undefined,
    onPointerLeave: (event) => {
      if (event.pointerType === 'touch') return;
      // Leaving an open tooltip starts the provider's skip window, so the next trigger opens at once.
      if (open) shared.at = performance.now() + closeDelay;
      schedule(false, closeDelay, 'leave', 'pointer');
    },
    onPointerDown: () => {
      if (open || live.timer) schedule(false, 0, 'press', 'pointer');
    },
    onFocus: (event) => {
      // Keyboard focus only (APG): a pointer focus is covered by hover.
      if (!disabled && (event.target as HTMLElement).matches?.(':focus-visible')) schedule(true, 0, 'focus', 'keyboard');
    },
    onBlur: () => schedule(false, 0, 'blur', 'keyboard'),
  };
  let trigger: ReactElement;
  if (render) trigger = render(triggerProps);
  else {
    const { ref, 'aria-describedby': _d, ...handlers } = triggerProps;
    trigger = (
      <span className="salmon-tooltip-trigger" style={{ display: 'contents' }} {...handlers} ref={(el) => ref((el?.firstElementChild as HTMLElement | null) ?? null)}>
        {children}
      </span>
    );
  }
  return (
    <>
      {trigger}
      {open ? <TooltipContent {...props} id={id} live={live} onEnter={clear} onLeave={() => schedule(false, closeDelay, 'leave', 'pointer')} describe={!render} /> : null}
    </>
  );
}

interface ContentProps extends TooltipProps {
  readonly id: string;
  readonly live: { trigger: HTMLElement | null; point: AnchorLike | null; place: () => void };
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  /** Wrapper mode: write `aria-describedby` on the trigger element while mounted. */
  readonly describe: boolean;
}

function TooltipContent(props: ContentProps): ReactNode {
  const { id, live, content, className, style, classNames, styles, contentProps, ref, arrow } = props;
  const own = useRef<HTMLDivElement | null>(null);
  const { main, cross } = splitOffset(props.offset, 6);
  useTopLayer(own, true, 'hint');
  const place = useOverlayPosition(own, () => (props.followCursor && live.point) || live.trigger, {
    placement: toPlacement(props.placement, 'top'),
    offset: main,
    crossOffset: cross,
    collisionBoundary: props.collisionBoundary,
  });
  useLayoutEffect(() => {
    live.place = place;
  });
  useLayoutEffect(() => {
    const el = props.describe ? live.trigger : null;
    if (!el) return;
    const before = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', before ? `${before} ${id}` : id);
    return () => {
      if (before) el.setAttribute('aria-describedby', before);
      else el.removeAttribute('aria-describedby');
    };
  }, [id, live, props.describe]);
  const target = usePortalTarget(() => props.container ?? themeScopeOf(live.trigger));
  if (!target) return null;
  return createPortal(
    <div
      {...contentProps}
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
      }}
      id={id}
      role="tooltip"
      className={cx(cx('salmon-tooltip', className), classNames?.content)}
      style={{ position: 'fixed', top: 0, left: 0, margin: 0, ...style, ...styles?.content }}
      data-arrow={arrow === false ? undefined : ''}
      onPointerEnter={props.onEnter}
      onPointerLeave={props.onLeave}
    >
      {content}
      {arrow === false ? null : <span className={cx('salmon-tooltip-arrow', classNames?.arrow)} style={styles?.arrow} aria-hidden="true" />}
    </div>,
    target,
  );
}

Tooltip.Provider = TooltipProvider;
