// Controllable state:
// one hook implements every `x` / `defaultX` / `onXChange` triad.

import { useLayoutEffect, useRef, useState } from 'react';
import { DEV, warnOnce } from './dev.js';

/**
 * The value is controlled when `value !== undefined`. Returns the current
 * value and a setter that proposes a change: it calls `onChange(next,
 * ...args)` when `next` differs (`Object.is`) from the current value, and
 * stores it only when uncontrolled. `defaultValue` is read once at mount.
 * Switching between controlled and uncontrolled after mount logs a
 * development warning naming `name` (`'Button pressed'`).
 */
export function useControllableState<T, A extends readonly unknown[] = []>(
  value: T | undefined,
  defaultValue: T | (() => T),
  onChange: ((value: T, ...args: A) => void) | undefined,
  name = 'value',
): readonly [T, (next: T | ((previous: T) => T), ...args: A) => void] {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<T>(defaultValue);
  const current = controlled ? value : inner;
  // The setter reads the committed value, so two proposals in one event chain compose.
  const latest = useRef({ current, controlled, onChange });
  useLayoutEffect(() => {
    // Development only: production folds the check away (no ref, no effect).
    if (DEV && latest.current.controlled !== controlled) {
      warnOnce(
        `controllable:${name}:${controlled}`,
        `A component is changing ${name} from ${latest.current.controlled ? 'controlled' : 'uncontrolled'} to ${controlled ? 'controlled' : 'uncontrolled'}. Decide between a controlled (${name} given) and an uncontrolled value for the component's lifetime.`,
      );
    }
    latest.current = { current, controlled, onChange };
  });
  const setValue = (next: T | ((previous: T) => T), ...args: A): void => {
    const l = latest.current;
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(l.current) : next;
    if (Object.is(resolved, l.current)) return;
    if (!l.controlled) {
      // A vetoed controlled proposal leaves the value as it was; uncontrolled ones compose.
      l.current = resolved;
      setInner(resolved);
    }
    l.onChange?.(resolved, ...args);
  };
  return [current, setValue] as const;
}
