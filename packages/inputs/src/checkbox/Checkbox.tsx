'use client';

import { createContext, use, useRef, type ChangeEvent, type CSSProperties, type ReactNode, type Ref } from 'react';
import { DEFAULT_VALIDATION_MESSAGES } from '@salmonui/core/validation';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { nativeOf, ToggleField, useIndeterminate, type CheckedChangeDetails, type ToggleFieldProps } from '../internal/toggle-field.js';
import { ChoiceGroupFrame, details, ToggleInput, useChangeSource, useFirstInput, type ChangeSource, type ChoiceChangeDetails } from '../internal/toggle-input.js';

export type { CheckedChangeDetails } from '../internal/toggle-field.js';
export type { LabelPlacement } from '../internal/toggle-input.js';

/** Second argument of `CheckboxGroup.onValueChange`; `item` is the toggled checkbox value (absent on reset). */
export interface CheckboxGroupChangeDetails extends ChoiceChangeDetails<'toggle' | 'reset'> {
  readonly item?: string | undefined;
}

export interface CheckboxProps extends ToggleFieldProps {
  /** Mixed state: `aria-checked="mixed"` and `data-indeterminate` on the server, the DOM property after mount. */
  readonly indeterminate?: boolean | undefined;
}

export interface CheckboxGroupProps extends FieldCommonProps {
  readonly value?: readonly string[] | undefined;
  readonly defaultValue?: readonly string[] | undefined;
  readonly onValueChange?: ((value: readonly string[], details: CheckboxGroupChangeDetails) => void) | undefined;
  /** Name submitted by every checkbox of the group (one entry per checked value). */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  /** At least one checkbox must be checked. */
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly orientation?: 'vertical' | 'horizontal' | undefined;
  readonly localeText?: FieldValidationText | undefined;
  readonly id?: string | undefined;
  readonly dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`; `label` (legend), `items`, `description`, `error`. */
  readonly classNames?: { readonly label?: string; readonly items?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The `<fieldset>`. */
  readonly ref?: Ref<HTMLFieldSetElement> | undefined;
}

interface GroupContext {
  readonly value: readonly string[];
  readonly toggle: (item: string, checked: boolean, source: CheckboxGroupChangeDetails['source']) => void;
  readonly name: string | undefined;
  readonly form: string | undefined;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly source: ChangeSource;
}

const CheckboxGroupContext = createContext<GroupContext | null>(null);

function GroupCheckbox({ group, ...props }: CheckboxProps & { readonly group: GroupContext }): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const item = props.value ?? 'on';
  useIndeterminate(inputRef, props.indeterminate === true);
  return (
    <ToggleInput
      {...nativeOf(props)}
      type="checkbox"
      kind="checkbox"
      ref={(el: HTMLInputElement | null) => {
        inputRef.current = el;
        assignRef(props.ref as never, el);
      }}
      name={props.name ?? group.name}
      form={props.form ?? group.form}
      value={item}
      disabled={props.disabled || group.disabled}
      checked={group.value.includes(item)}
      indeterminate={props.indeterminate}
      labelPlacement={props.labelPlacement}
      aria-invalid={group.invalid ? true : undefined}
      parts={{ root: props.className, input: props.classNames?.input, label: props.classNames?.label, style: props.style }}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        props.onChange?.(event);
        group.toggle(item, event.currentTarget.checked, group.source.take());
      }}
    >
      {props.children}
    </ToggleInput>
  );
}

/**
 * Checkbox on a native `<input type="checkbox">`,
 * labelled by its children. Inside a `CheckboxGroup` it toggles its `value`
 * in the group's array. `ref` is the input; unknown props go to the input,
 * `className` / `style` to the root.
 */
export function Checkbox(props: CheckboxProps): ReactNode {
  const group = use(CheckboxGroupContext);
  return group ? <GroupCheckbox {...props} group={group} /> : <ToggleField {...props} kind="checkbox" />;
}

const EMPTY: readonly string[] = Object.freeze([]);

/**
 * Several checkboxes as one `string[]` value: a `<fieldset>` named
 * by `label`, with description, error and `required` (at least one).
 */
export function CheckboxGroup(props: CheckboxGroupProps): ReactNode {
  const initial = useRef(props.defaultValue ?? EMPTY);
  const [value, setValue] = useControllableState<readonly string[], [CheckboxGroupChangeDetails]>(props.value, initial.current, props.onValueChange, 'CheckboxGroup value');
  const rootRef = useRef<HTMLFieldSetElement | null>(null);
  const inputRef = useFirstInput(rootRef);
  const missing = props.required === true && value.length === 0 && !props.disabled;
  const localeText = useLocaleText('validation', props.localeText);
  const field = useField({
    ...props,
    localeText,
    value: value.length ? value : '',
    inputRef: inputRef as never,
    revealOnChange: true,
    extraError: missing ? (localeText?.validationRequired ?? DEFAULT_VALIDATION_MESSAGES.required) : null,
  });
  useFormReset(rootRef, () => setValue(initial.current, details(props.onValueChange, { source: 'api', reason: 'reset' })));
  const source = useChangeSource();
  const context: GroupContext = {
    value,
    source,
    name: props.name,
    form: props.form,
    disabled: props.disabled === true,
    invalid: field.invalid,
    toggle: (item, checked, source) =>
      setValue((current) => (checked ? (current.includes(item) ? current : [...current, item]) : current.filter((v) => v !== item)), details(props.onValueChange, { source, reason: 'toggle', item })),
  };
  return (
    <CheckboxGroupContext value={context}>
      <ChoiceGroupFrame
        field={field}
        kind="checkbox-group"
        label={props.label}
        description={props.description}
        orientation={props.orientation}
        disabled={props.disabled}
        size={props.size}
        id={props.id}
        dir={props.dir}
        className={props.className}
        style={props.style}
        classNames={props.classNames}
        onBlur={field.onBlur}
        source={source}
        rootRef={(el: HTMLFieldSetElement | null) => {
          rootRef.current = el;
          assignRef(props.ref as never, el);
        }}
      >
        {props.children}
      </ChoiceGroupFrame>
    </CheckboxGroupContext>
  );
}
