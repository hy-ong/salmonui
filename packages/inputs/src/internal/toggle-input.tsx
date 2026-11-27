'use client';

// Toggle input (internal module table `toggle-input.tsx`): the styled
// native checkbox / radio shared by Checkbox, Switch, Radio and Rating, the
// change-source tracker and the `<fieldset>` frame of the choice groups.
//
// - The native input keeps its role, keyboard, form submission and
//   validity; CSS draws it (`appearance: none` and a mask icon) and widens
//   its hit area to 24 px with a pseudo-element (WCAG 2.2 target size).
// - `labelPlacement` reorders the DOM so reading order matches the visual
//   order.

import { useRef, useState, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { cx, FieldHelp, FieldStateContext, type FieldState } from './field/field.js';
import type { PressSource } from '@salmonui/core/internal/press';

/** Where the label sits relative to the control. */
export type LabelPlacement = 'start' | 'end';

/** Change details of the choice fields. */
export interface ChoiceChangeDetails<R extends string> {
  readonly source: PressSource | 'api';
  readonly reason: R;
}

/** Change-source tracker; its handlers go on the element that contains the inputs. */
export interface ChangeSource {
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  /** The source of the change being handled; clears the record. */
  readonly take: () => PressSource;
}

/**
 * Remembers how the next change was caused: the last pointer type, or the
 * keyboard. Attach the handlers to the root (a label click or an arrow key
 * on a sibling radio changes another input than the one under the event).
 */
export function useChangeSource(): ChangeSource {
  const last = useRef<PressSource | null>(null);
  return {
    onPointerDown: (event) => void (last.current = event.pointerType === 'touch' ? 'touch' : 'pointer'),
    onKeyDown: () => void (last.current = 'keyboard'),
    take: () => {
      const source = last.current ?? 'pointer';
      last.current = null;
      return source;
    },
  };
}

/** Frozen change details, allocated only when a callback is bound. */
export function details<R extends string, D extends ChoiceChangeDetails<R>>(bound: unknown, value: D): D {
  return bound ? Object.freeze(value) : (NO_DETAILS as D);
}
const NO_DETAILS = Object.freeze({ source: 'api', reason: '' });

export interface ToggleInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children' | 'size'> {
  readonly type: 'checkbox' | 'radio';
  /** Visual kind: `salmon-toggle-<kind>`. */
  readonly kind: 'checkbox' | 'radio' | 'switch';
  readonly ref?: Ref<HTMLInputElement> | undefined;
  readonly children?: ReactNode;
  readonly labelPlacement?: LabelPlacement | undefined;
  /** Extra classes: `root` on the `<label>`, `input` on the input, `label` on the text. */
  readonly parts?: { readonly root?: string | undefined; readonly input?: string | undefined; readonly label?: string | undefined; readonly style?: CSSProperties | undefined } | undefined;
  readonly indeterminate?: boolean | undefined;
  /** Decoration drawn over the input (Switch `thumbIcon`). */
  readonly extra?: ReactNode;
}

/**
 * `<label class="salmon-toggle"><input/><span>children</span></label>`.
 * Without children the input stands alone (name it with `aria-label`).
 */
export function ToggleInput({ type, kind, children, labelPlacement = 'end', parts, indeterminate, extra, ...input }: ToggleInputProps): ReactNode {
  const native = (
    <input
      {...input}
      type={type}
      className={cx('salmon-toggle-input', `salmon-toggle-${kind}`, parts?.input)}
      aria-checked={indeterminate ? 'mixed' : input['aria-checked']}
      data-indeterminate={indeterminate ? '' : undefined}
    />
  );
  const control = extra ? (
    <span className="salmon-toggle-control">
      {native}
      <span className="salmon-toggle-extra" aria-hidden="true">
        {extra}
      </span>
    </span>
  ) : (
    native
  );
  const hasText = children !== undefined && children !== null && children !== false;
  if (!hasText) return control;
  const text = <span className={cx('salmon-toggle-label', parts?.label)}>{children}</span>;
  return (
    <label className={cx('salmon-toggle', parts?.root)} style={parts?.style} htmlFor={input.id} data-label-placement={labelPlacement} data-disabled={input.disabled ? '' : undefined}>
      {labelPlacement === 'start' ? text : control}
      {labelPlacement === 'start' ? control : text}
    </label>
  );
}

export interface ChoiceGroupFrameProps {
  readonly field: FieldState;
  readonly kind: string;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly role?: 'radiogroup' | undefined;
  readonly orientation?: 'vertical' | 'horizontal' | undefined;
  readonly disabled?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly size?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: { readonly label?: string; readonly items?: string; readonly description?: string; readonly error?: string } | undefined;
  readonly rootRef?: Ref<HTMLFieldSetElement> | undefined;
  readonly dir?: string | undefined;
  readonly id?: string | undefined;
  readonly children: ReactNode;
  readonly after?: ReactNode;
  readonly itemsProps?: object | undefined;
  /** Called when focus leaves the group (reveals errors like a field blur). */
  readonly onBlur?: (() => void) | undefined;
  /** The group's change-source tracker (arrow keys change a sibling radio, so it lives on the fieldset). */
  readonly source?: ChangeSource | undefined;
}

/**
 * `<fieldset>` + `<legend>` frame of RadioGroup, CheckboxGroup and Rating:
 * the group is named by the legend and described by the field's
 * description and error.
 */
export function ChoiceGroupFrame(props: ChoiceGroupFrameProps): ReactNode {
  const { field } = props;
  const hasLabel = props.label !== undefined && props.label !== null && props.label !== false;
  return (
    <FieldStateContext value={field}>
      <fieldset
        ref={props.rootRef}
        id={props.id}
        dir={props.dir}
        className={cx('salmon-field salmon-choice-group', `salmon-${props.kind}`, props.className)}
        style={props.style}
        role={props.role}
        disabled={props.disabled}
        data-size={props.size ?? 'md'}
        data-orientation={props.orientation ?? 'vertical'}
        aria-labelledby={hasLabel ? field.labelId : undefined}
        aria-describedby={field.inputProps['aria-describedby']}
        aria-invalid={props.role ? field.inputProps['aria-invalid'] : undefined}
        aria-errormessage={props.role ? field.inputProps['aria-errormessage'] : undefined}
        aria-required={props.role && props.required ? true : undefined}
        aria-readonly={props.role && props.readOnly ? true : undefined}
        {...field.rootProps}
        onPointerDown={props.source?.onPointerDown}
        onKeyDown={props.source?.onKeyDown}
        onBlur={
          props.onBlur
            ? (event: FocusEvent) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onBlur!();
              }
            : undefined
        }
      >
        {hasLabel ? (
          <legend className={cx('salmon-field-label', props.classNames?.label)} id={field.labelId}>
            {props.label}
          </legend>
        ) : null}
        <div className={cx('salmon-choice-group-items', props.classNames?.items)} {...props.itemsProps}>
          {props.children}
        </div>
        {props.after}
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </fieldset>
    </FieldStateContext>
  );
}

/** A stable ref whose `current` is the first native input of `root` (a group's validity carrier). */
export function useFirstInput(root: { readonly current: HTMLElement | null }): { readonly current: HTMLInputElement | null } {
  const [ref] = useState(() => ({
    get current() {
      return (root.current?.querySelector('input') as HTMLInputElement | null) ?? null;
    },
  }));
  return ref;
}
