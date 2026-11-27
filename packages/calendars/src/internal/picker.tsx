'use client';

// Shared shell of the calendar pickers (DatePicker, DateRangePicker,
// TimePicker): open state with `popupMode`, the popup (top-layer
// popover anchored to the field, or a `<dialog>` bottom sheet), dismissal,
// the visually hidden form value input, the field shell (label,
// description, error message) and the client-only host time zone.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent as ReactFocusEvent, type HTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { pressSource } from '@salmonui/core/internal/press';

export type PopupMode = 'popover' | 'modal' | 'auto';
export type ChangeSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Second argument of `onOpenChange`. */
export interface PickerOpenChangeDetails {
  readonly source: ChangeSource;
  readonly reason: 'trigger' | 'keyboard' | 'focus' | 'escape' | 'outside' | 'tab' | 'select' | 'apply' | 'cancel' | 'api' | 'field';
}

/** The `ref` handle of every picker. */
export interface PickerHandle {
  /** The root element of the picker. */
  readonly element: HTMLDivElement | null;
  focus(options?: FocusOptions): void;
  blur(): void;
  open(): void;
  close(): void;
}

/** Source of a click or pointer event (`pressSource`), `'api'` without an event. */
export function sourceOf(event: { readonly detail?: number; readonly nativeEvent?: unknown } | null | undefined): ChangeSource {
  return event ? pressSource(event) : 'api';
}

const COARSE = '(pointer: coarse) and (max-width: 640px)';

/** `'auto'` resolves at open time, in an event handler or a layout effect, never in render. */
export function resolvePopupMode(mode: PopupMode | undefined, doc: Document | undefined): 'popover' | 'modal' {
  if (mode === 'popover' || mode === 'modal') return mode;
  const view = doc?.defaultView;
  return view?.matchMedia?.(COARSE).matches ? 'modal' : 'popover';
}

const noopSubscribe = (): (() => void) => () => {};
const hostZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};
const serverZone = (): string | null => null;

/**
 * The resolved time zone: the prop, else the host zone on the client only.
 * The server snapshot is `null` ("unresolved"), so instants defer to
 * hydration.
 */
export function useTimeZone(timeZone: string | undefined): string | null {
  const host = useSyncExternalStore(noopSubscribe, hostZone, serverZone);
  return timeZone ?? host;
}

export interface PickerOpenProps {
  readonly open?: boolean | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean, details: PickerOpenChangeDetails) => void) | undefined;
  readonly popupMode?: PopupMode | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
}

export interface PickerOpenState {
  readonly open: boolean;
  /** The resolved popup mode while open, `null` until resolved. */
  readonly mode: 'popover' | 'modal' | null;
  setOpen(open: boolean, details: PickerOpenChangeDetails): void;
}

/**
 * Open state: `open` / `defaultOpen` /
 * `onOpenChange`. `defaultOpen` and a controlled `open` take effect after
 * hydration, so the server never renders a popup. A controlled component
 * vetoes a change by not updating `open` (there is no `onBefore*`).
 */
export function usePickerOpen(props: PickerOpenProps, rootRef: RefObject<HTMLElement | null>): PickerOpenState {
  const hydrated = useHydrated();
  const [inner, setInner] = useState<boolean | null>(null);
  const [resolved, setResolved] = useState<'popover' | 'modal' | null>(null);
  const controlled = props.open !== undefined;
  const open = hydrated && !props.disabled && !props.readOnly && (controlled ? Boolean(props.open) : (inner ?? Boolean(props.defaultOpen)));
  const fixed = props.popupMode === 'popover' || props.popupMode === 'modal' ? props.popupMode : null;
  const mode = open ? (fixed ?? resolved) : null;
  // An `open` that did not come from an event handler (controlled prop,
  // `defaultOpen`) resolves 'auto' before paint.
  useLayoutEffect(() => {
    if (open && mode === null) setResolved(resolvePopupMode(props.popupMode, rootRef.current?.ownerDocument));
  }, [open, mode, props.popupMode, rootRef]);
  const setOpen = (next: boolean, details: PickerOpenChangeDetails): void => {
    if (next === open) return;
    if (next && (props.disabled || props.readOnly)) return;
    if (next && !fixed) setResolved(resolvePopupMode(props.popupMode, rootRef.current?.ownerDocument));
    if (!controlled) setInner(next);
    props.onOpenChange?.(next, details);
  };
  return { open, mode, setOpen };
}

export interface FormValueProps {
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly value: string;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** Custom validity message ('' when valid). */
  readonly validity: string;
  readonly onInvalid?: (() => void) | undefined;
  /** The owning form was reset. */
  readonly onReset?: (() => void) | undefined;
}

const noop = (): void => {};

/**
 * The form value input: visually hidden,
 * not `type="hidden"`, so `required` and `setCustomValidity()` take part in
 * constraint validation. Rendered only with `name` or `required`.
 */
