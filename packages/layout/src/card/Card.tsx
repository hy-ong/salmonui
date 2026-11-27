// Card: plain elements with classes,
// no hooks, no context, no 'use client', so every part renders in React
// Server Components. The parts are typed wrappers over the card classes.

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** Props `Card` computes for its root (spread them in `render`). */
export type CardRenderProps = HTMLAttributes<HTMLElement> & { readonly 'data-orientation': 'vertical' | 'horizontal' };

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `'vertical'` (default) stacks the parts; `'horizontal'` puts media and content side by side. */
  readonly orientation?: 'vertical' | 'horizontal' | undefined;
  /** Renders another root element (`<article>`, a link) with the computed props. Default `<div>`. */
  readonly render?: ((props: CardRenderProps) => ReactElement) | undefined;
}

/** Card root (`.salmon-card`). */
export function Card(props: CardProps): ReactElement {
  const { orientation = 'vertical', render, className, ...rest } = props;
  const computed: CardRenderProps = { ...rest, className: cx('salmon-card', className), 'data-orientation': orientation };
  return render ? render(computed) : <div {...computed} />;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Leading media (an `Avatar`, an `<img>`, an icon) before the caption. */
  readonly media?: ReactNode;
}

/** Header (`.salmon-card-header`): optional `media` and a caption holding the title and description. */
export function CardHeader(props: CardHeaderProps): ReactElement {
  const { media, className, children, ...rest } = props;
  return (
    <div {...rest} className={cx('salmon-card-header', className)}>
      {media === undefined ? null : <div className="salmon-card-header-media">{media}</div>}
      <div className="salmon-card-header-caption">{children}</div>
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level. Default 3. */
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
}

/** Title (`.salmon-card-title`), a heading (`<h3>` by default). */
export function CardTitle({ level = 3, ...props }: CardTitleProps): ReactElement {
  return part(`h${level}`, 'title', props);
}

/** Subtitle / description (`.salmon-card-description`, a `<p>`). */
export function CardDescription(props: HTMLAttributes<HTMLParagraphElement>): ReactElement {
  return part('p', 'description', props);
}

/** A plain part element: `<Tag class="salmon-card-<name> ...">`. */
function part(Tag: 'p' | 'div' | 'hr' | `h${number}`, name: string, props: HTMLAttributes<HTMLElement>): ReactElement {
  const T = Tag as 'div';
  return <T {...props} className={cx(`salmon-card-${name}`, props.className)} />;
}

export interface CardMediaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Text overlaid on the bottom of the media. */
  readonly title?: ReactNode;
}

/** Full-bleed media slot (`.salmon-card-media`): put an `<img>` or `<video>` inside; `title` overlays it. */
export function CardMedia(props: CardMediaProps): ReactElement {
  const { title, className, children, ...rest } = props;
  return (
    <div {...rest} className={cx('salmon-card-media', className)}>
      {children}
      {title === undefined ? null : <div className="salmon-card-media-title">{title}</div>}
    </div>
  );
}

/** Content (`.salmon-card-body`). */
export function CardBody(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return part('div', 'body', props);
}

export interface CardActionsProps extends HTMLAttributes<HTMLDivElement> {
  /** `'horizontal'` (default) or `'vertical'` (stacked full-width actions). */
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
}

/** Action area (`.salmon-card-actions`) for `Button` elements. */
export function CardActions(props: CardActionsProps): ReactElement {
  const { orientation = 'horizontal', ...rest } = props;
  return part('div', 'actions', { ...rest, 'data-orientation': orientation } as HTMLAttributes<HTMLElement>);
}

/** Separator (`.salmon-card-separator`, an `<hr>`). */
export function CardSeparator(props: HTMLAttributes<HTMLHRElement>): ReactElement {
  return part('hr', 'separator', props);
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Media = CardMedia;
Card.Body = CardBody;
Card.Actions = CardActions;
Card.Separator = CardSeparator;
