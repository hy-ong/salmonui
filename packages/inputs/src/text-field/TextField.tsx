'use client';

import { useLayoutEffect, useRef, type ChangeEvent, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { clearOnEscape, InputGroup } from '../internal/input-group/input-group.js';

/** Second argument of `onValueChange`. */
export interface TextChangeDetails {
  readonly source: 'keyboard' | 'pointer' | 'api';
  /** `'input'` typing or paste, `'clear'` clear button or Escape, `'reset'` form reset. */
  readonly reason: 'input' | 'clear' | 'reset';
}

/** User-visible strings: `clear` names the clear button; `validation*` keys override rule messages. */
export type TextFieldLocaleText = FieldValidationText & { readonly clear?: string };

interface TextBaseProps extends FieldCommonProps {
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string, details: TextChangeDetails) => void) | undefined;
  /** Shows a clear button while there is a value; Escape clears too. */
  readonly clearable?: boolean | undefined;
  readonly startAdornment?: ReactNode;
  readonly endAdornment?: ReactNode;
  readonly localeText?: TextFieldLocaleText | undefined;
  /** Root class and style (the input gets every other prop). */
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`; `group`, `input`, `label`, `description`, `error`. */
  readonly classNames?: { readonly group?: string; readonly input?: string; readonly label?: string; readonly description?: string; readonly error?: string } | undefined;
}

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'size' | 'type' | 'className' | 'style' | 'children'>;
type NativeTextArea = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'className' | 'style' | 'children'>;

export interface TextFieldProps extends TextBaseProps, NativeInput {
  /** Input type; numbers use `NumberField`. Default `'text'`. */
  readonly type?: 'text' | 'password' | 'email' | 'tel' | 'url' | 'search' | undefined;
  /** The native `<input>`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

export interface TextAreaProps extends TextBaseProps, NativeTextArea {
  /** Native resize handle. Default `'both'`. */
  readonly resize?: 'vertical' | 'horizontal' | 'both' | 'none' | undefined;
  /** Grows with its content: `field-sizing: content`, one `scrollHeight` read per input where unsupported. */
  readonly autoResize?: boolean | undefined;
  /** The native `<textarea>`. */
  readonly ref?: Ref<HTMLTextAreaElement> | undefined;
}

type Control = HTMLInputElement | HTMLTextAreaElement;

function useTextField<E extends Control>(props: TextBaseProps & { readonly name?: string | undefined; readonly disabled?: boolean | undefined; readonly readOnly?: boolean | undefined; readonly id?: string | undefined; readonly required?: boolean | undefined; readonly onChange?: ((event: ChangeEvent<E>) => void) | undefined; readonly onBlur?: ((event: FocusEvent<E>) => void) | undefined; readonly onKeyDown?: ((event: KeyboardEvent<E>) => void) | undefined; readonly ref?: Ref<E> | undefined }) {
  const initial = useRef(props.defaultValue ?? '');
  const [value, setValue] = useControllableState<string, [TextChangeDetails]>(props.value, initial.current, props.onValueChange, 'TextField value');
  const inputRef = useRef<E | null>(null);
  const localeText = useLocaleText('textField', props.localeText);
  const field = useField({ ...props, localeText, value, inputRef });
  useFormReset(inputRef, () => setValue(initial.current, { source: 'api', reason: 'reset' }));
  const clear = (): void => {
    setValue('', { source: 'pointer', reason: 'clear' });
    inputRef.current?.focus();
  };
  const canClear = props.clearable === true && value !== '' && !props.disabled && !props.readOnly;
  const control = {
    ...field.inputProps,
    ref: (el: E | null) => {
      inputRef.current = el;
      assignRef(props.ref as never, el);
    },
    value,
    onChange: (event: ChangeEvent<E>) => {
      props.onChange?.(event);
      setValue(event.currentTarget.value, { source: 'keyboard', reason: 'input' });
    },
    onBlur: (event: FocusEvent<E>) => {
      props.onBlur?.(event);
      field.onBlur();
    },
    onKeyDown: (event: KeyboardEvent<E>) => {
      props.onKeyDown?.(event);
      if (clearOnEscape(event, canClear, () => setValue('', { source: 'keyboard', reason: 'clear' }))) return;
    },
  };
  return { field, value, control, canClear, clear, inputRef, localeText };
}

const OWN = ['label', 'description', 'errorMessage', 'invalid', 'validation', 'validateOn', 'size', 'value', 'defaultValue', 'onValueChange', 'clearable', 'startAdornment', 'endAdornment', 'localeText', 'className', 'style', 'classNames', 'ref', 'onChange', 'onBlur', 'onKeyDown', 'type', 'resize', 'autoResize'];

/** Props that go to the native element: everything the component does not own. */
function nativeOf(props: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.includes(key)) out[key] = (props as Record<string, unknown>)[key];
  return out;
}

function Frame(props: TextBaseProps & { readonly state: ReturnType<typeof useTextField<Control>>; readonly children: ReactNode; readonly multiline?: boolean }): ReactNode {
  const { state, classNames } = props;
  return (
    <FieldStateContext value={state.field}>
      <div className={cx('salmon-field salmon-text-field', props.className)} style={props.style} data-size={props.size ?? 'md'} {...state.field.rootProps}>
        <FieldLabel field={state.field} className={classNames?.label}>{props.label}</FieldLabel>
        <InputGroup size={props.size} start={props.startAdornment} end={props.endAdornment} clear={state.canClear ? { label: state.localeText?.clear ?? 'Clear', onClear: state.clear } : null} multiline={props.multiline} className={classNames?.group}>
          {props.children}
        </InputGroup>
        <FieldHelp field={state.field} description={props.description} classNames={classNames} />
      </div>
    </FieldStateContext>
  );
}

/**
 * Single-line text input: a native `<input>` with label,
 * description, validation, adornments and an optional clear button. `ref` is
 * the input; unknown props go to the input, `className` / `style` to the root.
 */
export function TextField(props: TextFieldProps): ReactNode {
  const state = useTextField<HTMLInputElement>(props);
  return (
    <Frame {...props} state={state as never}>
      <input {...nativeOf(props)} {...state.control} type={props.type ?? 'text'} className={cx('salmon-input', props.classNames?.input)} />
    </Frame>
  );
}

/**
 * Multi-line text input (TextBox `multiline`): a native
 * `<textarea>`. `ref` is the textarea.
 */
export function TextArea(props: TextAreaProps): ReactNode {
  const state = useTextField<HTMLTextAreaElement>(props);
  const { inputRef, value } = state;
  const autoResize = props.autoResize === true;
  // fallback: one scrollHeight read, then one write, after each value change.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!autoResize || !el || (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content'))) return;
    el.style.blockSize = 'auto';
    el.style.blockSize = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [autoResize, value, inputRef]);
  return (
    <Frame {...props} state={state as never} multiline>
      <textarea
        {...nativeOf(props)}
        {...state.control}
        className={cx('salmon-input salmon-text-area', props.classNames?.input)}
        data-resize={props.resize ?? 'both'}
        data-auto-resize={autoResize ? '' : undefined}
      />
    </Frame>
  );
}
