'use client';

// Dialog core (APG Dialog (Modal), modeless
// dialogs follow the non-modal guidance), shared by the dialog family
// (Dialog, AlertDialog) and the drawer family. Built on the internal dialog host:
// a native <dialog> opened with showModal() / show(). A closed dialog
// renders nothing (unless `keepMounted`); drag and resize are a lazy chunk
// (`./drag.js`) loaded the first time `draggable` or `resizable` is true.

import {
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type DialogHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useDialogHost } from '../dialog-host.js';
import { pressSource, type PressSource } from '../press.js';
import type { DragController, DragOptions } from './drag.js';

export type DialogOpenChangeReason = 'trigger' | 'close' | 'closeButton' | 'escape' | 'outside' | 'submit' | 'confirm' | 'cancel' | 'api';

/** Second argument of `onOpenChange`. `preventDefault()` keeps an uncontrolled dialog as it is. */
export interface DialogOpenChangeEvent {
  readonly reason: DialogOpenChangeReason;
  readonly source: PressSource | 'api';
  /** The `<form method="dialog">` submitter's value (`reason: 'submit'`). */
  readonly returnValue?: string | undefined;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Logical resize edges. */
export type DialogResizeEdge = 'top' | 'bottom' | 'start' | 'end' | 'topStart' | 'topEnd' | 'bottomStart' | 'bottomEnd';

/** A dialog offset from its placement: `x` along the inline axis (mirrored in RTL), `y` down. */
export interface DialogPosition {
  readonly x: number;
  readonly y: number;
}

export interface DialogSize {
  readonly width: number;
  readonly height: number;
}

export interface DialogLocaleText {
  /** Close button label. Default `"Close"`. */
  readonly close?: string | undefined;
  /** Live-region announcements of keyboard moves and resizes. */
  readonly moved?: ((position: DialogPosition) => string) | undefined;
  readonly resized?: ((size: DialogSize) => string) | undefined;
  /** Accessible label of the resize handles. Default `"Resize"`. */
  readonly resize?: string | undefined;
  /** Accessible label of the handle on one edge or corner. Default `resize` and the edge in words: `"Resize (bottom end)"`. */
  readonly resizeEdge?: ((edge: DialogResizeEdge) => string) | undefined;
}

export type DialogPart = 'closeButton';

export interface DialogProps extends Omit<DialogHTMLAttributes<HTMLDialogElement>, 'open' | 'title' | 'onCancel' | 'onClose'> {
  /** Content parts: `Dialog.Title`, `Dialog.Description`, `Dialog.Body`, `Dialog.Footer`, `Dialog.Close`. */
  readonly children?: ReactNode;
  /** Rendered before the dialog with the dialog's context: usually a `Dialog.Trigger`. */
  readonly trigger?: ReactNode;
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean, event: DialogOpenChangeEvent) => void) | undefined;
  readonly onAfterOpen?: (() => void) | undefined;
  readonly onAfterClose?: (() => void) | undefined;
  /** showModal() (default) or show() (modeless: no backdrop, no focus containment). */
  readonly modal?: boolean | undefined;
  /** Escape and backdrop dismissal. `true` = both, `false` = none. Default `{ escape: true, outside: false }`. */
  readonly dismissible?: boolean | { readonly escape?: boolean | undefined; readonly outside?: boolean | undefined } | undefined;
  /** Press on the backdrop of a modal dialog. */
  readonly onOverlayPress?: ((event: PointerEvent) => void) | undefined;
  /** A close button in the corner (label `localeText.close`). Default false. */
  readonly closeButton?: boolean | undefined;
  /** Shorthand for a `Dialog.Title` at the top. */
  readonly title?: ReactNode;
  /** Element focused on open (else `[data-autofocus]`, else the first focusable); `false` keeps the platform default. */
  readonly initialFocus?: RefObject<HTMLElement | null> | false | undefined;
  /** Return focus to the invoker on close. Default true. */
  readonly returnFocus?: boolean | undefined;
  /** Modeless only: render the dialog inside this element (positioned in it) instead of in place. Mounted after hydration. */
  readonly container?: Element | null | undefined;
  /** Render the closed `<dialog>` too (content in the server HTML). */
  readonly keepMounted?: boolean | undefined;
  /** `'center'` (default) or `'top'`. */
  readonly placement?: 'center' | 'top' | undefined;
  readonly position?: DialogPosition | undefined;
  readonly defaultPosition?: DialogPosition | undefined;
  readonly onPositionChange?: ((position: DialogPosition) => void) | undefined;
  readonly width?: number | string | undefined;
  readonly height?: number | string | undefined;
  readonly minHeight?: number | string | undefined;
  /** Fill the viewport, or only below the mobile width (640 px). */
  readonly fullScreen?: boolean | 'mobile' | undefined;
  /** Drag by `dragHandle` (default the title); lazy chunk. */
  readonly draggable?: boolean | undefined;
  /** CSS selector of the drag handle inside the dialog. Default `.salmon-dialog-title`. */
  readonly dragHandle?: string | undefined;
  readonly onMoveStart?: (() => void) | undefined;
  /** Per animation frame during a drag; not for React state. */
  readonly onMove?: ((position: DialogPosition) => void) | undefined;
  readonly onMoveEnd?: ((position: DialogPosition) => void) | undefined;
  /** Resize from `['bottomEnd']` (`true`) or the given edges; lazy chunk. */
  readonly resizable?: boolean | readonly DialogResizeEdge[] | undefined;
  readonly onResizeStart?: (() => void) | undefined;
  readonly onResize?: ((size: DialogSize) => void) | undefined;
  readonly onResizeEnd?: ((size: DialogSize) => void) | undefined;
  readonly localeText?: DialogLocaleText | undefined;
  readonly classNames?: Partial<Record<DialogPart, string>> | undefined;
  readonly styles?: Partial<Record<DialogPart, CSSProperties>> | undefined;
  /** The `<dialog>` element. */
  readonly ref?: Ref<HTMLDialogElement> | undefined;
}