export function FormValue(props: FormValueProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const { validity, onReset, onInvalid } = props;
  const reset = useRef(onReset);
  useLayoutEffect(() => {
    reset.current = onReset;
  });
  useEffect(() => {
    ref.current?.setCustomValidity(validity);
  }, [validity]);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const handler = (): void => reset.current?.();
    form.addEventListener('reset', handler);
    return () => form.removeEventListener('reset', handler);
  }, [props.form]);
  return (
    <input
      ref={ref}
      className="salmon-picker__form-value"
      tabIndex={-1}
      aria-hidden="true"
      name={props.name}
      form={props.form}
      value={props.value}
      required={props.required}
      disabled={props.disabled}
      onChange={noop}
      onInvalid={(e) => {
        e.preventDefault();
        onInvalid?.();
      }}
    />
  );
}

/** Focuses the first spinbutton (or focusable) inside `root`. */
export function focusFirst(root: HTMLElement | null | undefined, options?: FocusOptions): void {
  const target = root?.querySelector<HTMLElement>('[role="spinbutton"]:not([aria-disabled="true"]), button:not([disabled])');
  target?.focus(options);
}

/** Merges `ref` props of a function or object form. */
export function assignRef<T>(ref: ((v: T) => void) | { current: T } | null | undefined, value: T): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/** DOM props of the field group that the pickers pass through. */
export type PickerDomProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange' | 'onFocus' | 'onBlur' | 'onInvalid' | 'onSelect' | 'placeholder' | 'className' | 'style' | 'id' | 'children' | 'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'defaultChecked' | 'color' | 'content'
> & { readonly [data: `data-${string}`]: unknown };

const HANDLED = new Set(['aria-label', 'aria-labelledby', 'aria-describedby']);

/**
 * The remaining DOM props of a picker: `data-*`, `aria-*` (except the ones
 * the picker wires), `title`, `lang`, `translate` and DOM event handlers
 * (`on` + a capital letter, excluding the picker's own callbacks).
 */
export function domRest(props: object, own: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (HANDLED.has(key) || own.has(key)) continue;
    if (key.startsWith('data-') || key.startsWith('aria-') || key === 'title' || key === 'lang' || key === 'translate' || /^on[A-Z]/.test(key)) out[key] = value;
  }
  return out;
}

/** Callbacks of the pickers that are not DOM handlers. */
export const PICKER_CALLBACKS: ReadonlySet<string> = new Set(['onValueChange', 'onOpenChange', 'onClear', 'onFocus', 'onBlur', 'onInvalid', 'onRangeSelect', 'onViewChange', 'onFocusedValueChange']);

/** Common field props of the pickers. */
export interface PickerFieldProps extends PickerOpenProps, PickerDomProps {
  /** Opens the popup when focus enters the field. */
  readonly openOnFocus?: boolean | undefined;
  /** `false` makes the segments read-only; a click on the field opens the popup. */
  readonly editable?: boolean | undefined;
  /** Renders a clear button. */
  readonly clearable?: boolean | undefined;
  readonly onClear?: (() => void) | undefined;
  /** Out-of-range values move to the nearest bound and disabled or unparsable input reverts on blur. */
  readonly strict?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly label?: ReactNode | undefined;
  readonly description?: ReactNode | undefined;
  readonly errorMessage?: ReactNode | undefined;
  /** Watermark shown while empty and not focused. */
  readonly placeholder?: string | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly autoFocus?: boolean | undefined;
  /** Focus entered the field group (once). */
  readonly onFocus?: ((event: ReactFocusEvent) => void) | undefined;
  /** Focus left the field group and its popup (once). */
  readonly onBlur?: ((event: ReactFocusEvent) => void) | undefined;
  /** The form value input failed constraint validation. */
  readonly onInvalid?: (() => void) | undefined;
  /** BCP 47 locale; default `'en-US'`. */
  readonly locale?: string | undefined;
  /** IANA time zone for instant values (`Date`, ISO with an offset). */
  readonly timeZone?: string | undefined;
  readonly hourCycle?: 'h12' | 'h23' | undefined;
  /** Control size: `'sm'` 24px, `'md'` 32px (default), `'lg'` 40px tall. */
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  readonly 'aria-describedby'?: string | undefined;
}

export { formatText, type PickerMessage } from './text.js';

/**
 * A lazy popup module: requested when the
 * browser is idle after mount, so the first open does not wait on the
 * network, and at once when the popup opens before that. Never on the
 * server. `load` must be a stable module-level `() => import(...)`.
 */
export function useLazyModule<T>(load: () => Promise<T>, open: boolean): T | null {
  const [module, setModule] = useState<T | null>(null);
  useEffect(() => {
    if (module) return;
    let live = true;
    // `import()` is cached by the module loader, so a repeated request (StrictMode effects) is free.
    const fetch = (): void => void load().then((m) => live && setModule(() => m));
    if (open) {
      fetch();
      return () => {
        live = false;
      };
    }
    const win = globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = win.requestIdleCallback ? win.requestIdleCallback(fetch, { timeout: 2000 }) : setTimeout(fetch, 200);
    return () => {
      live = false;
      if (win.requestIdleCallback) win.cancelIdleCallback?.(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, [load, open, module]);
  return module;
}

/** `props` without its `undefined` entries (component props typed without `| undefined`, `exactOptionalPropertyTypes`). */
export function defined<T extends object>(props: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** The picker reason for a segmented field change (`'blur'` is the field's `strict` correction). */
export const fieldReason = (d: { readonly reason: string }): 'input' | 'strict' => (d.reason === 'blur' ? 'strict' : 'input');

export const cx =(...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(' ');
