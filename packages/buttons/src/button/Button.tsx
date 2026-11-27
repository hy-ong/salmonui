'use client';

import { use, useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { usePressRepeat } from '@salmonui/core/internal/press';
import { ButtonGroupContext, compose, type ButtonRepeatEvent, type ButtonRepeatOptions, type ButtonSize, type ButtonTone, type ButtonVariant } from './context.js';

/** Where a `floating` button sits; logical, mirrored in RTL. `true` means `'bottomEnd'`. */
export type ButtonFloatingPosition = 'topStart' | 'topCenter' | 'topEnd' | 'middleStart' | 'middleCenter' | 'middleEnd' | 'bottomStart' | 'bottomCenter' | 'bottomEnd';

/**
 * Props `render` receives: class names,
 * `data-*` hooks, ARIA attributes, handlers, `ref` and `children`. Spread
 * all of them onto the returned element. `ref` is typed to spread onto any
 * element; it receives the rendered element.
 */
export type ButtonRenderProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<never> | undefined;
  [dataAttribute: `data-${string}`]: string | number | undefined;
};

/** An icon-only button needs an accessible name. */
export type ButtonAccessibleName = { 'aria-label': string } | { 'aria-labelledby': string };

export interface ButtonBaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'> {
  children?: ReactNode;
  /** Visual weight. Default `'solid'` (or the group's). */
  variant?: ButtonVariant | undefined;
  /** Color role. Default `'neutral'`; `'primary'` for a `floating` button (or the group's). */
  tone?: ButtonTone | undefined;
  /** Metric set. Default `'md'` (or the group's). */
  size?: ButtonSize | undefined;
  /** Decorative icon before the label (inline-start; follows `dir`). */
  iconStart?: ReactNode;
  /** Decorative icon after the label (inline-end; follows `dir`). */
  iconEnd?: ReactNode;
  /** Square metrics for a button that shows only an icon; requires `aria-label` or `aria-labelledby`. */
  iconOnly?: boolean | undefined;
  /** Shows a spinner, sets `aria-busy` and `aria-disabled` (focus is kept) and ignores activation. */
  loading?: boolean | undefined;
  /** Visually hidden text appended to the name while `loading`. Default `"Loading"`. */
  loadingLabel?: string | undefined;
  /** Replaces the built-in spinner graphic. */
  spinner?: ReactNode;
  /** Progress fill from inline-start, 0 to 100. No spinner unless `loading`. */
  progress?: number | undefined;
  /** Visually hidden progress text appended to the name. Default `` `${value}%` ``. */
  progressLabel?: ((value: number) => string) | undefined;
  /** Floating action button: circular, elevated, positioned by CSS. */
  floating?: boolean | ButtonFloatingPosition | undefined;
  /** `'viewport'` (default, `position: fixed`) or `'parent'` (`position: absolute` in the nearest positioned ancestor). */
  floatingScope?: 'viewport' | 'parent' | undefined;
  /** Press-and-hold repeat. */
  repeat?: boolean | ButtonRepeatOptions | undefined;
  /** Each repeat while held; the first activation is the native `onClick`. */
  onRepeat?: ((event: ButtonRepeatEvent) => void) | undefined;
  /** Renders another element (a link, a router link) with the computed props. */
  render?: ((props: ButtonRenderProps) => ReactElement) | undefined;
  /** The `<button>` (or the element `render` returns). */
  ref?: Ref<HTMLButtonElement> | undefined;
}

export type ButtonProps = ButtonBaseProps & ({ iconOnly?: false | undefined } | ({ iconOnly: true } & ButtonAccessibleName));

const prevent = (event: MouseEvent) => event.preventDefault();

/**
 * Button (APG Button, native `<button>`). `type` defaults to `"button"`.
 * Styling hooks: `.salmon-button` with `data-variant`, `data-tone`,
 * `data-size`, `data-icon-only`, `data-loading`, `data-progress`,
 * `data-floating`.
 */
