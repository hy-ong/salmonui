'use client';

import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';
import { ButtonGroupContext, compose, type ButtonSize, type ButtonTone, type ButtonVariant, type ChangeSource } from './context.js';
import { assignRef, useFormReset } from './form.js';
import { ToggleGroupContext, type ToggleGroupState } from './toggle-context.js';
import type { ToggleChangeEvent } from './ToggleButton.js';

export interface ToggleButtonGroupBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  /** `ToggleButton` items, each with a `value`. */
  children?: ReactNode;
  /** Layout and arrow-key axis. Default `'horizontal'`. */
  orientation?: 'horizontal' | 'vertical' | undefined;
  /** Joined borders. Default `true`, `false` for `variant="chip"`. */
  attached?: boolean | undefined;
  /** Default `variant` of the items; `'chip'` gives choice and filter chips. */
  variant?: ButtonVariant | undefined;
  /** Default `tone` of the items. */
  tone?: ButtonTone | undefined;
  /** Default `size` of the items. */
  size?: ButtonSize | undefined;
  /** Disables every item; nothing is submitted while disabled. */
  disabled?: boolean | undefined;
  /** Keeps one value selected (single) or at least one (multiple). Default `false`. */
  disallowEmpty?: boolean | undefined;
  /** Form field name: one hidden input per selected value. */
  name?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

export interface ToggleButtonGroupSingleProps extends ToggleButtonGroupBaseProps {
  /** APG Radio Group: `role="radiogroup"`, items `role="radio"`; arrow keys move and select. */
  selectionMode?: 'single' | undefined;
  value?: string | null | undefined;
  defaultValue?: string | null | undefined;
  onValueChange?: ((value: string | null, event: ToggleChangeEvent) => void) | undefined;
}

export interface ToggleButtonGroupMultipleProps extends ToggleButtonGroupBaseProps {
  /** A group of toggle buttons: `role="group"`, items `aria-pressed`; arrow keys move focus. */
  selectionMode: 'multiple';
  value?: readonly string[] | undefined;
  defaultValue?: readonly string[] | undefined;
  onValueChange?: ((value: readonly string[], event: ToggleChangeEvent) => void) | undefined;
}

export type ToggleButtonGroupProps = ToggleButtonGroupSingleProps | ToggleButtonGroupMultipleProps;

type Value = string | null | readonly string[];
const NONE: readonly string[] = Object.freeze([]);
const ITEM = '[data-salmon-toggle-item]';

function itemsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ITEM)].filter((el) => el.closest('.salmon-toggle-button-group') === root);
}

/**
 * A selection group of `ToggleButton`s with one tab stop (roving tabindex;
 * arrow keys, Home / End, mirrored in RTL). `.salmon-toggle-button-group`
 * with `data-selection-mode`, `data-orientation`, `data-attached`.
 */
export function ToggleButtonGroup(props: ToggleButtonGroupProps): ReactElement {
  const {
    children,
    selectionMode,
    value,
    defaultValue,
    onValueChange,
    orientation = 'horizontal',
    variant,
    attached = variant !== 'chip',
    tone,
    size,
    disabled = false,
    disallowEmpty = false,
    name,
    className,
    onKeyDown,
    ref,
    ...rest
  } = props;
  const multiple = selectionMode === 'multiple';
  const [current, propose] = useControllableState<Value, [ToggleChangeEvent]>(
    value,
    defaultValue ?? (multiple ? NONE : null),
    onValueChange as ((value: Value, event: ToggleChangeEvent) => void) | undefined,
    'ToggleButtonGroup value',
  );
  const set = (next: Value, source: ChangeSource, reason: ToggleChangeEvent['reason']) => propose(next, Object.freeze({ source, reason }));
  const selected: readonly string[] = multiple ? ((current as readonly string[] | null) ?? NONE) : current == null ? NONE : [current as string];
  const [focusValue, setFocusValue] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      assignRef<HTMLDivElement>(ref as never, el);
    },
    [ref],
  );
  const initial = defaultValue ?? (multiple ? NONE : null);
  useFormReset(root, () => set(initial, 'api', 'reset'));
  // One tab stop: the focused item, else the (first) selected item, else the
  // first enabled item, found in the DOM after commit (no children traversal).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = itemsOf(el);
    if (items.some((item) => item.tabIndex === 0 && !(item as HTMLButtonElement).disabled)) return;
    const first = items.find((item) => !(item as HTMLButtonElement).disabled)?.dataset['value'];
    if (first !== undefined && first !== focusValue) setFocusValue(first);
  });

  const toggle = (item: string, source: ChangeSource) => {
    const on = selected.includes(item);
    if (multiple) {
      if (on && disallowEmpty && selected.length === 1) return;
      set(on ? selected.filter((v) => v !== item) : [...selected, item], source, 'toggle');
    } else if (!on) set(item, source, 'toggle');
    else if (!disallowEmpty) set(null, source, 'toggle');
  };
  const state: ToggleGroupState = {
    mode: multiple ? 'multiple' : 'single',
    disabled,
    tabStop: focusValue ?? selected[0] ?? null,
    isSelected: (item) => selected.includes(item),
    toggle,
    focused: setFocusValue,
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const el = root.current;
    if (!el || !target.matches(ITEM)) return;
    const move = rovingMove(event.key, { orientation: 'both', rtl: getComputedStyle(target).direction === 'rtl' });
    if (!move) return;
    const items = itemsOf(el);
    const enabled = (i: number) => !(items[i] as HTMLButtonElement).disabled;
    const next = items[applyRovingMove(move, items.length, items.indexOf(target), enabled)];
    if (!next || next === target) return;
    event.preventDefault();
    next.focus();
    const item = next.dataset['value'];
    // Radio group: moving selects (APG Radio Group).
    if (!multiple && item !== undefined && !selected.includes(item)) toggle(item, 'keyboard');
  };

  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-orientation={multiple ? undefined : orientation}
      {...rest}
      ref={setRef}
      className={className ? `salmon-toggle-button-group ${className}` : 'salmon-toggle-button-group'}
      data-selection-mode={multiple ? 'multiple' : 'single'}
      data-orientation={orientation}
      data-attached={attached ? '' : undefined}
      onKeyDown={compose(onKeyDown, handleKeyDown)}
    >
      <ButtonGroupContext value={{ variant, tone, size, disabled: disabled || undefined }}>
        <ToggleGroupContext value={state}>{children}</ToggleGroupContext>
      </ButtonGroupContext>
      {name && !disabled ? selected.map((item) => <input key={item} type="hidden" name={name} value={item} />) : null}
    </div>
  );
}
