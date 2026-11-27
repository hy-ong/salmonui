// Type contract of `@salmonui/notifications/badge` and `@salmonui/notifications/message`
// Compiles against dist/*.d.ts.
import { Badge, type BadgeProps } from '@salmonui/notifications/badge';
import { Message, type MessageProps } from '@salmonui/notifications/message';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

// inline mode with closed unions.
export const inline = <Badge tone="success" variant="outline" shape="pill">Paid</Badge>;
// @ts-expect-error unknown tone (no secondary / light / dark)
export const badTone = <Badge tone="secondary">x</Badge>;
// render spreads onto any element (inline mode only).
export const link = <Badge render={(props) => <a {...props} href="/docs" />}>Docs</Badge>;
// @ts-expect-error overlay-only props are not part of inline mode
export const inlineMax = <Badge max={99}>x</Badge>;

// overlay mode.
export const overlay = (
  <Badge content={120} max={99} placement="bottomStart" overlap="circular" label="120 unread" invisible={false}>
    <button type="button">Inbox</button>
  </Badge>
);
// @ts-expect-error placement is logical (no left / right)
export const badPlacement = <Badge content={1} placement="topRight">x</Badge>;
// @ts-expect-error render is inline-only
export const overlayRender = <Badge content={1} render={(props) => <a {...props} />}>x</Badge>;

// a dot requires a label (the types-first replacement of a dev warning).
export const dot = <Badge dot label="Online"><span>Ada</span></Badge>;
// @ts-expect-error dot without label
export const dotNoLabel = <Badge dot><span>Ada</span></Badge>;
// @ts-expect-error dot and content are exclusive
export const dotContent = <Badge dot label="x" content={1}><span>Ada</span></Badge>;

export const badgeProps: BadgeProps = { children: 'x' };

// Message props.
export const message = (
  <Message tone="danger" variant="solid" title={<b>Failed</b>} icon={false} align="center" live="assertive" hidden={false} action={<button type="button">Retry</button>} onDismiss={(event) => event.currentTarget.blur()} localeText={{ dismiss: 'Close' }}>
    Upload failed.
  </Message>
);
// @ts-expect-error unknown variant
export const badVariant = <Message variant="filled">x</Message>;
// @ts-expect-error live is polite, assertive or false
export const badLive = <Message live="off">x</Message>;
export const messageProps: MessageProps = { children: 'x', ref: null };
