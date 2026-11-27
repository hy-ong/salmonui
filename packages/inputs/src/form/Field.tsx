'use client';

import { use, useRef, type CSSProperties, type ReactNode } from 'react';
import { cx, errorContent, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldState, type FieldValidationText } from '../internal/field/field.js';

/** What a custom control receives from `Field`. */
export interface FieldRenderProps {
  /** Spread on the native element that carries the value: `id`, `name`, ARIA wiring, `ref`, `onBlur`. */
  readonly inputProps: {
    readonly id: string;
    readonly name: string | undefined;
    readonly required: boolean | undefined;
    readonly disabled: boolean | undefined;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-invalid': true | undefined;
    readonly 'aria-errormessage': string | undefined;
    readonly ref: (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => void;
    readonly onBlur: () => void;
  };
  readonly errors: readonly string[];
  readonly invalid: boolean;
  readonly validating: boolean;
}

export interface FieldProps extends FieldCommonProps {
  readonly children: (field: FieldRenderProps) => ReactNode;
  readonly name?: string | undefined;
  /** `'manual'` when the children render `FieldError` themselves. Default `'auto'`. */
  readonly errorPlacement?: 'auto' | 'manual' | undefined;
  /** Id of the control (default from `useId`); the label points at it. */
  readonly id?: string | undefined;
  /** The control's current value, for `validation` rules. */
  readonly value?: unknown;
  readonly required?: boolean | undefined;
  /** `true` marks the label while the control is required (as `Form requiredMark` does); `false` opts out under a marking `Form`. */
  readonly requiredMark?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly localeText?: FieldValidationText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/**
 * Label, description, error and validation around a custom control.
 * Every Salmon field renders the same parts itself.
 */
export function Field(props: FieldProps): ReactNode {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const field = useField({ ...props, value: props.value, inputRef });
  const render: FieldRenderProps = {
    inputProps: {
      ...field.inputProps,
      name: props.name,
      required: props.required,
      disabled: props.disabled,
      ref: (el) => {
        inputRef.current = el;
      },
      onBlur: field.onBlur,
    },
    errors: field.errors,
    invalid: field.invalid,
    validating: field.validating,
  };
  return (
    <FieldStateContext value={field}>
      <div className={cx('salmon-field', props.className)} style={props.style} data-size={props.size ?? 'md'} data-required-mark={props.requiredMark} {...field.rootProps}>
        <FieldLabel field={field}>{props.label}</FieldLabel>
        {props.children(render)}
        <FieldHelp field={field} description={props.description} error={props.errorPlacement !== 'manual'} />
      </div>
    </FieldStateContext>
  );
}

export { useFieldContext } from '@salmonui/core/internal/field/context';

/**
 * The error part for custom layouts: renders the enclosing field's
 * error (or `children`) with the id its control points at.
 */
export function FieldError({ children, className, style }: { readonly children?: ReactNode; readonly className?: string; readonly style?: CSSProperties }): ReactNode {
  const field = use(FieldStateContext);
  if (!field || !field.invalid) return null;
  return (
    <div className={cx('salmon-field-error', className)} style={style} id={field.errorId}>
      {children ?? errorContent(field)}
    </div>
  );
}

/** The description part for custom layouts. */
export function FieldDescription({ children, className, style }: { readonly children?: ReactNode; readonly className?: string; readonly style?: CSSProperties }): ReactNode {
  const field = use(FieldStateContext);
  return (
    <div className={cx('salmon-field-description', className)} style={style} id={field?.descriptionId}>
      {children}
    </div>
  );
}
