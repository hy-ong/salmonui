'use client';

// Popover: a non-modal, interactive
// anchored overlay. APG non-modal dialog guidance: `role="dialog"` without
// `aria-modal`, focus moves in on open and returns to the trigger on close,
// Tab is not contained. Built on the internal overlay, dismiss and focus
// primitives; content renders only while open (client only), so the server
// HTML holds the trigger alone.

import {
  createContext,
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { Overlay, useHydrated } from '@salmonui/core/internal/overlay';
import { splitOffset, toPlacement, type OverlayOffset, type OverlayPlacement } from '../internal/placement.js';
import { pressSource, type PressSource } from '@salmonui/core/internal/press';

export type PopoverPlacement = OverlayPlacement;
export type PopoverOffset = OverlayOffset;
export type PopoverOpenChangeReason = 'trigger' | 'close' | 'escape' | 'outside' | 'focus-outside' | 'api';

/** Second argument of `onOpenChange`: frozen, allocated only when a callback is bound. */
export interface PopoverOpenChangeEvent {
  readonly reason: PopoverOpenChangeReason;
  readonly source: PressSource | 'api';
}

export interface PopoverProps {
  /** `Popover.Trigger` and `Popover.Content` (any order, any depth). */
  readonly children?: ReactNode;
  readonly open?: boolean | undefined;
  /** Applied after hydration, so server and client markup stay identical. */
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean, event: PopoverOpenChangeEvent) => void) | undefined;
  /** Logical placement, resolved against `dir`. Default `'bottom'`. Flips and shifts to stay inside the collision boundary. */
  readonly placement?: PopoverPlacement | undefined;
  /** Gap to the anchor in px (default 8), or `{ mainAxis, crossAxis }`. */
  readonly offset?: PopoverOffset | undefined;
  /** Renders an arrow pointing at the anchor. Default false. */
  readonly arrow?: boolean | undefined;
  /** Element whose box limits flip and shift (a scrolling container). Default the viewport. */
  readonly collisionBoundary?: Element | null | undefined;
  /** Anchor element other than the trigger (a field the popover belongs to). */
  readonly anchor?: RefObject<Element | null> | undefined;
  /** Portal target for browsers without the Popover API (top layer otherwise). Default `document.body`. */
  readonly container?: Element | null | undefined;
  /** Close on a press outside the content and trigger. Default true. */
  readonly closeOnOutsidePress?: boolean | undefined;
  /** Close on Escape. Default true. */
  readonly closeOnEscape?: boolean | undefined;
  /** Close when focus moves outside (Tab past the last control). Default true. */
  readonly closeOnFocusOutside?: boolean | undefined;
  /** Initial focus: the first tabbable control (default), the content element, or none. */
  readonly initialFocus?: 'first' | 'container' | false | undefined;
  /** Return focus to the trigger on close. Default true. */
  readonly returnFocus?: boolean | undefined;
}

interface PopoverContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean, reason: PopoverOpenChangeReason, source: PressSource | 'api') => void;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly contentId: string;
  readonly titleId: string;
  readonly descriptionId: string;
  readonly props: PopoverProps;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

/** `base` plus the caller's `className`. */
const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** Parts read the root's context; rendering a part outside `<Popover>` is a usage error (throws on the null context). */
const usePopoverContext = (): PopoverContextValue => use(PopoverContext) as PopoverContextValue;

/**
 * Popover root: holds the open triad and the ids. Renders no element of its
 * own.
 */
export function Popover(props: PopoverProps): ReactElement {
  const { open: openProp, defaultOpen, onOpenChange } = props;
  // The event object is allocated only when a callback is bound.
  const notify = onOpenChange && ((open: boolean, reason: PopoverOpenChangeReason, source: PressSource | 'api') => onOpenChange(open, Object.freeze({ reason, source })));
  const [open, setOpenState] = useControllableState<boolean, [PopoverOpenChangeReason, PressSource | 'api']>(openProp, defaultOpen ?? false, notify, 'Popover open');
  const triggerRef = useRef<HTMLElement | null>(null);
  const base = useId();
  // The server and the hydration render show the popover closed (content is
  // client only); an initially open popover opens right after hydration.
  const hydrated = useHydrated();
  const value: PopoverContextValue = {
    open: open && hydrated,
    setOpen: setOpenState,
    triggerRef,
    contentId: `${base}-content`,
    titleId: `${base}-title`,
    descriptionId: `${base}-description`,
    props,
  };
  return <PopoverContext value={value}>{props.children}</PopoverContext>;
}

/** Props `Popover.Trigger` computes for its element (spread them in `render`). */
export type PopoverTriggerRenderProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly ref: Ref<HTMLButtonElement>;
};

export interface PopoverTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Renders another element (a `Button`, a link) with the computed props. */
  readonly render?: ((props: PopoverTriggerRenderProps) => ReactElement) | undefined;
  readonly ref?: Ref<HTMLButtonElement> | undefined;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

/** A callback ref that writes `own` and the caller's `ref`. */
function useMergedRef<T>(own: { current: T | null }, ref: Ref<T> | undefined): (el: T | null) => void {
  return useCallback(
    (el: T | null) => {
      own.current = el;
      assignRef(ref, el);
    },
    // `own` is a ref owned by the caller (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ref],
  );
}

