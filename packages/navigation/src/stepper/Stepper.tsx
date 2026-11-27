'use client';

import { Children, createContext, use, useRef, useState, type FocusEvent, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type OlHTMLAttributes, type ReactElement, type ReactNode, type Ref } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV } from '@salmonui/core/internal/dev';
import { pressSource } from '@salmonui/core/internal/press';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';

/** Progress of a step. */
export type StepStatus = 'notStarted' | 'inProgress' | 'completed';
export type StepperSource = 'pointer' | 'keyboard' | 'touch';

/** Static texts of the Stepper. */
export interface StepperLocaleText {
  /** Shown under the label of an `optional` step. */
  readonly optional: string;
  /** Announced for an `invalid` step. */
  readonly invalid: string;
  /** Announced for a completed step. */
  readonly completed: string;
}

export const STEPPER_DEFAULT_LOCALE_TEXT: StepperLocaleText = Object.freeze({ optional: 'Optional', invalid: 'Error', completed: 'Completed' });

/** Second argument of `onValueChange` (frozen in development). */
export interface StepperChangeEvent {
  readonly source: StepperSource;
}

/** `onBeforeValueChange` event; `preventDefault()` cancels the change. */
export interface StepperBeforeChangeEvent {
  readonly value: number;
  readonly previousValue: number;
  readonly source: StepperSource;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `onStepClick` event. */
export interface StepClickEvent {
  readonly index: number;
  readonly source: StepperSource;
}

/** Context of `renderStep`. */
export interface StepRenderContext {
  readonly index: number;
  readonly status: StepStatus;
  readonly active: boolean;
  readonly label: ReactNode;
  readonly description: ReactNode;
  readonly icon: ReactNode;
  readonly optional: boolean;
  readonly invalid: boolean;
  readonly disabled: boolean;
}

export interface StepperProps extends Omit<OlHTMLAttributes<HTMLOListElement>, 'defaultValue' | 'onChange' | 'type'> {
  /** `Step` children (direct children or arrays of them). */
  children?: ReactNode;
  /** Active step, 0-based. */
  value?: number | undefined;
  defaultValue?: number | undefined;
  onValueChange?: ((value: number, event: StepperChangeEvent) => void) | undefined;
  /** Runs before a change; `event.preventDefault()` cancels it. */
  onBeforeValueChange?: ((event: StepperBeforeChangeEvent) => void) | undefined;
  /** A selectable step was clicked or activated with Enter / Space. */
  onStepClick?: ((event: StepClickEvent) => void) | undefined;
  /** Only earlier steps and the next one are selectable. */
  linear?: boolean | undefined;
  /** Steps are an indicator only: no buttons, no selection. */
  readOnly?: boolean | undefined;
  /** Default `'horizontal'`. */
  orientation?: 'horizontal' | 'vertical' | undefined;
  /** Label side relative to the indicator; logical. Default `'bottom'` horizontally, `'end'` vertically. */
  labelPlacement?: 'top' | 'bottom' | 'start' | 'end' | undefined;
  /** Replaces the default content of every step. */
  renderStep?: ((context: StepRenderContext) => ReactNode) | undefined;
  localeText?: Partial<StepperLocaleText> | undefined;
  ref?: Ref<HTMLOListElement> | undefined;
}

export interface StepProps extends Omit<HTMLAttributes<HTMLLIElement>, 'children'> {
  label?: ReactNode;
  description?: ReactNode;
  /** Replaces the step number in the indicator. */
  icon?: ReactNode;
  /** Shows the "Optional" text. */
  optional?: boolean | undefined;
  /** Not selectable (`aria-disabled`). */
  disabled?: boolean | undefined;
  /** Marks the step as failing validation (`data-invalid`, announced). */
  invalid?: boolean | undefined;
  /** Overrides the status derived from the Stepper `value`. */
  status?: StepStatus | undefined;
  /** Replaces the step's content; wins over `renderStep`. */
  children?: ReactNode;
  /**
   * Renders the step's trigger element (a `<button>`, or a `<span>` when the
   * Stepper is read-only) with the computed props; spread them. Composes a
   * `Tooltip` around the step without the Stepper importing it.
   */
  render?: ((props: StepTriggerProps) => ReactElement) | undefined;
  ref?: Ref<HTMLLIElement> | undefined;
}

/** Props `Step` computes for its trigger (`render`); none of them is a focus or pointer handler. */
export interface StepTriggerProps {
  readonly className: string;
  readonly children: ReactNode;
  readonly type?: 'button';
  readonly tabIndex?: number;
  readonly 'aria-disabled'?: true;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
}

interface StepperState {
  readonly value: number;
  readonly linear: boolean;
  readonly readOnly: boolean;
  readonly tabStop: number;
  readonly text: StepperLocaleText;
  readonly renderStep: StepperProps['renderStep'];
  select(index: number, source: StepperSource): void;
  focused(index: number): void;
}

const StepperContext = createContext<StepperState | null>(null);
const StepIndexContext = createContext(0);
const STEP = '.salmon-stepper-step-button';

const freeze = <T extends object>(object: T): T => (DEV ? Object.freeze(object) : object);
const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** Status of step `index` when `status` is unset: before, at or after the active step. */
export function stepStatus(index: number, value: number): StepStatus {
  return index < value ? 'completed' : index === value ? 'inProgress' : 'notStarted';
}

/** Whether `linear` allows selecting `index` from `value`. */
export function linearAllows(index: number, value: number): boolean {
  return index <= value + 1;
}

/**
 * A step indicator: an `<ol>` of `Step`s; the active step has
 * `aria-current="step"`. Selectable steps are buttons with one tab stop
 * (arrows by orientation, mirrored in RTL, Home / End). `.salmon-stepper`
 * with `data-orientation`, `data-label-placement`. `ref` is the `<ol>`.
 */
export function Stepper(props: StepperProps): ReactElement {
  const {
    children,
    value,
    defaultValue,
    onValueChange,
    onBeforeValueChange,
    onStepClick,
    linear = false,
    readOnly = false,
    orientation = 'horizontal',
    labelPlacement = orientation === 'vertical' ? 'end' : 'bottom',
    renderStep,
    localeText,
    className,
    onKeyDown,
    ref,
    ...rest
  } = props;
  const [current, propose] = useControllableState<number, [StepperChangeEvent]>(value, defaultValue ?? 0, onValueChange, 'Stepper value');
  const [focus, setFocus] = useState<number | null>(null);
  const root = useRef<HTMLOListElement | null>(null);
  const text = { ...STEPPER_DEFAULT_LOCALE_TEXT, ...useLocaleText('stepper', localeText) };

  const select = (index: number, source: StepperSource): void => {
    onStepClick?.(freeze({ index, source }));
    if (index === current) return;
    if (onBeforeValueChange) {
      let prevented = false;
      onBeforeValueChange(
        freeze({
          value: index,
          previousValue: current,
          source,
          get defaultPrevented() {
            return prevented;
          },
          preventDefault() {
            prevented = true;
          },
        }),
      );
      if (prevented) return;
    }
    propose(index, onValueChange ? freeze({ source }) : (undefined as never));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLOListElement>): void => {
    onKeyDown?.(event);
    const el = root.current;
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || !el || !target.matches(STEP)) return;
    const move = rovingMove(event.key, { orientation, rtl: getComputedStyle(target).direction === 'rtl' });
    if (!move) return;
    const steps = [...el.querySelectorAll<HTMLElement>(STEP)];
    const next = steps[applyRovingMove(move, steps.length, steps.indexOf(target), (i) => steps[i]?.getAttribute('aria-disabled') !== 'true', false)];
    event.preventDefault();
    next?.focus();
  };

