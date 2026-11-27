'use client';

// Standalone two-state field shared by Checkbox and Switch: label, description,
// error, form reset and the `checked` triad around a `ToggleInput`.

import { useLayoutEffect, useRef, type ChangeEvent, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from './field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { details, ToggleInput, useChangeSource, type ChoiceChangeDetails, type LabelPlacement } from './toggle-input.js';

/** Second argument of `onCheckedChange`: `reason` is `'toggle'` (click, Space) or `'reset'` (form reset). */
export type CheckedChangeDetails = ChoiceChangeDetails<'toggle' | 'reset'>;

type NativeToggle = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'size' | 'children' | 'className' | 'style' | 'value'>;

/** Props of a standalone two-state field (Checkbox, Switch). */
export interface ToggleFieldProps extends Omit<FieldCommonProps, 'label'>, NativeToggle {
  readonly checked?: boolean | undefined;
  readonly defaultChecked?: boolean | undefined;
  readonly onCheckedChange?: ((checked: boolean, details: CheckedChangeDetails) => void) | undefined;
  /** Submitted value when checked (native, default `'on'`). */
  readonly value?: string | undefined;
  /** Label text (rendered in a real `<label for>`). */
  readonly children?: ReactNode;
  /** Label before (`'start'`) or after (`'end'`, default) the control. */
  readonly labelPlacement?: LabelPlacement | undefined;
  readonly localeText?: FieldValidationText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`; `input`, `label`, `description`, `error`. */
  readonly classNames?: { readonly input?: string; readonly label?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The native `<input type="checkbox">`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

const OWN = ['label', 'description', 'errorMessage', 'invalid', 'validation', 'validateOn', 'size', 'checked', 'defaultChecked', 'onCheckedChange', 'indeterminate', 'children', 'labelPlacement', 'localeText', 'className', 'style', 'classNames', 'ref', 'onChange', 'onBlur', 'group', 'thumbIcon'];

/** Props that go to the native input: everything the component does not own. */
export function nativeOf(props: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.includes(key)) out[key] = (props as Record<string, unknown>)[key];
  return out;
}

/** Sets the `indeterminate` DOM property after every commit (the server markup carries `aria-checked="mixed"`). */
export function useIndeterminate(ref: RefObject<HTMLInputElement | null>, indeterminate: boolean): void {
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  });
}

/** A standalone checkbox-backed field. Checkbox and Switch render it. */
export function ToggleField({ kind, indeterminate, extra, ...props }: ToggleFieldProps & { readonly kind: 'checkbox' | 'switch'; readonly indeterminate?: boolean | undefined; readonly extra?: ReactNode }): ReactNode {
  const initial = useRef(props.defaultChecked ?? false);
  const [checked, setChecked] = useControllableState<boolean, [CheckedChangeDetails]>(props.checked, initial.current, props.onCheckedChange, `${kind} checked`);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const field = useField({ ...props, label: props.children, value: checked ? true : '', inputRef, revealOnChange: true });
  const source = useChangeSource();
  useIndeterminate(inputRef, indeterminate === true);
  useFormReset(inputRef, () => setChecked(initial.current, details(props.onCheckedChange, { source: 'api', reason: 'reset' })));
  return (
    <FieldStateContext value={field}>
      <div className={cx('salmon-field', `salmon-${kind}`, props.className)} style={props.style} data-size={props.size ?? 'md'} {...field.rootProps} onPointerDown={source.onPointerDown} onKeyDown={source.onKeyDown}>
        <ToggleInput
          {...nativeOf(props)}
          {...field.inputProps}
          type="checkbox"
          kind={kind}
          role={kind === 'switch' ? 'switch' : props.role}
          ref={(el: HTMLInputElement | null) => {
            inputRef.current = el;
            assignRef(props.ref as never, el);
          }}
          checked={checked}
          indeterminate={indeterminate}
          labelPlacement={props.labelPlacement}
          parts={{ input: props.classNames?.input, label: props.classNames?.label }}
          extra={extra}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            props.onChange?.(event);
            setChecked(event.currentTarget.checked, details(props.onCheckedChange, { source: source.take(), reason: 'toggle' }));
          }}
          onBlur={(event: FocusEvent<HTMLInputElement>) => {
            props.onBlur?.(event);
            field.onBlur();
          }}
        >
          {props.children}
        </ToggleInput>
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}
