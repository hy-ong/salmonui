// Avatar and AvatarGroup. Server
// friendly: no hooks here; the image error fallback is the client island in
// `./image.tsx`. The image is rendered first, layered over the initials, so
// cached images never flash and server and client markup match.

import { Children, type CSSProperties, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { AvatarImage } from './image.js';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'square' | 'circle';
export type AvatarTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';
/** `'soft'` (default): a tinted fill with tone text. `'solid'`: the tone fill with on-color text (neutral: gray with white). */
export type AvatarVariant = 'soft' | 'solid';

const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/**
 * Initials of a name: the first letter of the first and of the last word
 * (one letter for a single word), upper-cased for `locale`.
 */
export function initialsOf(name: string, locale?: string | readonly string[]): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = Array.from(words[0] as string)[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1] as string)[0] ?? '') : '';
  return (first + last).toLocaleUpperCase(locale as string | string[] | undefined);
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Image URL; layered over the initials and hidden when it fails to load. */
  readonly src?: string | undefined;
  /** Accessible name of the image (wins over `name`). */
  readonly alt?: string | undefined;
  /** Person or entity name: the initials and the accessible name. */
  readonly name?: string | undefined;
  /** Locale for upper-casing the initials (default: the runtime's default locale). */
  readonly locale?: string | readonly string[] | undefined;
  /** Content shown without initials (an icon), decorative. */
  readonly fallback?: ReactNode;
  /** Overrides the initials text. */
  readonly children?: ReactNode;
  /** A named size (default `'md'`) or a size in px, e.g. `22`; the initials scale with it. */
  readonly size?: AvatarSize | number | undefined;
  /** Default `'square'` (rounded rectangle). */
  readonly shape?: AvatarShape | undefined;
  /** Default `'neutral'`; colors come from the theme seeds. */
  readonly tone?: AvatarTone | undefined;
  /** Default `'soft'`; `'solid'` fills with the tone color. */
  readonly variant?: AvatarVariant | undefined;
}

/**
 * Avatar (`.salmon-avatar`, `data-size`, `data-shape`, `data-tone`, `data-variant`). With
 * `alt` or `name` it is an image (`role="img"`, `aria-label`); otherwise it
 * is decorative (`aria-hidden`), for use inside a labelled control.
 */
export function Avatar(props: AvatarProps): ReactElement {
  const { src, alt, name, locale, fallback, children, size = 'md', shape = 'square', tone = 'neutral', variant, className, style, ...rest } = props;
  const label = alt ?? name;
  const text = children ?? (name ? initialsOf(name, locale) : null) ?? fallback;
  const px = typeof size === 'number';
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
      style={px ? ({ '--salmon-avatar-size': `${size}px`, ...style } as CSSProperties) : style}
      className={cx('salmon-avatar', className)}
      data-size={px ? undefined : size}
      data-shape={shape}
      data-tone={tone}
      data-variant={variant === 'solid' ? variant : undefined}
    >
      <span className="salmon-avatar-fallback" aria-hidden="true">
        {text}
      </span>
      {src ? <AvatarImage src={src} className="salmon-avatar-image" /> : null}
    </span>
  );
}

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** `Avatar` children, stacked with an overlap. */
  readonly children?: ReactNode;
  /** Show at most this many avatars; the rest become one `+N` avatar. */
  readonly max?: number | undefined;
  /** Size (named or px) and shape of the `+N` avatar. Defaults `'md'` / `'circle'`. */
  readonly size?: AvatarSize | number | undefined;
  readonly shape?: AvatarShape | undefined;
  readonly localeText?: { readonly more?: ((count: number) => string) | undefined } | undefined;
}

/** Overlapping avatars (`.salmon-avatar-group`, `role="group"`) with a `+N` overflow avatar. */
export function AvatarGroup(props: AvatarGroupProps): ReactElement {
  const { children, max, size = 'md', shape = 'circle', localeText, className, ...rest } = props;
  const all = Children.toArray(children);
  const shown = max !== undefined && all.length > max ? all.slice(0, Math.max(0, max)) : all;
  const extra = all.length - shown.length;
  return (
    <div role="group" {...rest} className={cx('salmon-avatar-group', className)}>
      {shown}
      {extra > 0 ? (
        <Avatar size={size} shape={shape} alt={(localeText?.more ?? ((n: number) => `${n} more`))(extra)} className="salmon-avatar-overflow">
          {`+${extra}`}
        </Avatar>
      ) : null}
    </div>
  );
}

Avatar.Group = AvatarGroup;
