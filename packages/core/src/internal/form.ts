// Form bridge:
// the owning form's `reset` listener and ref helpers shared by every component
// whose value takes part in a form. Hidden inputs are rendered by the
// components themselves (`<input type="hidden" name value>`).
import { useEffect, useRef, type RefObject } from 'react';

/** The form that owns `el`: its `form` property (honors the `form` attribute) or the closest `<form>`. */
export function formOf(el: Element | null | undefined): HTMLFormElement | null {
  if (!el) return null;
  const owner = (el as HTMLInputElement).form;
  return owner ?? el.closest('form');
}

/**
 * Calls `onReset` when the form that owns `ref.current` is reset. It runs in
 * the `reset` event, before native controls restore their defaults; read
 * native values in a microtask when needed.
 */
export function useFormReset(ref: RefObject<Element | null>, onReset: () => void): void {
  const latest = useRef(onReset);
  useEffect(() => {
    latest.current = onReset;
  });
  useEffect(() => {
    const form = formOf(ref.current);
    if (!form) return;
    const listener = (): void => latest.current();
    form.addEventListener('reset', listener);
    return () => form.removeEventListener('reset', listener);
  }, [ref]);
}

/** Sets a callback or object ref. */
export function assignRef<T>(ref: ((value: T | null) => unknown) | { current: T | null } | null | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