interface DialogContextValue {
  readonly open: boolean;
  readonly request: (open: boolean, reason: DialogOpenChangeReason, source: PressSource | 'api', returnValue?: string) => void;
  readonly id: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);
const useDialogContext = (): DialogContextValue => use(DialogContext) as DialogContextValue;

const cx = (...parts: (string | false | undefined)[]): string => parts.filter(Boolean).join(' ');
const NON_DOM = 'loadDrag container trigger defaultOpen onOpenChange onAfterOpen onAfterClose onOverlayPress initialFocus returnFocus keepMounted onPositionChange draggable dragHandle onMoveStart onMove onMoveEnd resizable onResizeStart onResize onResizeEnd'.split(' ');
const noopSubscribe = (): (() => void) => () => {};
const isClient = (): boolean => true;
const isServer = (): boolean => false;
export const css = (v: number | string | undefined): string | undefined => (typeof v === 'number' ? `${v}px` : v);

/** @internal The open triad with a cancellable request (`preventDefault()` when uncontrolled). */
export function useOpenRequest(props: Pick<DialogProps, 'open' | 'defaultOpen' | 'onOpenChange'>): [boolean, DialogContextValue['request']] {
  const [inner, setInner] = useState(props.defaultOpen ?? false);
  const controlled = props.open !== undefined;
  const open = controlled ? (props.open as boolean) : inner;
  const latest = useRef({ props, controlled, open });
  useLayoutEffect(() => {
    latest.current = { props, controlled, open };
  });
  const request: DialogContextValue['request'] = (next, reason, source, returnValue) => {
    const l = latest.current;
    if (next === l.open) return;
    let prevented = false;
    const event: DialogOpenChangeEvent = {
      reason,
      source,
      returnValue,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    };
    l.props.onOpenChange?.(next, event);
    if (!l.controlled && !prevented) setInner(next);
  };
  return [open, request];
}

/** The dot-form parts of `Dialog` and `Drawer`. */
export interface DialogParts {
  Trigger: typeof DialogTrigger;
  Close: typeof DialogClose;
  Title: typeof DialogTitle;
  Description: typeof DialogDescription;
  Body: typeof DialogBody;
  Footer: typeof DialogFooter;
}

/** @internal */
export interface RootProps extends DialogProps {
  readonly kind: 'dialog' | 'drawer' | 'alert';
  readonly side?: string | undefined;
  /** Loads the drag and resize chunk; only `Dialog` and `AlertDialog` pass it, so `/drawer` never bundles the chunk. */
  readonly loadDrag?: (() => Promise<typeof import('./drag.js')>) | undefined;
}

