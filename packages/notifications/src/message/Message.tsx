// Message: page content, optionally inside a
// live region. Render-safe: this module is not "use client" and calls no
// hooks; the close button is the client island in ./Dismiss.tsx.
import type { HTMLAttributes, MouseEvent, ReactElement, ReactNode, Ref } from 'react';
import { MessageDismiss } from './Dismiss.js';

/** Color role: the neutral scale plus the five theme seeds. */
export type MessageTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';
/** Visual weight. */
export type MessageVariant = 'soft' | 'outline' | 'solid';

/** Strings of `Message`. */
export interface MessageLocaleText {
  /** Accessible name of the close button. Default `"Dismiss"`. */
  dismiss: string;
}

export interface MessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The message content. */
  children?: ReactNode;
  /** Color role. Default `'neutral'`. */
  tone?: MessageTone | undefined;
  /** Visual weight. Default `'soft'`. */
  variant?: MessageVariant | undefined;
  /** Heading line above the content. */
  title?: ReactNode;
  /** Replaces the built-in tone icon; `false` hides it. Always decorative. */
  icon?: ReactNode | false;
  /** Actions after the content, usually a `Button`. */
  action?: ReactNode;
  /** Shows the close button; the application then hides or unmounts the message. */
  onDismiss?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** Hides the message; with `live` the live region stays mounted. */
  hidden?: boolean | undefined;
  /** Inline alignment of the content. Default `'start'`. */
  align?: 'start' | 'center' | 'end' | undefined;
  /**
   * Announce the message: `'polite'` renders it in a `role="status"`
   * region, `'assertive'` in `role="alert"`. Default `false`: static page
   * content, not announced on load.
   */
  live?: 'polite' | 'assertive' | false | undefined;
  /** Overrides of the built-in strings. */
  localeText?: Partial<MessageLocaleText> | undefined;
  /** The message element. */
  ref?: Ref<HTMLDivElement> | undefined;
}

// 16x16 stroke glyphs drawn inside a circle; info for neutral, primary, info.
const GLYPH: Partial<Record<MessageTone, string>> = { success: 'M5 8l2 2 4-4', warning: 'M8 4.5v4m0 2.5v.5', danger: 'M6 6l4 4m0-4-4 4' };

/**
 * Message. Styling hooks: `.salmon-message` with `data-tone`,
 * `data-variant`, `data-align`; parts `.salmon-message-icon`, `-body` (the
 * title and the children), `-title`, `-action`, `-dismiss`; `.salmon-message-live` is the
 * live region wrapper. To fit the 0.75 KB budget a `data-*` hook is written
 * only when its prop is set; the stylesheet applies the defaults.
 */
export function Message(props: MessageProps): ReactElement {
  const { children, tone, variant, title, icon, action, onDismiss, hidden, align, live, localeText, className, ...rest } = props;
  const message = (
    <div
      {...rest}
      className={className ? `salmon-message ${className}` : 'salmon-message'}
      data-tone={tone}
      data-variant={variant}
      data-align={align}
      hidden={hidden}
    >
      {icon === false ? null : (
        <span className="salmon-message-icon" aria-hidden="true">
          {icon ?? (
            <svg viewBox="0 0 16 16">
              <path d={`M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0${(tone && GLYPH[tone]) || 'M8 7.5v4m0-6.5v.5'}`} />
            </svg>
          )}
        </span>
      )}
      <div className="salmon-message-body">
        {title ? <div className="salmon-message-title">{title}</div> : null}
        {children}
      </div>
      {action ? <div className="salmon-message-action">{action}</div> : null}
      {onDismiss ? <MessageDismiss text={localeText} onDismiss={onDismiss} /> : null}
    </div>
  );
  // The region exists before (and after) the message, so inserting or
  // un-hiding the message is announced (live-region.ts; its
  // `liveRegionProps`, written inline to fit the budget).
  return live ? (
    <div className="salmon-message-live" role={live === 'assertive' ? 'alert' : 'status'} aria-live={live} aria-atomic="true">
      {hidden ? null : message}
    </div>
  ) : (
    message
  );
}
