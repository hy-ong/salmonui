// Private primitives of the rich text family: an APG Toolbar (roving
// tabindex), a modal Dialog (focus trap, Escape, labelled) and an anchored
// Popover. They are replaced by the shared Toolbar, Dialog and Popover when
// the Navigation and Layout categories ship them.
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from 'react';

const ITEM = '[data-salmon-toolbar-item]';

function items(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ITEM)].filter((el) => !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled);
}

function setStop(root: HTMLElement, target: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(ITEM)) el.tabIndex = el === target ? 0 : -1;
}

export interface ToolbarShellProps {
  readonly label: string;
  readonly controls?: string | undefined;
  readonly className: string;
  readonly onEscape?: (() => void) | undefined;
  readonly children: ReactNode;
  readonly ref?: Ref<HTMLDivElement> | undefined;
  readonly [data: `data-${string}`]: string | undefined;
}

/** APG Toolbar: one tab stop, arrows (mirrored in RTL), Home and End move between items, Escape returns to the editor. */
export function ToolbarShell(props: ToolbarShellProps): ReactElement {
  const { label, controls, className, onEscape, children, ref, ...data } = props;
  const own = useRef<HTMLDivElement | null>(null);
  // Keep exactly one enabled item in the tab order after every render.
  useLayoutEffect(() => {
    const root = own.current;
    if (!root) return;
    const list = items(root);
    if (!list.length) return;
    // Until the user roves, the first enabled item is the tab stop; afterwards keep exactly one.
    const stops = list.filter((el) => el.tabIndex === 0);
    if (!root.hasAttribute('data-roved')) setStop(root, list[0]!);
    else if (stops.length !== 1) setStop(root, stops[0] ?? list[0]!);
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = own.current;
    if (!root) return;
    if (event.key === 'Escape') {
      if (onEscape) {
        event.preventDefault();
        onEscape();
      }
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
    if (!target || target.closest('[role="menu"]')) return;
    const list = items(root);
    const at = list.indexOf(target);
    const rtl = getComputedStyle(root).direction === 'rtl';
    let next = -1;
    if (event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (at + 1) % list.length;
    else if (event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (at - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setStop(root, list[next]!);
    list[next]!.focus();
  };
  return (
    <div
      {...data}
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      role="toolbar"
      aria-label={label}
      aria-controls={controls}
      className={className}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
        if (!target || !own.current || target.closest('[role="menu"]')) return;
        own.current.setAttribute('data-roved', '');
        if (target.tabIndex !== 0) setStop(own.current, target);
      }}
    >
      {children}
    </div>
  );
}

/** Focuses the toolbar's current tab stop (Alt+F10 from the editor). */
export function focusToolbar(root: HTMLElement | null): boolean {
  if (!root) return false;
  const list = items(root);
  const target = list.find((el) => el.tabIndex === 0) ?? list[0];
  target?.focus();
  return Boolean(target);
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/** APG Dialog (modal): labelled by its title, focus moves in and is trapped, Escape closes. */
export function Dialog(props: DialogProps): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, []);
  return (
    <div className="salmon-rich-text__backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={props.className ? `salmon-rich-text__dialog ${props.className}` : 'salmon-rich-text__dialog'}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            props.onClose();
          } else if (event.key === 'Tab') {
            const list = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
            if (!list.length) return;
            const first = list[0]!;
            const last = list[list.length - 1]!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2 id={titleId} className="salmon-rich-text__dialog-title">
          {props.title}
        </h2>
        {props.children}
      </div>
    </div>
  );
}

export interface PopoverProps {
  /** Viewport rectangle to place under (or above when there is no room). */
  readonly anchor: () => { readonly left: number; readonly top: number; readonly bottom: number } | null;
  /** Subscribe to changes that move the anchor (the editor store). */
  readonly subscribe: (listener: () => void) => () => void;
  readonly className: string;
  readonly children: ReactNode;
  readonly placement?: 'below' | 'above';
  readonly [attr: `aria-${string}` | `data-${string}`]: string | undefined;
  readonly role?: string;
  readonly id?: string;
}

/** A fixed-position popup anchored to a caret or node; positioning writes styles, never state. */
export function Popover(props: PopoverProps): ReactElement {
  const { anchor, subscribe, className, children, placement = 'below', ...rest } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      const rect = anchor();
      if (!el) return;
      if (!rect) {
        el.style.visibility = 'hidden';
        return;
      }
      const { width, height } = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      let top = placement === 'above' ? rect.top - height - 6 : rect.bottom + 6;
      if (top + height > vh) top = rect.top - height - 6;
      if (top < 0) top = rect.bottom + 6;
      const left = Math.max(4, Math.min(rect.left, vw - width - 4));
      el.style.top = `${Math.round(top)}px`;
      el.style.left = `${Math.round(left)}px`;
      el.style.visibility = '';
    };
    place();
    const off = subscribe(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      off();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  });
  return (
    <div {...rest} ref={ref} className={className} style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}>
      {children}
    </div>
  );
}
