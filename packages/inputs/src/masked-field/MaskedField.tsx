'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldLabel, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { clearOnEscape, InputGroup } from '../internal/input-group/input-group.js';
import { apply, display, insert, isComplete, parseMask, rawOf, remove, removeBackward, removeForward, type MaskState, type MaskTokens } from './mask.js';

/** Second argument of `onValueChange`. */
export interface MaskedChangeDetails {
  readonly source: 'keyboard' | 'pointer' | 'api';
  readonly reason: 'input' | 'paste' | 'delete' | 'clear' | 'reset';
  /** The value with literals and placeholder characters. */
  readonly masked: string;
  /** True when every required position is filled. */
  readonly complete: boolean;
}

/** User-visible strings: `incomplete` is the constraint message. */
export type MaskedFieldLocaleText = FieldValidationText & { readonly clear?: string; readonly incomplete?: string };

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'size' | 'type' | 'className' | 'style' | 'children' | 'placeholder'>;

export interface MaskedFieldProps extends FieldCommonProps, NativeInput {
  /** The mask; an empty mask is plain text. */
  readonly mask: string;
  /** Custom mask characters: allowed characters or a RegExp per character. */
  readonly tokens?: MaskTokens | undefined;
  /** Shown in empty positions. Default `'_'`. */
  readonly placeholderChar?: string | undefined;
  /** Shown while the field is empty and not focused. */
  readonly placeholder?: string | undefined;
  /** Raw value: entered characters without literals or placeholders. */
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string, details: MaskedChangeDetails) => void) | undefined;
  /** What the hidden named input submits. Default `'raw'`. */
  readonly submitValue?: 'raw' | 'masked' | undefined;
  readonly clearable?: boolean | undefined;
  readonly startAdornment?: ReactNode;
  readonly endAdornment?: ReactNode;
  readonly localeText?: MaskedFieldLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: { readonly group?: string; readonly input?: string; readonly label?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The visible native `<input>`. */
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

const OWN = new Set(['mask', 'tokens', 'placeholderChar', 'placeholder', 'value', 'defaultValue', 'onValueChange', 'submitValue', 'clearable', 'startAdornment', 'endAdornment', 'localeText', 'className', 'style', 'classNames', 'ref', 'label', 'description', 'errorMessage', 'invalid', 'validation', 'validateOn', 'size', 'name', 'form', 'onBlur', 'onFocus', 'onKeyDown', 'onChange']);

/**
 * Text input with an input mask. The
 * visible input carries the masked text; a hidden input with `name` submits
 * the raw or masked value. `ref` is the visible input.
 */
export function MaskedField(props: MaskedFieldProps): ReactNode {
  const { mask: maskText, tokens, placeholderChar = '_', submitValue = 'raw' } = props;
  const localeText = useLocaleText('maskedField', props.localeText);
  const mask = parseMask(maskText, tokens);
  const initial = useRef(props.defaultValue ?? '');
  const [value, setValue] = useControllableState<string, [MaskedChangeDetails]>(props.value, initial.current, props.onValueChange, 'MaskedField value');
  // Slot state survives holes in the middle; it is re-derived when the raw value changes from outside.
  const [state, setState] = useState<{ mask: string; raw: string; slots: MaskState }>(() => ({ mask: maskText, raw: value, slots: apply(mask, value) }));
  let slots = state.slots;
  if (state.mask !== maskText || state.raw !== value) {
    slots = apply(mask, value);
    setState({ mask: maskText, raw: value, slots });
  }
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const masked = display(mask, slots, placeholderChar);
  const complete = isComplete(mask, slots);
  const incomplete = value !== '' && !complete ? (localeText?.incomplete ?? 'Please complete the value.') : null;
  const field = useField({ ...props, localeText, value, inputRef, extraError: incomplete });

  const commit = (next: MaskState, at: number, reason: MaskedChangeDetails['reason'], source: MaskedChangeDetails['source'] = 'keyboard'): void => {
    const raw = rawOf(mask, next);
    caret.current = at;
    setState({ mask: maskText, raw, slots: next });
    // A rejected character still re-renders (new slot state), which restores the caret.
    if (raw !== value) setValue(raw, { source, reason, masked: display(mask, next, placeholderChar), complete: isComplete(mask, next) });
  };

  useFormReset(inputRef, () => setValue(initial.current, { source: 'api', reason: 'reset', masked: display(mask, apply(mask, initial.current), placeholderChar), complete: false }));

  const latest = useRef({ slots, commit });
  useLayoutEffect(() => {
    latest.current = { slots, commit };
  });

  // Pending caret after a commit.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && caret.current !== null && document.activeElement === el) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  // An empty field shows its mask once focused, which leaves the caret past the end on keyboard
  // or programmatic focus: start at the first input position.
  const toFirstEmpty = (): void => {
    const el = inputRef.current as HTMLInputElement;
    const i = slots.findIndex((c, k) => !c && mask.slots[k]?.test);
    if (i >= 0 && el.selectionStart === el.selectionEnd && (el.selectionStart ?? 0) > i) el.setSelectionRange(i, i);
  };
  useLayoutEffect(() => {
    if (focused && value === '') toFirstEmpty();
  }, [focused, value, mask]);

  // edits go through beforeinput; IME composition re-applies on compositionend.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || mask.slots.length === 0) return;
    const onBeforeInput = (event: InputEvent): void => {
      if (event.isComposing || event.inputType === 'insertCompositionText' || props.readOnly) return;
      const from = el.selectionStart ?? 0;
      const to = el.selectionEnd ?? from;
      const current = latest.current;
      let base = current.slots;
      const type = event.inputType;
      if (type.startsWith('insert')) {
        event.preventDefault();
        const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
        if (to > from) base = remove(mask, base, from, to).state;
        const out = insert(mask, base, from, text);
        current.commit(out.state, out.caret, type === 'insertFromPaste' ? 'paste' : 'input');
      } else if (type.startsWith('delete')) {
        event.preventDefault();
        const out = to > from ? remove(mask, base, from, to) : type === 'deleteContentForward' ? removeForward(mask, base, from) : removeBackward(mask, base, from);
        current.commit(out.state, out.caret, 'delete');
      }
    };
    const onEnd = (event: CompositionEvent): void => {
      const current = latest.current;
      const at = Math.max(0, (el.selectionStart ?? 0) - (event.data?.length ?? 0));
      const out = insert(mask, current.slots, at, event.data ?? '');
      current.commit(out.state, out.caret, 'input');
    };
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('compositionend', onEnd);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('compositionend', onEnd);
    };
  }, [mask, placeholderChar, props.readOnly]);

  const native: Record<string, unknown> = {};
  for (const key of Object.keys(props)) if (!OWN.has(key)) native[key] = (props as unknown as Record<string, unknown>)[key];
  const plain = mask.slots.length === 0;
  const shown = plain ? value : value === '' && !focused ? '' : masked;
  const canClear = props.clearable === true && value !== '' && !props.disabled && !props.readOnly;
  const clear = (source: MaskedChangeDetails['source']): void => commit(apply(mask, ''), 0, 'clear', source);

  return (
    <FieldStateContext value={field}>
      <div className={cx('salmon-field salmon-text-field salmon-masked-field', props.className)} style={props.style} data-size={props.size ?? 'md'} {...field.rootProps}>
        <FieldLabel field={field} className={props.classNames?.label}>{props.label}</FieldLabel>
        <InputGroup size={props.size} start={props.startAdornment} end={props.endAdornment} clear={canClear ? { label: localeText?.clear ?? 'Clear', onClear: () => clear('pointer') } : null} className={props.classNames?.group}>
          <input
            dir={mask.digitsOnly ? 'ltr' : undefined}
            {...native}
            {...field.inputProps}
            ref={(el) => {
              inputRef.current = el;
              assignRef(props.ref as never, el);
            }}
            type="text"
            className={cx('salmon-input', props.classNames?.input)}
            value={shown}
            placeholder={props.placeholder}
            onChange={(event) => {
              props.onChange?.(event);
              // Masked edits are handled in beforeinput; a plain (empty) mask is a text field.
              if (plain) setValue(event.currentTarget.value, { source: 'keyboard', reason: 'input', masked: event.currentTarget.value, complete: true });
            }}
            onFocus={(event: FocusEvent<HTMLInputElement>) => {
              props.onFocus?.(event);
              setFocused(true);
            }}
            onBlur={(event: FocusEvent<HTMLInputElement>) => {
              props.onBlur?.(event);
              setFocused(false);
              field.onBlur();
            }}
            // A click past the entered text lands on the first empty position.
            onMouseUp={toFirstEmpty}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              props.onKeyDown?.(event);
              clearOnEscape(event, canClear, () => clear('keyboard'));
            }}
          />
        </InputGroup>
        {props.name ? <input type="hidden" name={props.name} form={props.form} value={submitValue === 'masked' && value !== '' ? masked : value} disabled={props.disabled} /> : null}
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}
