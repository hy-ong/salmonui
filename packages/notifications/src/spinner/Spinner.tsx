// Spinner. Server-safe: no hooks, no client
// code, one CSS animation from the shared keyframes (styles/motion-spin.css).
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';

/** Spinner metric set; a number is the diameter in pixels. */
export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /**
   * Accessible loading text. With a label the spinner is a
   * `role="status"` region carrying the visually hidden text; without one
   * it is decorative (`aria-hidden`), and the busy state belongs to its
   * container (`aria-busy`).
   */
  label?: string;
  /** `'sm'` (16 px), `'md'` (24 px, default), `'lg'` (32 px) or a diameter in pixels. */
  size?: SpinnerSize | number;
  /**
   * Shows the indicator (default `true`). With `children`,
   * `loading={false}` renders only the children, and `loading` keeps their
   * size while they are hidden and `inert`.
   */
  loading?: boolean;
  /** Covers the nearest positioned ancestor with a scrim and centers the indicator. */
  overlay?: boolean;
  /** Replaces the built-in ring. */
  indicator?: ReactNode;
  /** Content the spinner covers while `loading`; the wrapper gets `aria-busy`. */
  children?: ReactNode;
  /** The root element: the spinner `<span>`, or the wrapper `<div>` when `children` are given. */
  ref?: Ref<HTMLElement>;
}

/**
 * A loading indicator. `<Spinner label="Loading orders" />` announces its
 * label; `<Spinner loading={pending}>{content}</Spinner>` covers content while
 * `loading` is true.
 */
export function Spinner({ label, size = 'md', loading = true, overlay, indicator, children, className, style, ref, ...rest }: SpinnerProps) {
  // `own`: no children, so the spinner itself is the root and takes the DOM props.
  const own = children == null || children === false;
  const custom = typeof size === 'number' ? ({ '--salmon-spinner-size': `${size}px` } as CSSProperties) : undefined;
  const spinner = loading ? (
    <span
      {...(own ? rest : null)}
      ref={own ? ref : undefined}
      className={own && className ? `salmon-spinner ${className}` : 'salmon-spinner'}
      style={own ? { ...style, ...custom } : custom}
      data-size={custom ? undefined : size}
      data-overlay={overlay || !own ? '' : undefined}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
    >
      {indicator ?? <span className="salmon-spinner__ring" />}
      {label ? <span className="salmon-visually-hidden">{label}</span> : null}
    </span>
  ) : null;
  return own ? (
    spinner
  ) : (
    <div {...rest} ref={ref as Ref<HTMLDivElement>} className={className ? `salmon-spinner-container ${className}` : 'salmon-spinner-container'} style={style} data-loading={loading ? '' : undefined} aria-busy={loading || undefined}>
      <div className="salmon-spinner-content" inert={loading || undefined}>
        {children}
      </div>
      {spinner}
    </div>
  );
}