/**
 * @internal Shared by Dialog, Drawer and AlertDialog. `localeText` is used as
 * given: those three resolve it over the LocaleProvider's `dialog` family, so
 * a caller without a close button or drag (the sidebar overlay) never loads
 * the locale module into its lazy chunk.
 */
export function DialogRoot(props: RootProps): ReactElement {
  const [open, request] = useOpenRequest(props);
  const id = useId();
  const contained = props.modal === false && props.container ? props.container : null;
  // Hydration gate for `container` (inline: sharing internal/hydrated.js with a lazy importer splits it into its own chunk).
  const hydrated = useSyncExternalStore(noopSubscribe, isClient, isServer);
  const portal = (node: ReactElement): ReactNode => (contained ? createPortal(node, contained) : node);
  // onAfterClose: after a real close (the surface may unmount with it).
  const was = useRef(open);
  useEffect(() => {
    if (was.current && !open) props.onAfterClose?.();
    was.current = open;
  });
  const value: DialogContextValue = { open, request, id };
  return (
    <DialogContext value={value}>
      {props.trigger}
      {(open || props.keepMounted) && (!contained || hydrated) ? portal(<DialogSurface {...props} open={open} request={request} id={id} />) : null}
    </DialogContext>
  );
}

const CLOSE_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

function DialogSurface(props: RootProps & { readonly open: boolean; readonly request: DialogContextValue['request']; readonly id: string }): ReactElement {
  const { kind, side, open, request, id, children, modal = true, dismissible, closeButton, title, placement = 'center', position, defaultPosition, width, height, minHeight, fullScreen, localeText, classNames, styles, className, style, ref, ...rest } = props;
  // The other props are behavior, not DOM attributes.
  for (const key of NON_DOM) delete (rest as Record<string, unknown>)[key];
  const own = useRef<HTMLDialogElement | null>(null);
  const d = dismissible === undefined ? { escape: true, outside: false } : typeof dismissible === 'boolean' ? { escape: dismissible, outside: dismissible } : dismissible;
  useDialogHost(own, {
    open,
    modal,
    escape: d.escape !== false,
    outside: d.outside === true,
    onOverlayPress: props.onOverlayPress,
    initialFocus: props.initialFocus,
    returnFocus: props.returnFocus,
    onAfterOpen: props.onAfterOpen,
    onRequestClose: (reason, event, returnValue) => request(false, reason, event.type === 'keydown' || event.type === 'cancel' ? 'keyboard' : event.type === 'submit' ? 'api' : 'pointer', returnValue),
  });
  // A modeless dialog that starts open is visible without JavaScript.
  const [ssrOpen] = useState(() => open && !modal);
  // Position: controlled, or uncontrolled updated when a drag ends.
  const [innerPos, setInnerPos] = useState<DialogPosition | undefined>(defaultPosition);
  const pos = position ?? innerPos;
  // Labelled / described by the parts actually rendered (no dangling ids).
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const labelled = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    if (!labelled) el.querySelector(`[id="${titleId}"]`) ? el.setAttribute('aria-labelledby', titleId) : el.removeAttribute('aria-labelledby');
    if (rest['aria-describedby'] === undefined) el.querySelector(`[id="${descriptionId}"]`) ? el.setAttribute('aria-describedby', descriptionId) : el.removeAttribute('aria-describedby');
  });
  // Drag and resize: the lazy chunk, loaded the first time it is needed.
  const loader = props.loadDrag;
  // `resizable`: true or an edge list (an empty list still loads the chunk).
  const dragOn = loader !== undefined && (props.draggable === true || !!props.resizable);
  const dragOptions: DragOptions = {
    props,
    position: pos ?? { x: 0, y: 0 },
    commit: (p) => {
      if (position === undefined) setInnerPos(p);
      props.onPositionChange?.(p);
      props.onMoveEnd?.(p);
    },
  };
  const controller = useRef<DragController | null>(null);
  useLayoutEffect(() => {
    controller.current?.update(dragOptions);
  });
  useEffect(() => {
    const el = own.current;
    if (!dragOn || !el) return;
    let live = true;
    void (loader as NonNullable<typeof loader>)().then((m) => {
      if (live) controller.current = m.attachDrag(el, dragOptions);
    });
    return () => {
      live = false;
      controller.current?.destroy();
      controller.current = null;
    };
    // dragOptions reach the controller through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragOn]);
  return (
    <dialog
      role={kind === 'alert' ? 'alertdialog' : undefined}
      {...rest}
      open={ssrOpen || undefined}
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as { current: HTMLDialogElement | null }).current = el;
      }}
      className={cx(kind === 'drawer' && 'salmon-drawer', 'salmon-dialog', className)}
      data-kind={kind}
      data-side={side}
      data-placement={kind === 'drawer' ? undefined : placement}
      data-modal={modal ? '' : undefined}
      data-contained={!modal && props.container ? '' : undefined}
      data-full-screen={fullScreen === true ? 'always' : fullScreen || undefined}
      style={{
        width: css(width),
        height: css(height),
        minHeight: css(minHeight),
        ...(pos ? { '--salmon-dialog-x': `${pos.x}px`, '--salmon-dialog-y': `${pos.y}px` } : null),
        ...style,
      }}
    >
      {closeButton ? (
        <button
          type="button"
          className={cx('salmon-dialog-close-button', classNames?.closeButton)}
          style={styles?.closeButton}
          aria-label={localeText?.close ?? 'Close'}
          onClick={(e) => request(false, 'closeButton', pressSource(e))}
        >
          {CLOSE_ICON}
        </button>
      ) : null}
      {title === undefined ? null : <DialogTitle>{title}</DialogTitle>}
      {children}
    </dialog>
  );
}