export function Button(props: ButtonProps): ReactElement {
  const group = use(ButtonGroupContext);
  const {
    children,
    variant,
    tone,
    size,
    iconStart,
    iconEnd,
    iconOnly,
    loading,
    loadingLabel = 'Loading',
    spinner,
    progress,
    progressLabel,
    floating,
    floatingScope,
    repeat,
    onRepeat,
    render,
    className,
    style,
    disabled,
    type,
    onClick,
    ref,
    ...rest
  } = props;
  const isDisabled = disabled ?? group?.disabled ?? false;
  const repeating = Boolean(repeat) && !loading && !isDisabled;
  const options = typeof repeat === 'object' ? repeat : {};
  const count = useRef(0);
  // internal/press.ts fires on press and on every repeat; the press itself
  // stays the native click, so only repeats reach onRepeat.
  const press = usePressRepeat<HTMLElement>({
    onPress: (source, repeated) => {
      count.current = repeated ? count.current + 1 : 0;
      if (repeated) onRepeat?.(Object.freeze({ count: count.current, source }));
    },
    delay: options.delay,
    interval: options.interval ?? 100,
    disabled: !repeating,
  });
  const named = rest['aria-label'] || rest['aria-labelledby'];
  useEffect(() => {
    if (DEV && iconOnly && !named) warnOnce('button-icon-only-name', 'Button: an iconOnly button needs aria-label or aria-labelledby.');
  }, [iconOnly, named]);
  const position = floating === true ? 'bottomEnd' : floating || undefined;
  const value = progress === undefined ? undefined : Math.min(100, Math.max(0, progress));
  const inert = loading || (render !== undefined && isDisabled);
  const own: ButtonRenderProps & ButtonHTMLAttributes<HTMLButtonElement> = {
    ...rest,
    ref: ref as Ref<never> | undefined,
    className: className ? `salmon-button ${className}` : 'salmon-button',
    style: value === undefined ? style : ({ ...style, '--salmon-button-progress': `${value}%` } as CSSProperties),
    'data-variant': variant ?? group?.variant ?? 'solid',
    'data-tone': tone ?? group?.tone ?? (position ? 'primary' : 'neutral'),
    'data-size': size ?? group?.size ?? 'md',
    'data-icon-only': iconOnly ? '' : undefined,
    'data-loading': loading ? '' : undefined,
    'data-progress': value,
    'data-floating': position,
    'data-floating-scope': position ? (floatingScope ?? 'viewport') : undefined,
    'aria-busy': loading || undefined,
    'aria-disabled': inert || rest['aria-disabled'],
    onClick: inert ? prevent : onClick,
  };
  if (repeating) {
    const handlers: Record<string, unknown> = {
      ...press,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const activation = event.key === 'Enter' || event.key === ' ';
        // The repeat timer drives a held key; OS key repeats would click again.
        if (activation && event.repeat) return event.preventDefault();
        press.onKeyDown(event);
        // The primitive cancels the key's native click; the first activation stays a click.
        if (activation && event.defaultPrevented) event.currentTarget.click();
      },
    };
    for (const key of Object.keys(handlers)) {
      (own as Record<string, unknown>)[key] = compose(rest[key as keyof typeof rest] as never, handlers[key] as never);
    }
  }
  own.children = (
    <>
      {loading ? (
        <span className="salmon-button__spinner" aria-hidden="true">
          {spinner}
        </span>
      ) : iconStart != null && iconStart !== false ? (
        <span className="salmon-button__icon" aria-hidden="true">
          {iconStart}
        </span>
      ) : null}
      {children != null && children !== false ? <span className="salmon-button__label">{children}</span> : null}
      {iconEnd != null && iconEnd !== false ? (
        <span className="salmon-button__icon" aria-hidden="true">
          {iconEnd}
        </span>
      ) : null}
      {loading ? <span className="salmon-button__sr">{` ${loadingLabel}`}</span> : null}
      {value !== undefined ? <span className="salmon-button__sr">{` ${progressLabel ? progressLabel(value) : `${value}%`}`}</span> : null}
    </>
  );
  if (render) {
    const element = render(own);
    // A link or a native button keeps its own role; any other element becomes a
    // focusable role="button" that Enter and Space activate.
    if (typeof element.type !== 'string' || element.type === 'a' || element.type === 'button') return element;
    return render({
      role: 'button',
      tabIndex: 0,
      ...own,
      onKeyDown: compose(own.onKeyDown, (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }),
    });
  }
  return <button {...own} ref={ref} type={type ?? 'button'} disabled={isDisabled} />;
}