  const setRef = (node: HTMLOListElement | null): void => {
    root.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  const state: StepperState = { value: current, linear, readOnly, tabStop: focus ?? current, text, renderStep, select, focused: setFocus };
  return (
    <ol {...rest} ref={setRef} className={cx('salmon-stepper', className)} data-orientation={orientation} data-label-placement={labelPlacement} data-readonly={readOnly ? '' : undefined} onKeyDown={handleKeyDown}>
      <StepperContext value={state}>
        {Children.map(children, (child, index) => (
          <StepIndexContext value={index}>{child}</StepIndexContext>
        ))}
      </StepperContext>
    </ol>
  );
}

const check = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

/**
 * One step: `<li class="salmon-stepper-step">` with `data-status`,
 * `data-active`, `data-invalid`, `data-optional`, `data-disabled`; parts
 * `.salmon-stepper-step-button` (a `<span>` when read-only),
 * `.salmon-stepper-indicator`, `.salmon-stepper-label`,
 * `.salmon-stepper-description`. The connector to the next step is CSS.
 */
export function Step(props: StepProps): ReactElement {
  const { label, description, icon, optional = false, disabled: ownDisabled = false, invalid = false, status: ownStatus, children, render, className, onFocus, ref, ...rest } = props;
  const ctx = use(StepperContext);
  const index = use(StepIndexContext);
  const value = ctx?.value ?? 0;
  const active = index === value;
  const status = ownStatus ?? stepStatus(index, value);
  const text = ctx?.text ?? STEPPER_DEFAULT_LOCALE_TEXT;
  const disabled = ownDisabled || (!!ctx?.linear && !linearAllows(index, value));
  const content =
    children ??
    ctx?.renderStep?.({ index, status, active, label, description, icon, optional, invalid, disabled }) ?? (
      <>
        <span className="salmon-stepper-indicator" aria-hidden="true">
          {icon ?? (invalid ? '!' : status === 'completed' ? check : index + 1)}
        </span>
        {label != null || optional || description != null ? (
          <span className="salmon-stepper-text">
            {label != null ? <span className="salmon-stepper-label">{label}</span> : null}
            {description != null ? <span className="salmon-stepper-description">{description}</span> : null}
            {optional ? <span className="salmon-stepper-optional">{text.optional}</span> : null}
          </span>
        ) : null}
      </>
    );
  const announce = invalid ? text.invalid : status === 'completed' ? text.completed : null;
  const inner = (
    <>
      {content}
      {announce ? <span className="salmon-stepper-status">{announce}</span> : null}
    </>
  );
  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    if (!disabled) ctx?.select(index, pressSource(event));
  };
  // Focus is tracked on the <li> (focus events bubble), so the trigger props carry no focus handler to merge.
  const handleFocus = (event: FocusEvent<HTMLLIElement>): void => {
    onFocus?.(event);
    if (!ctx?.readOnly) ctx?.focused(index);
  };
  const trigger: StepTriggerProps = ctx?.readOnly
    ? { className: 'salmon-stepper-step-button', children: inner }
    : { type: 'button', className: 'salmon-stepper-step-button', tabIndex: index === ctx?.tabStop ? 0 : -1, 'aria-disabled': disabled ? true : undefined, onClick: handleClick, children: inner } as StepTriggerProps;
  return (
    <li
      {...rest}
      ref={ref}
      className={cx('salmon-stepper-step', className)}
      aria-current={active ? 'step' : undefined}
      data-status={status}
      data-active={active ? '' : undefined}
      data-invalid={invalid ? '' : undefined}
      data-optional={optional ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      onFocus={handleFocus}
    >
      {render ? render(trigger) : ctx?.readOnly ? <span {...trigger} /> : <button {...trigger} />}
    </li>
  );
}