/** Props the trigger computes for its element (spread them in `render`). */
export type DialogTriggerRenderProps = ButtonHTMLAttributes<HTMLButtonElement> & { readonly ref?: Ref<HTMLButtonElement> | undefined };

export interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly render?: ((props: DialogTriggerRenderProps) => ReactElement) | undefined;
  readonly ref?: Ref<HTMLButtonElement> | undefined;
}

function dialogButton(props: DialogTriggerProps, base: string, extra: object, onPress: (event: MouseEvent<HTMLButtonElement>) => void): ReactElement {
  const { render, onClick, className, type, ...rest } = props;
  const computed: DialogTriggerRenderProps = {
    ...rest,
    ...extra,
    type: type ?? 'button',
    className: cx(base, className),
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) onPress(event);
    },
  };
  return render ? render(computed) : <button {...computed} />;
}

/** Opens the dialog (`aria-haspopup="dialog"`, `aria-expanded`); `render` swaps the element. Use it in `trigger`. */
export function DialogTrigger(props: DialogTriggerProps): ReactElement {
  const ctx = useDialogContext();
  return dialogButton(props, 'salmon-dialog-trigger', { 'aria-haspopup': 'dialog', 'aria-expanded': ctx.open }, (e) => ctx.request(!ctx.open, 'trigger', pressSource(e)));
}

/** Closes the dialog (`reason: 'close'`); `render` swaps the element. */
export function DialogClose(props: DialogTriggerProps): ReactElement {
  const ctx = useDialogContext();
  return dialogButton(props, 'salmon-dialog-close', {}, (e) => ctx.request(false, 'close', pressSource(e)));
}

/** Heading (`<h2 class="salmon-dialog-title">`); labels the dialog and is the default drag handle. */
export function DialogTitle(props: HTMLAttributes<HTMLHeadingElement>): ReactElement {
  const ctx = useDialogContext();
  return <h2 id={`${ctx.id}-title`} {...props} className={cx('salmon-dialog-title', props.className)} />;
}

/** Description (`<p class="salmon-dialog-description">`); describes the dialog. */
export function DialogDescription(props: HTMLAttributes<HTMLParagraphElement>): ReactElement {
  const ctx = useDialogContext();
  return <p id={`${ctx.id}-description`} {...props} className={cx('salmon-dialog-description', props.className)} />;
}

/** Scrolling content region (`.salmon-dialog-body`). */
export function DialogBody(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div {...props} className={cx('salmon-dialog-body', props.className)} />;
}

/** Action row (`.salmon-dialog-footer`). */
export function DialogFooter(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div {...props} className={cx('salmon-dialog-footer', props.className)} />;
}

/** @internal The dot-form parts, shared with `Drawer`. */
export const PARTS = { Trigger: DialogTrigger, Close: DialogClose, Title: DialogTitle, Description: DialogDescription, Body: DialogBody, Footer: DialogFooter };
