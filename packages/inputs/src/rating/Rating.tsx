'use client';

import { useEffect, useId, useRef, type ChangeEvent, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { cx, FieldHelp, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { formatValidationMessage as fill } from '@salmonui/core/validation';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { ChoiceGroupFrame, details, useChangeSource, useFirstInput, type ChoiceChangeDetails } from '../internal/toggle-input.js';

/** Second argument of `onValueChange`: `'select'` (click, arrow keys), `'clear'` (clear button) or `'reset'` (form reset). */
export type RatingChangeDetails = ChoiceChangeDetails<'select' | 'clear' | 'reset'>;

/** Fill state of one item. */
export type RatingItemState = 'full' | 'half' | 'empty';

/**
 * User-visible strings. `item` names each radio and the read-only image
 * (`{0}` value, `{1}` count; default `'{0} of {1} stars'`); `clear` names the
 * clear button.
 */
export type RatingLocaleText = FieldValidationText & { readonly item?: string; readonly clear?: string };

export interface RatingProps extends FieldCommonProps {
  readonly value?: number | undefined;
  /** Default `min`. */
  readonly defaultValue?: number | undefined;
  readonly onValueChange?: ((value: number, details: RatingChangeDetails) => void) | undefined;
  /** Number of items. Default 5. */
  readonly count?: number | undefined;
  /** Lowest value a selection can set; the cleared value. Default 0. */
  readonly min?: number | undefined;
  /**
   * Step: `'full'` or `'half'` while editing; `'quarter'`
   * and `'exact'` only with `readOnly` (a `role="img"` display). Default `'full'`.
   */
  readonly precision?: 'full' | 'half' | 'quarter' | 'exact' | undefined;
  /** Shows a clear button while the value is above `min`. */
  readonly clearable?: boolean | undefined;
  /** Fills only the selected item. */
  readonly highlightSelectedOnly?: boolean | undefined;
  /** Shows the value next to the items. */
  readonly showLabel?: boolean | undefined;
  /** Where the value label sits. Default `'end'`. */
  readonly labelPlacement?: 'top' | 'bottom' | 'start' | 'end' | undefined;
  readonly renderLabel?: ((ctx: { readonly value: number; readonly count: number }) => ReactNode) | undefined;
  /** Filled icon. Default a star. */
  readonly icon?: ReactNode;
  /** Empty icon. Default `icon` (drawn in the empty color). */
  readonly emptyIcon?: ReactNode;
  /** Replaces both icons of an item. */
  readonly renderItem?: ((ctx: { readonly index: number; readonly state: RatingItemState; readonly fill: number }) => ReactNode) | undefined;
  /** Shows a value bubble over the hovered or focused step. */
  readonly showTooltip?: boolean | undefined;
  readonly renderTooltip?: ((ctx: { readonly value: number; readonly count: number }) => ReactNode) | undefined;
  /** The step under the pointer, `null` when it leaves. Bound listeners only when given; no state. */
  readonly onHoverChange?: ((value: number | null) => void) | undefined;
  /** Submitted name. Without it the radios share a generated name and are not submitted. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** Display only: radios stay focusable but ignore changes; `'quarter'` / `'exact'` render a `role="img"`. */
  readonly readOnly?: boolean | undefined;
  readonly localeText?: RatingLocaleText | undefined;
  readonly id?: string | undefined;
  readonly dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`; `label`, `items`, `item`, `value`, `description`, `error`. */
  readonly classNames?: { readonly label?: string; readonly items?: string; readonly item?: string; readonly value?: string; readonly description?: string; readonly error?: string } | undefined;
  /** The root element (`<fieldset>`, or `<div>` for the image display). */
  readonly ref?: Ref<HTMLElement> | undefined;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** The default star glyph, colored by the theme. */
const STAR = '★';

interface ItemsProps {
  readonly props: RatingProps;
  readonly value: number;
  readonly count: number;
  readonly half: boolean;
  /** Interactive: radios per step; otherwise a fill per item. */
  readonly radios: ((step: number) => ReactNode) | null;
  readonly exact: boolean;
}

function Items({ props, value, count, half, radios, exact }: ItemsProps): ReactNode {
  const items: ReactNode[] = [];
  const selected = Math.ceil(value);
  for (let index = 1; index <= count; index++) {
    let f = clamp01(value - (index - 1));
    if (props.highlightSelectedOnly) f = index === selected ? (value === index - 0.5 ? 0.5 : 1) : 0;
    if (!exact) f = f >= 1 ? 1 : f >= 0.5 && half ? 0.5 : f > 0 && !half ? 1 : 0;
    const state: RatingItemState = f >= 1 ? 'full' : f > 0 ? 'half' : 'empty';
    items.push(
      <span
        key={index}
        className={cx('salmon-rating-item', props.classNames?.item)}
        data-fill={exact ? undefined : state}
        style={exact ? ({ '--salmon-rating-fill': `${Math.round(f * 1000) / 10}%` } as CSSProperties) : undefined}
      >
        {props.renderItem ? (
          <span className="salmon-rating-custom" aria-hidden="true">
            {props.renderItem({ index, state, fill: f })}
          </span>
        ) : (
          <>
            <span className="salmon-rating-icon salmon-rating-empty" aria-hidden="true">
              <span className="salmon-rating-glyph">{props.emptyIcon ?? props.icon ?? STAR}</span>
            </span>
            <span className="salmon-rating-icon salmon-rating-full" aria-hidden="true">
              <span className="salmon-rating-glyph">{props.icon ?? STAR}</span>
            </span>
          </>
        )}
        {radios ? (
          <>
            {half ? radios(index - 0.5) : null}
            {radios(index)}
          </>
        ) : null}
      </span>,
    );
  }
  return items;
}

function ValueLabel({ props, value, count }: { readonly props: RatingProps; readonly value: number; readonly count: number }): ReactNode {
  if (!props.showLabel) return null;
  return <span className={cx('salmon-rating-value', props.classNames?.value)}>{props.renderLabel ? props.renderLabel({ value, count }) : String(value)}</span>;
}

/**
 * Rating: one native radio per step (two per item with
 * `precision="half"`) named by `localeText.item`, inside a
 * `<fieldset role="radiogroup">` named by `label`. Arrow keys are the
 * browser's radio keys (mirrored in RTL); hover preview is CSS. Read-only
 * `'quarter'` / `'exact'` precision renders one `role="img"` with a clipped
 * fill. `ref` is the root element.
 */
export function Rating(props: RatingProps): ReactNode {
  const count = props.count ?? 5;
  const min = props.min ?? 0;
  const initial = useRef(props.defaultValue ?? min);
  const [value, setValue] = useControllableState<number, [RatingChangeDetails]>(props.value, initial.current, props.onValueChange, 'Rating value');
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useFirstInput(rootRef);
  const generated = useId();
  const source = useChangeSource();
  const display = props.readOnly === true && (props.precision === 'quarter' || props.precision === 'exact');
  const localeText = useLocaleText('rating', props.localeText);
  const field = useField({ ...props, localeText, value: value > min ? value : '', inputRef: inputRef as never, revealOnChange: true });
  useFormReset(rootRef, () => setValue(initial.current, details(props.onValueChange, { source: 'api', reason: 'reset' })));
  const template = localeText?.item ?? '{0} of {1} stars';
  const ref = (el: HTMLElement | null): void => {
    rootRef.current = el;
    assignRef(props.ref as never, el);
  };
  const coerced = !props.readOnly && (props.precision === 'quarter' || props.precision === 'exact') ? props.precision : null;
  useEffect(() => {
    if (DEV && coerced) warnOnce('rating:precision', `Rating precision="${coerced}" needs readOnly; editing uses "half".`);
  }, [coerced]);

  if (display) {
    const shown = props.precision === 'quarter' ? Math.round(value * 4) / 4 : value;
    return (
      <FieldStateContext value={field}>
        <div ref={ref} id={props.id} dir={props.dir} className={cx('salmon-field salmon-rating', props.className)} style={props.style} data-size={props.size ?? 'md'} data-readonly="" data-label-placement={props.labelPlacement ?? 'end'} {...field.rootProps}>
          {props.label !== undefined && props.label !== null && props.label !== false ? (
            <span className={cx('salmon-field-label', props.classNames?.label)} id={field.labelId}>
              {props.label}
            </span>
          ) : null}
          <div className="salmon-choice-group-items salmon-rating-row">
            <span className={cx('salmon-rating-items', props.classNames?.items)} role="img" aria-label={fill(template, shown, count)} aria-describedby={field.inputProps['aria-describedby']}>
              <Items props={props} value={shown} count={count} half radios={null} exact />
            </span>
            <ValueLabel props={props} value={shown} count={count} />
          </div>
          <FieldHelp field={field} description={props.description} classNames={props.classNames} />
        </div>
      </FieldStateContext>
    );
  }

  const half = props.precision !== undefined && props.precision !== 'full';
  const name = props.name ?? generated;
  const interactive = !props.readOnly && !props.disabled;
  const radios = (step: number): ReactNode => (
    <>
      <input
        type="radio"
        className="salmon-rating-radio"
        name={name}
        form={props.form ?? (props.name === undefined ? '' : undefined)}
        value={step}
        checked={value === step}
        required={props.required}
        disabled={props.disabled}
        aria-label={fill(template, step, count)}
        aria-invalid={field.invalid ? true : undefined}
        data-half={step % 1 ? '' : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          // Read-only radios stay focusable; the controlled `checked` restores the selection.
          if (props.readOnly || !event.currentTarget.checked) return;
          setValue(Math.max(step, min), details(props.onValueChange, { source: source.take(), reason: 'select' }));
        }}
      />
      {props.showTooltip ? (
        <span className="salmon-rating-tooltip" aria-hidden="true">
          {props.renderTooltip ? props.renderTooltip({ value: step, count }) : String(step)}
        </span>
      ) : null}
    </>
  );
  const onHover = props.onHoverChange;
  const hover = onHover
    ? {
        onPointerOver: (event: { readonly target: EventTarget }) => {
          const target = event.target as HTMLInputElement;
          if (target.classList?.contains('salmon-rating-radio')) onHover(Number(target.value));
        },
        onPointerLeave: () => onHover(null),
      }
    : null;
  const label = <ValueLabel props={props} value={value} count={count} />;
  const placement = props.labelPlacement ?? 'end';
  // The clear button sits on the row next to the stars when the value label
  // is inline (start / end); a column row (top / bottom) keeps it below.
  const inline = placement === 'start' || placement === 'end';
  const clear =
    props.clearable && interactive && value > min ? (
      <button
        type="button"
        className="salmon-rating-clear"
        onClick={(event) => {
          setValue(min, details(props.onValueChange, { source: event.detail === 0 ? 'keyboard' : 'pointer', reason: 'clear' }));
          inputRef.current?.focus();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Named by text, not aria-label, so the visible glyph never mismatches the name. */}
        <span className="salmon-visually-hidden">{localeText?.clear ?? 'Clear rating'}</span>
      </button>
    ) : null;
  return (
    <ChoiceGroupFrame
      field={field}
      kind="rating"
      role="radiogroup"
      label={props.label}
      description={props.description}
      disabled={props.disabled}
      required={props.required}
      readOnly={props.readOnly}
      size={props.size}
      id={props.id}
      dir={props.dir}
      className={cx(interactive && 'salmon-rating-interactive', props.className)}
      style={props.style}
      classNames={{ ...props.classNames, items: cx('salmon-rating-row', props.classNames?.items) }}
      itemsProps={{ 'data-label-placement': placement, 'data-highlight-selected-only': props.highlightSelectedOnly ? '' : undefined }}
      onBlur={field.onBlur}
      source={source}
      rootRef={ref}
      after={inline ? null : clear}
    >
      {placement === 'top' || placement === 'start' ? label : null}
      <span className="salmon-rating-items" {...hover}>
        <Items props={props} value={value} count={count} half={half} radios={radios} exact={false} />
      </span>
      {placement === 'bottom' || placement === 'end' ? label : null}
      {inline ? clear : null}
    </ChoiceGroupFrame>
  );
}
