'use client';

import { use, useCallback, useEffect, useRef, type MouseEvent, type ReactElement } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { Button, type ButtonAccessibleName, type ButtonBaseProps, type ButtonProps } from './Button.js';
import { compose } from './context.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { pressSource } from '@salmonui/core/internal/press';
import type { ChangeEvent, ChangeSource } from './context.js';
import { assignRef, useFormReset } from './form.js';
import { ToggleGroupContext } from './toggle-context.js';

/** Event of `onPressedChange` and `onValueChange`: `reason` is `'toggle'` or `'reset'` (form reset). */
export type ToggleChangeEvent = ChangeEvent<'toggle' | 'reset'>;

export interface ToggleButtonBaseProps extends Omit<ButtonBaseProps, 'value' | 'name'> {
  /** Controlled pressed state. Ignored inside a `ToggleButtonGroup`. */
  pressed?: boolean | undefined;
  /** Initial pressed state when uncontrolled; restored on form reset. Default `false`. */
  defaultPressed?: boolean | undefined;
  /** Proposed pressed state; called for controlled and uncontrolled buttons. */
  onPressedChange?: ((pressed: boolean, event: ToggleChangeEvent) => void) | undefined;
  /**
   * The item's value inside a `ToggleButtonGroup` (required there), and the
   * submitted value of a standalone button with `name` (default `"on"`).
   */
  value?: string | undefined;
  /** Standalone form field name: a hidden input carries `value` while pressed. */
  name?: string | undefined;
}

export type ToggleButtonProps = ToggleButtonBaseProps & ({ iconOnly?: false | undefined } | ({ iconOnly: true } & ButtonAccessibleName));

/** Change source of a click: `detail === 0` is a keyboard (or programmatic) click. */
export function clickSource(event: MouseEvent): ChangeSource {
  return pressSource(event);
}

/**
 * Toggle button (APG Button, toggle variant): `aria-pressed`, `data-pressed`.
 * Inside a `ToggleButtonGroup` it is an item of that group: a radio
 * (`role="radio"`, `aria-checked`) in single mode, a toggle button
 * (`aria-pressed`) in multiple mode, with a roving tabindex.
 */
export function ToggleButton(props: ToggleButtonProps): ReactElement {
  const group = use(ToggleGroupContext);
  const { pressed, defaultPressed = false, onPressedChange, value, name, onClick, onFocus, ref, ...rest } = props;
  const [isPressed, propose] = useControllableState<boolean, [ToggleChangeEvent]>(pressed, defaultPressed, onPressedChange, 'ToggleButton pressed');
  const setPressed = (next: boolean, source: ChangeSource, reason: ToggleChangeEvent['reason']) => propose(next, Object.freeze({ source, reason }));
  const node = useRef<HTMLButtonElement | null>(null);
  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      node.current = el;
      assignRef<HTMLButtonElement>(ref as never, el);
    },
    [ref],
  );
  useFormReset(node, () => {
    if (!group && isPressed !== defaultPressed) setPressed(defaultPressed, 'api', 'reset');
  });
  useEffect(() => {
    if (DEV && group && value === undefined) warnOnce('toggle-button-value', 'ToggleButton: an item of a ToggleButtonGroup needs a value.');
  }, [group, value]);

  if (group) {
    const item = value ?? '';
    const on = group.isSelected(item);
    const single = group.mode === 'single';
    return (
      <Button
        {...(rest as ButtonProps)}
        ref={setRef}
        role={single ? 'radio' : undefined}
        aria-checked={single ? on : undefined}
        aria-pressed={single ? undefined : on}
        data-pressed={on ? '' : undefined}
        data-value={item}
        data-salmon-toggle-item=""
        tabIndex={group.tabStop === item ? 0 : -1}
        onFocus={compose(onFocus, () => group.focused(item))}
        onClick={compose(onClick, (event) => group.toggle(item, clickSource(event)))}
      />
    );
  }
  const disabled = rest.disabled;
  return (
    <>
      <Button
        {...(rest as ButtonProps)}
        ref={setRef}
        aria-pressed={isPressed}
        data-pressed={isPressed ? '' : undefined}
        onFocus={onFocus}
        onClick={compose(onClick, (event) => setPressed(!isPressed, clickSource(event), 'toggle'))}
      />
      {name && isPressed && !disabled ? <input type="hidden" name={name} value={value ?? 'on'} /> : null}
    </>
  );
}
