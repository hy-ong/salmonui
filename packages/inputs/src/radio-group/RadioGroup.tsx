'use client';

import { createContext, use, useId, useRef, type ChangeEvent, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { ChoiceGroupFrame, details, ToggleInput, useChangeSource, useFirstInput, type ChangeSource, type ChoiceChangeDetails, type LabelPlacement } from '../internal/toggle-input.js';

export type { LabelPlacement } from '../internal/toggle-input.js';

/** Second argument of `onValueChange`: `reason` is `'select'` (click, arrow keys, Space) or `'reset'` (form reset). */
export type RadioChangeDetails = ChoiceChangeDetails<'select' | 'reset'>;

export interface RadioGroupProps extends FieldCommonProps {
  /** Selected value; `null` selects nothing. */
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly onValueChange?: ((value: string, details: RadioChangeDetails) => void) | undefined;
  /** Submitted name. Without it the radios share a generated name and are not submitted. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** Radios ignore changes but stay focusable (`aria-readonly`). */
  readonly readOnly?: boolean | undefined;
  readonly orientation?: 'vertical' | 'horizontal' | undefined;
  /** Label placement of every radio. Default `'end'`. */
  readonly labelPlacement?: LabelPlacement | undefined;
  readonly localeText?: FieldValidationText | undefined;
  readonly id?: string | undefined;
  readonly dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`; `label` (legend), `items`, `description`, `error`. */
  readonly classNames?: { readonly label?: string; readonly items?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The `<fieldset role="radiogroup">`. */
  readonly ref?: Ref<HTMLFieldSetElement> | undefined;
}

type NativeRadio = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'children' | 'className' | 'style' | 'value'>;

export interface RadioProps extends NativeRadio {
  /** The value this radio selects. */
  readonly value: string;
  /** Label text. */
  readonly children?: ReactNode;
  readonly labelPlacement?: LabelPlacement | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: { readonly input?: string; readonly label?: string } | undefined;
  /** The native `<input type="radio">`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

interface GroupContext {
  readonly value: string | null;
  readonly select: (value: string, source: RadioChangeDetails['source']) => void;
  readonly name: string;
  readonly form: string | undefined;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly labelPlacement: LabelPlacement | undefined;
  readonly source: ChangeSource;
}

const RadioGroupContext = createContext<GroupContext | null>(null);

const OWN = ['value', 'children', 'labelPlacement', 'className', 'style', 'classNames', 'ref', 'onChange'];

/**
 * One radio. Inside a `RadioGroup` it
 * takes the group's name and selection; outside it is a plain native radio
 * grouped by its own `name` (`checked` / `defaultChecked` are native).
 */
export function Radio(props: RadioProps): ReactNode {
  const group = use(RadioGroupContext);
  const native: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.includes(key)) native[key] = (props as unknown as Record<string, unknown>)[key];
  const inGroup = group
    ? {
        name: group.name,
        form: group.form,
        required: group.required || undefined,
        checked: group.value === props.value,
        disabled: props.disabled || group.disabled,
        'aria-invalid': group.invalid ? true : undefined,
      }
    : null;
  return (
    <ToggleInput
      {...native}
      {...inGroup}
      type="radio"
      kind="radio"
      ref={props.ref}
      value={props.value}
      labelPlacement={props.labelPlacement ?? group?.labelPlacement}
      parts={{ root: props.className, input: props.classNames?.input, label: props.classNames?.label, style: props.style }}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        props.onChange?.(event);
        if (group && event.currentTarget.checked) group.select(props.value, group.source.take());
      }}
    >
      {props.children}
    </ToggleInput>
  );
}

/**
 * Radio group: a `<fieldset role="radiogroup">` named by
 * `label` around native radios that share one `name`, so the browser
 * provides the single Tab stop and arrow-key selection.
 */
export function RadioGroup(props: RadioGroupProps): ReactNode {
  const initial = useRef(props.defaultValue ?? null);
  const [value, setValue] = useControllableState<string | null, [RadioChangeDetails]>(props.value, initial.current, props.onValueChange as never, 'RadioGroup value');
  const rootRef = useRef<HTMLFieldSetElement | null>(null);
  const inputRef = useFirstInput(rootRef);
  const generated = useId();
  const source = useChangeSource();
  const field = useField({ ...props, value: value ?? '', inputRef: inputRef as never, revealOnChange: true });
  useFormReset(rootRef, () => setValue(initial.current, details(props.onValueChange, { source: 'api', reason: 'reset' })));
  const context: GroupContext = {
    value,
    name: props.name ?? generated,
    // Without a name the radios leave the form (`form=""` matches no form): nothing is submitted under the generated name.
    form: props.form ?? (props.name === undefined ? '' : undefined),
    required: props.required === true,
    disabled: props.disabled === true,
    readOnly: props.readOnly === true,
    invalid: field.invalid,
    labelPlacement: props.labelPlacement,
    source,
    // Read-only: the controlled `checked` puts the native selection back.
    select: (next, source) => (props.readOnly ? undefined : setValue(next, details(props.onValueChange, { source, reason: 'select' }))),
  };
  return (
    <RadioGroupContext value={context}>
      <ChoiceGroupFrame
        field={field}
        kind="radio-group"
        role="radiogroup"
        label={props.label}
        description={props.description}
        orientation={props.orientation}
        disabled={props.disabled}
        required={props.required}
        readOnly={props.readOnly}
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
    </RadioGroupContext>
  );
}
