// Skeleton. Server-safe: no hooks, no client
// code. The wave is the Data Grid skeleton-row shimmer (one keyframes
// definition, styles/shimmer.css); skeletons are always `aria-hidden`
// because the busy state belongs to the loading container.
import type { HTMLAttributes, ReactNode, Ref } from 'react';

export type SkeletonShape = 'text' | 'circle' | 'rect';
export type SkeletonAnimation = 'wave' | 'pulse' | false;

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** `'text'` (default, a line of text height), `'circle'` or `'rect'`. */
  shape?: SkeletonShape;
  /** Text lines (`shape="text"`); the last of several lines is shorter. */
  lines?: number;
  /** Inline size: a number of pixels or any CSS length. */
  width?: number | string;
  /** Block size: a number of pixels or any CSS length. */
  height?: number | string;
  /**
   * `'wave'` (default, the transform-only shimmer shared with the Data Grid
   * skeleton rows), `'pulse'` (opacity) or `false` (static). Every animation
   * stops under `prefers-reduced-motion`.
   */
  animation?: SkeletonAnimation;
  /**
   * Shows the placeholder (default `true`). With `children`,
   * `loading={false}` renders only the children and `loading` sizes the
   * placeholder from them while they are hidden and `inert`.
   */
  loading?: boolean;
  /** Content the placeholder stands in for. */
  children?: ReactNode;
  /** The root `<span>`. */
  ref?: Ref<HTMLSpanElement>;
}

/** A placeholder shape shown while content loads. */
export function Skeleton({ shape = 'text', lines = 1, width, height, animation = 'wave', loading = true, children, className, style, ref, ...rest }: SkeletonProps): ReactNode {
  const content = children != null && children !== false;
  if (!loading) return content ? children : null;
  const count = shape === 'text' && !content && lines > 1 ? lines : 0;
  return (
    <span
      {...rest}
      ref={ref}
      className={className ? `salmon-skeleton ${className}` : 'salmon-skeleton'}
      style={{ inlineSize: width, blockSize: height, ...style }}
      data-shape={shape}
      data-animation={animation || 'none'}
      data-lines={count || undefined}
      data-content={content ? '' : undefined}
      aria-hidden
    >
      {content ? (
        <span className="salmon-skeleton__content" inert>
          {children}
        </span>
      ) : (
        Array.from({ length: count }, (_, i) => <span key={i} className="salmon-skeleton__line" />)
      )}
    </span>
  );
}
