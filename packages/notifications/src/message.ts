import { expectStylesheet } from '@salmonui/core/internal/dev';
// @salmonui/notifications/message. Render-safe, not
// "use client": the only client code is the dismiss button island.
export { Message } from './message/Message.js';
export type { MessageLocaleText, MessageProps, MessageTone, MessageVariant } from './message/Message.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/notifications/message', 'salmon-message');