/** Trigger and Close: a `<button type="button">` (or `render`) that proposes an open state. */
function popoverButton(ctx: PopoverContextValue, props: PopoverTriggerProps, part: 'trigger' | 'close', extra: object, next: boolean, ref: Ref<HTMLButtonElement>): ReactElement {
  const { render, ref: _ref, onClick, className, type, ...rest } = props;
  const computed = {
    ...rest,
    ...extra,
    type: type ?? 'button',
    className: cx(`salmon-popover-${part}`, className),
    ref,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) ctx.setOpen(next, part, pressSource(event));
    },
  } as PopoverTriggerRenderProps;
  return render ? render(computed) : <button {...computed} />;
}

/**
 * The element that toggles the popover: a `<button type="button">` with
 * `aria-haspopup="dialog"`, `aria-expanded` and, while open,
 * `aria-controls`. `render` swaps the element (`render={(p) => <Button {...p} />}`).
 */
export function PopoverTrigger(props: PopoverTriggerProps): ReactElement {
  const ctx = usePopoverContext();
  const ref = useMergedRef(ctx.triggerRef as { current: HTMLButtonElement | null }, props.ref);
  const extra = { 'aria-haspopup': 'dialog', 'aria-expanded': ctx.open, 'aria-controls': ctx.open ? ctx.contentId : undefined };
  return popoverButton(ctx, props, 'trigger', extra, !ctx.open, ref);
}

/** `id` is reserved: the trigger's `aria-controls` points at it. */
export interface PopoverContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'id'> {
  readonly children?: ReactNode;
  /** The content element (`role="dialog"`). */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

/**
 * The floating panel (`role="dialog"`, no `aria-modal`): mounted only while
 * open, in the top layer, positioned next to the trigger (or `anchor`).
 * Labelled by `Popover.Title` and described by `Popover.Description` when
 * they are rendered and no `aria-label` / `aria-labelledby` is given.
 */
export function PopoverContent(props: PopoverContentProps): ReactNode {
  const ctx = usePopoverContext();
  const { children, className, style, ref, ...rest } = props;
  const root = ctx.props;
  const own = useRef<HTMLDivElement | null>(null);
  const wire: [string, string, boolean][] = [
    ['aria-labelledby', ctx.titleId, rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined],
    ['aria-describedby', ctx.descriptionId, rest['aria-describedby'] !== undefined],
  ];
  // Point aria-labelledby / -describedby at the parts actually rendered (no dangling ids, no re-render).
  useLayoutEffect(() => {
    const el = own.current;
    if (el) for (const [name, partId, given] of wire) if (!given) el.querySelector(`[id="${partId}"]`) ? el.setAttribute(name, partId) : el.removeAttribute(name);
  });
  const setRef = useMergedRef(own, ref);
  if (!ctx.open) return null;
  const { main, cross } = splitOffset(root.offset, 8);
  const anchor = root.anchor ?? ctx.triggerRef;
  return (
    <Overlay
      {...rest}
      ref={setRef}
      id={ctx.contentId}
      role="dialog"
      anchor={anchor}
      className={cx('salmon-popover', className)}
      style={style}
      data-arrow={root.arrow ? '' : undefined}
      placement={toPlacement(root.placement, 'bottom')}
      offset={main}
      crossOffset={cross}
      collisionBoundary={root.collisionBoundary}
      container={root.container}
      insideRefs={[ctx.triggerRef, anchor]}
      onDismiss={(reason, event) => ctx.setOpen(false, reason, event.type === 'pointerdown' ? 'pointer' : 'keyboard')}
      dismissOnOutsidePress={root.closeOnOutsidePress !== false}
      dismissOnEscape={root.closeOnEscape !== false}
      dismissOnFocusOutside={root.closeOnFocusOutside !== false}
      focus={{ autoFocus: root.initialFocus ?? 'first', tab: 'leave', restoreFocus: root.returnFocus !== false && ctx.triggerRef }}
    >
      {children}
      {root.arrow ? <span className="salmon-popover-arrow" aria-hidden="true" /> : null}
    </Overlay>
  );
}

export interface PopoverTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  readonly ref?: Ref<HTMLHeadingElement> | undefined;
}

/** Heading of the popover (`<h2>`); labels the content. */
export function PopoverTitle(props: PopoverTitleProps): ReactElement {
  const ctx = usePopoverContext();
  const { className, ...rest } = props;
  return <h2 id={ctx.titleId} {...rest} className={cx('salmon-popover-title', className)} />;
}

export interface PopoverDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  readonly ref?: Ref<HTMLParagraphElement> | undefined;
}

/** Description of the popover (`<p>`); describes the content. */
export function PopoverDescription(props: PopoverDescriptionProps): ReactElement {
  const ctx = usePopoverContext();
  const { className, ...rest } = props;
  return <p id={ctx.descriptionId} {...rest} className={cx('salmon-popover-description', className)} />;
}

export type PopoverCloseRenderProps = PopoverTriggerRenderProps;

export interface PopoverCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly render?: ((props: PopoverCloseRenderProps) => ReactElement) | undefined;
  readonly ref?: Ref<HTMLButtonElement> | undefined;
}

/** A button that closes the popover (`reason: 'close'`); `render` swaps the element. */
export function PopoverClose(props: PopoverCloseProps): ReactElement {
  const ctx = usePopoverContext();
  return popoverButton(ctx, props, 'close', {}, false, props.ref as Ref<HTMLButtonElement>);
}

Popover.Trigger = PopoverTrigger;
Popover.Content = PopoverContent;
Popover.Title = PopoverTitle;
Popover.Description = PopoverDescription;
Popover.Close = PopoverClose;
