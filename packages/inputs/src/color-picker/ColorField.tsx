'use client';

import { useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { clearOnEscape, InputGroup } from '../internal/input-group/input-group.js';
import { isColor, toColor, type Color, type ColorFormat, type ColorInput } from './color.js';
import type { ColorChangeSource } from './control.js';
import { ColorSwatch } from './ColorSwatch.js';

/** Second argument of ColorField `onValueChange`. */
export interface ColorFieldChangeDetails {
  readonly source: ColorChangeSource;
  /** `'input'` a parsed entry (blur or Enter), `'clear'` clear button, Escape or an emptied field, `'reset'` form reset. */
  readonly reason: 'input' | 'clear' | 'reset';
  readonly color: Color | null;
}

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'size' | 'type' | 'className' | 'style' | 'children'>;

export interface ColorFieldProps extends FieldCommonProps, NativeInput {
  readonly value?: ColorInput | null | undefined;
  readonly defaultValue?: ColorInput | null | undefined;
  /** Called with the entry in `valueFormat` after it parses (blur or Enter), or null when emptied. */
  readonly onValueChange?: ((value: string | null, details: ColorFieldChangeDetails) => void) | undefined;
  /** Format of the shown and reported value. Default `'hexa'`. */
  readonly valueFormat?: ColorFormat | undefined;
  readonly clearable?: boolean | undefined;
  /** A `ColorSwatch` of the value as the start adornment. Default true. */
  readonly showSwatch?: boolean | undefined;
  readonly endAdornment?: ReactNode;
  readonly localeText?: (FieldValidationText & { readonly clear?: string; readonly colorName?: (color: Color) => string }) | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: { readonly group?: string; readonly input?: string; readonly label?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The native `<input>`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

const OWN = new Set(['value', 'defaultValue', 'onValueChange', 'valueFormat', 'clearable', 'showSwatch', 'endAdornment', 'localeText', 'className', 'style', 'classNames', 'ref', 'label', 'description', 'errorMessage', 'invalid', 'validation', 'validateOn', 'size', 'name', 'form', 'onBlur', 'onKeyDown', 'onChange']);

/**
 * A text field for a color: accepts hex, `rgb()` and
 * `hsl()` text and parses it on blur or Enter (`parseColor`); text that
 * does not parse is reverted. Shows the value in `valueFormat`, a swatch
 * preview and the shared field parts. A hidden input with `name` submits the
 * value.
 */
export function ColorField(props: ColorFieldProps): ReactNode {
  const format = props.valueFormat ?? 'hexa';
  const asString = (v: ColorInput | null | undefined): string | null | undefined => (v === undefined ? undefined : v === null ? null : (toColor(v)?.toString(format) ?? null));
  const [initial] = useState(() => asString(props.defaultValue) ?? null);
  const [value, setValue] = useControllableState<string | null, [ColorFieldChangeDetails]>(asString(props.value), initial, props.onValueChange, 'ColorField value');
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const localeText = useLocaleText('colorField', props.localeText);
  const field = useField({ ...props, localeText, value, inputRef });
  const color = isColor(props.value) ? props.value : toColor(value);
  const emit = (next: string | null, source: ColorChangeSource, reason: ColorFieldChangeDetails['reason']): void => setValue(next, { source, reason, color: toColor(next) });
  useFormReset(inputRef, () => {
    setDraft(null);
    emit(initial, 'api', 'reset');
  });
  const commit = (): void => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() === '') return emit(null, 'keyboard', 'clear');
    const parsed = toColor(draft);
    if (parsed) emit(parsed.toString(format), 'keyboard', 'input');
  };
  const canClear = props.clearable === true && value !== null && !props.disabled && !props.readOnly;
  const native: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.has(key)) native[key] = (props as unknown as Record<string, unknown>)[key];

  return (
    <FieldStateContext value={field}>
      <div className={cx('salmon-field salmon-color-field', props.className)} style={props.style} data-size={props.size ?? 'md'} {...field.rootProps}>
        <FieldLabel field={field} className={props.classNames?.label}>{props.label}</FieldLabel>
        <InputGroup
          size={props.size}
          start={props.showSwatch === false ? null : <ColorSwatch color={color} aria-label="" />}
          end={props.endAdornment}
          clear={canClear ? { label: localeText?.clear ?? 'Clear', onClear: () => (setDraft(null), emit(null, 'pointer', 'clear'), inputRef.current?.focus()) } : null}
          className={props.classNames?.group}
        >
          <input
            {...native}
            {...field.inputProps}
            ref={(el) => {
              inputRef.current = el;
              assignRef(props.ref as never, el);
            }}
            type="text"
            autoComplete={(native['autoComplete'] as string | undefined) ?? 'off'}
            spellCheck={false}
            aria-required={props.required || undefined}
            className={cx('salmon-input', props.classNames?.input)}
            value={draft ?? value ?? ''}
            onChange={(event) => {
              props.onChange?.(event);
              setDraft(event.currentTarget.value);
            }}
            onBlur={(event) => {
              props.onBlur?.(event);
              commit();
              field.onBlur();
            }}
            onKeyDown={(event) => {
              props.onKeyDown?.(event);
              if (event.defaultPrevented || clearOnEscape(event, canClear, () => (setDraft(null), emit(null, 'keyboard', 'clear')))) return;
              if (event.key === 'Enter' && draft !== null) {
                event.preventDefault();
                commit();
              }
            }}
          />
        </InputGroup>
        {props.name ? <input type="hidden" name={props.name} form={props.form} value={value ?? ''} disabled={props.disabled} /> : null}
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}
