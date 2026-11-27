'use client';

import { useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type MouseEvent, type ReactNode, type Ref, type SyntheticEvent } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';

/** Second argument of `onValueChange`: `'input'` typing or autofill, `'paste'`, `'reset'` form reset. */
export interface OtpChangeDetails {
  readonly source: 'keyboard' | 'pointer' | 'api';
  readonly reason: 'input' | 'paste' | 'reset';
}

/** User-visible strings: `incomplete` (`{0}` the length) is the error while the code is partly filled. */
export type OtpFieldLocaleText = FieldValidationText & { readonly incomplete?: string };

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'size' | 'type' | 'className' | 'style' | 'children' | 'placeholder' | 'maxLength' | 'minLength' | 'pattern' | 'inputMode'>;

export interface OtpFieldProps extends FieldCommonProps, NativeInput {
  /** Number of cells. Default 4. */
  readonly length?: number | undefined;
  /** Accepted characters: digits (default), letters and digits, or any non-space character. */
  readonly type?: 'numeric' | 'alphanumeric' | 'text' | undefined;
  /** Hides the characters (a password input, cells show `•` or the given character). */
  readonly mask?: boolean | string | undefined;
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string, details: OtpChangeDetails) => void) | undefined;
  /** Fires when the value reaches `length`. */
  readonly onComplete?: ((value: string) => void) | undefined;
  /** One character repeated in every empty cell, or one character per cell. */
  readonly placeholder?: string | undefined;
  /** Drawn between groups. */
  readonly separator?: ReactNode;
  /** Cells per group; default 1 with a `separator`, else no groups. */
  readonly groupSize?: number | undefined;
  /** Normalizes letters. Default `'none'`. */
  readonly transform?: 'uppercase' | 'lowercase' | 'none' | undefined;
  readonly localeText?: OtpFieldLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`; `cells`, `cell`, `input`, `label`, `description`, `error`. */
  readonly classNames?: { readonly cells?: string; readonly cell?: string; readonly input?: string; readonly label?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The native `<input>`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

const KEEP = { numeric: /\d/, alphanumeric: /[\p{L}\p{N}]/u, text: /\S/u };
const PATTERN = { numeric: '[0-9]*', alphanumeric: '[\\p{L}\\p{N}]*', text: undefined };

/** Keeps the accepted characters, applies `transform` and cuts to `length`. */
export function normalizeOtp(raw: string, length: number, type: 'numeric' | 'alphanumeric' | 'text' = 'numeric', transform: 'uppercase' | 'lowercase' | 'none' = 'none'): string {
  const keep = KEEP[type];
  let out = '';
  for (const ch of raw) {
    if (out.length >= length) break;
    if (keep.test(ch)) out += ch;
  }
  return transform === 'uppercase' ? out.toUpperCase() : transform === 'lowercase' ? out.toLowerCase() : out;
}

const OWN = ['label', 'description', 'errorMessage', 'invalid', 'validation', 'validateOn', 'size', 'length', 'type', 'mask', 'value', 'defaultValue', 'onValueChange', 'onComplete', 'placeholder', 'separator', 'groupSize', 'transform', 'localeText', 'className', 'style', 'classNames', 'ref', 'onChange', 'onBlur', 'onPaste', 'onSelect', 'onClick', 'onFocus'];

/**
 * One-time code input: one native `<input
 * autocomplete="one-time-code">` with `maxLength`, drawn as cells from the
 * value and the selection, so SMS autofill, paste and screen readers see a
 * single field. `ref` is the input; unknown props go to the input,
 * `className` / `style` to the root.
 */
export function OtpField(props: OtpFieldProps): ReactNode {
  const length = props.length ?? 4;
  const type = props.type ?? 'numeric';
  const transform = props.transform ?? 'none';
  const initial = useRef(normalizeOtp(props.defaultValue ?? '', length, type, transform));
  const [value, setValue] = useControllableState<string, [OtpChangeDetails]>(props.value, initial.current, props.onValueChange, 'OtpField value');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cellsRef = useRef<HTMLDivElement | null>(null);
  const [caret, setCaret] = useState(() => initial.current.length);
  const localeText = useLocaleText('otpField', props.localeText);
  const incomplete = value.length > 0 && value.length < length ? (localeText?.incomplete ?? 'Enter all {0} characters').replace('{0}', String(length)) : null;
  const field = useField({ ...props, localeText, value, inputRef, extraError: incomplete });
  useFormReset(inputRef, () => setValue(initial.current, { source: 'api', reason: 'reset' }));

  const propose = (raw: string, details: OtpChangeDetails): void => {
    const next = normalizeOtp(raw, length, type, transform);
    if (next === value) return;
    setValue(next, details);
    if (next.length === length) props.onComplete?.(next);
  };
  const syncCaret = (event: SyntheticEvent<HTMLInputElement>): void => {
    const el = event.currentTarget;
    setCaret(Math.min(el.selectionStart ?? el.value.length, length - 1));
  };

  const native: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.includes(key)) native[key] = (props as unknown as Record<string, unknown>)[key];

  const groupSize = props.groupSize ?? (props.separator !== undefined && props.separator !== null ? 1 : 0);
  const maskChar = typeof props.mask === 'string' ? props.mask : '•';
  const placeholder = props.placeholder ?? '';
  const cells: ReactNode[] = [];
  for (let i = 0; i < length; i++) {
    if (i > 0 && groupSize > 0 && i % groupSize === 0) {
      cells.push(
        <span key={`s${i}`} className="salmon-otp-separator">
          {props.separator ?? null}
        </span>,
      );
    }
    const ch = value[i];
    cells.push(
      <span key={i} className={cx('salmon-otp-cell', props.classNames?.cell)} data-filled={ch !== undefined ? '' : undefined} data-active={i === Math.min(caret, value.length) ? '' : undefined} data-placeholder={ch === undefined && placeholder ? '' : undefined}>
        {ch !== undefined ? (props.mask ? maskChar : ch) : placeholder.length > 1 ? (placeholder[i] ?? '') : placeholder}
      </span>,
    );
  }

  return (
    <FieldStateContext value={field}>
      <div className={cx('salmon-field salmon-otp-field', props.className)} style={props.style} data-size={props.size ?? 'md'} {...field.rootProps}>
        <FieldLabel field={field} className={props.classNames?.label}>
          {props.label}
        </FieldLabel>
        <div className="salmon-otp" dir={type === 'numeric' && props.dir === undefined ? 'ltr' : undefined}>
          <input
            autoComplete="one-time-code"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize={transform === 'uppercase' ? 'characters' : 'off'}
            {...native}
            {...field.inputProps}
            ref={(el: HTMLInputElement | null) => {
              inputRef.current = el;
              assignRef(props.ref as never, el);
            }}
            className={cx('salmon-otp-input', props.classNames?.input)}
            type={props.mask ? 'password' : 'text'}
            inputMode={type === 'numeric' ? 'numeric' : 'text'}
            pattern={PATTERN[type]}
            maxLength={length}
            value={value}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              (props.onChange as ((e: ChangeEvent<HTMLInputElement>) => void) | undefined)?.(event);
              propose(event.currentTarget.value, { source: 'keyboard', reason: 'input' });
              syncCaret(event);
            }}
            onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
              (props.onPaste as ((e: ClipboardEvent<HTMLInputElement>) => void) | undefined)?.(event);
              if (event.defaultPrevented || props.readOnly) return;
              // A pasted code replaces the whole value.
              const text = normalizeOtp(event.clipboardData.getData('text'), length, type, transform);
              if (!text) return;
              event.preventDefault();
              propose(text, { source: 'keyboard', reason: 'paste' });
              setCaret(Math.min(text.length, length - 1));
            }}
            onSelect={(event: SyntheticEvent<HTMLInputElement>) => {
              (props.onSelect as ((e: SyntheticEvent<HTMLInputElement>) => void) | undefined)?.(event);
              syncCaret(event);
            }}
            onClick={(event: MouseEvent<HTMLInputElement>) => {
              (props.onClick as ((e: MouseEvent<HTMLInputElement>) => void) | undefined)?.(event);
              // A click on a filled cell selects its character so typing replaces it.
              const el = event.currentTarget;
              const list = cellsRef.current?.querySelectorAll('.salmon-otp-cell');
              if (!list) return;
              let index = el.value.length;
              for (let i = 0; i < list.length; i++) {
                const r = list[i]!.getBoundingClientRect();
                if (event.clientX >= r.left && event.clientX <= r.right) index = i;
              }
              if (index < el.value.length) el.setSelectionRange(index, index + 1);
              else el.setSelectionRange(el.value.length, el.value.length);
            }}
            onBlur={(event: FocusEvent<HTMLInputElement>) => {
              (props.onBlur as ((e: FocusEvent<HTMLInputElement>) => void) | undefined)?.(event);
              field.onBlur();
            }}
          />
          <div ref={cellsRef} className={cx('salmon-otp-cells', props.classNames?.cells)} aria-hidden="true">
            {cells}
          </div>
        </div>
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}
