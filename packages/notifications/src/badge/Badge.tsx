// Badge: one server-safe component with two modes.
// No "use client", no hooks, no browser globals anywhere in this graph
// (server:boundary:check), so a React Server Component renders it as is.
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';

/** Color role: the neutral scale plus the five theme seeds. */
export type BadgeTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';
/**
 * Visual weight. `'dot'` (inline mode only) is a status label: a small
 * decorative dot in the tone color before plain text, as in a table cell.
 */
export type BadgeVariant = 'soft' | 'solid' | 'outline' | 'dot';
/** Corner shape. */
export type BadgeShape = 'rounded' | 'pill' | 'circle';
/** Corner of the host an overlay badge sits on; logical, mirrored under `dir="rtl"`. */
export type BadgePlacement = 'topEnd' | 'topStart' | 'bottomEnd' | 'bottomStart';
/** `'circular'` pulls the overlay inward for round hosts such as avatars. */
export type BadgeOverlap = 'rectangular' | 'circular';

/**
 * Props `render` receives: class name,
 * `data-*` hooks, `style`, every other DOM prop, `ref` and `children`.
 * Spread all of them onto the returned element.
 */
export type BadgeRenderProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<never> | undefined;
  [dataAttribute: `data-${string}`]: string | number | undefined;
};

interface BadgeCommonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content' | 'children'> {
  /** Color role. Default `'neutral'`. */
  tone?: BadgeTone | undefined;
  /** Corner shape. Default `'rounded'` inline, `'pill'` for overlay badges. */
  shape?: BadgeShape | undefined;
  /** The root element: the badge inline, the host wrapper in overlay mode. */
  ref?: Ref<HTMLSpanElement> | undefined;
}

/** Inline mode: `children` is the badge text. */
export interface BadgeInlineProps extends BadgeCommonProps {
  /** Visual weight. Default `'soft'`; `'dot'` is a status dot before the text (the dot is decorative, the text carries the meaning). */
  variant?: BadgeVariant | undefined;
  /** The badge text. */
  children?: ReactNode;
  /** Renders another element (a link, a router link) with the computed props. */
  render?: ((props: BadgeRenderProps) => ReactElement) | undefined;
  content?: never;
  dot?: false | undefined;
  max?: never;
  placement?: never;
  overlap?: never;
  invisible?: never;
  label?: never;
  locale?: never;
}

interface BadgeOverlayBase extends BadgeCommonProps {
  /** Visual weight. Default `'solid'`. */
  variant?: Exclude<BadgeVariant, 'dot'> | undefined;
  /** The host element the badge sits on (a button, an avatar, an icon). */
  children?: ReactNode;
  /** Numbers above `max` render as `` `${max}+` `` with locale digits. */
  max?: number | undefined;
  /** Corner of the host. Default `'topEnd'` (logical). */
  placement?: BadgePlacement | undefined;
  /** Default `'rectangular'`; `'circular'` for round hosts. */
  overlap?: BadgeOverlap | undefined;
  /** Hides and silences the badge without changing layout. */
  invisible?: boolean | undefined;
  /** Locale for number digits. Default `'en-US'`, so server and client agree. */
  locale?: string | undefined;
  render?: undefined;
}

/**
 * Overlay mode, selected by the presence of the `content` or `dot` prop. `content` of `null`, `undefined`, `false` or `''` hides
 * the badge like `invisible` (`0` shows).
 */
export type BadgeOverlayProps = BadgeOverlayBase &
  (
    | {
        /** The count or short text on the host. */
        content: ReactNode;
        dot?: false | undefined;
        /** Accessible text that replaces the visible content for assistive technology, for example `"5 unread"`. */
        label?: string | undefined;
      }
    | {
        content?: undefined;
        /** A small dot without text; requires `label` (types enforce it). */
        dot: true;
        /** Accessible text for the dot, for example `"Online"` (required). */
        label: string;
      }
  );

export type BadgeProps = BadgeInlineProps | BadgeOverlayProps;

const cx = (system: string, className: string | undefined) => (className ? `${system} ${className}` : system);

/**
 * Badge. Inline (`<Badge tone="success">Paid</Badge>`) it is a text label,
 * or a status with `variant="dot"`; with `content` or `dot` it overlays its `children` at a logical corner.
 * Styling hooks: `.salmon-badge` with `data-tone`, `data-variant`,
 * `data-shape`, `data-dot`, `data-invisible`; overlay hosts are
 * `.salmon-badge-host` with `data-placement` and `data-overlap`. To fit the
 * 0.5 KB budget a `data-*` hook is written only when its prop is set; the
 * stylesheet applies the defaults when it is absent.
 */
export function Badge(props: BadgeProps): ReactElement {
  // `ref` and `style` stay in `rest` and reach the root through the spread.
  const { tone, variant, shape, children, className, content, dot, max, placement, overlap, invisible, label, locale, render, ...rest } = props as Omit<BadgeOverlayBase, 'render'> & {
    content?: ReactNode;
    dot?: boolean;
    label?: string;
    render?: BadgeInlineProps['render'];
  };
  const own = { 'data-tone': tone, 'data-variant': variant, 'data-shape': shape };
  if (!('content' in props || dot)) {
    const inline = { ...rest, className: cx('salmon-badge', className), ...own, children } as BadgeRenderProps;
    return render ? render(inline) : <span {...(inline as HTMLAttributes<HTMLSpanElement>)} />;
  }
  const hidden = invisible || !(dot || content || content === 0);
  // Locale digits, capped: 120 with max 99 is "99+". `toLocaleString`
  // instead of internal/format.ts `formatCount` keeps the subpath in budget.
  const cap = max ?? Infinity;
  return (
    <span {...rest} className={cx('salmon-badge-host', className)} data-placement={placement} data-overlap={overlap}>
      {children}
      <span className="salmon-badge" {...own} data-dot={dot || undefined} hidden={hidden} aria-hidden={label ? true : undefined}>
        {typeof content === 'number' ? content > cap ? `${cap.toLocaleString(locale ?? 'en-US')}+` : content.toLocaleString(locale ?? 'en-US') : content}
      </span>
      {label && !hidden ? <span className="salmon-visually-hidden">{label}</span> : null}
    </span>
  );
}
