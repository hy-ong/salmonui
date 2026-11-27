import { expectStylesheet } from '@salmonui/core/internal/dev';
// @salmonui/notifications/badge. Server-safe: no
// "use client", no hooks, no browser globals in this graph.
export { Badge } from './badge/Badge.js';
export type { BadgeInlineProps, BadgeOverlap, BadgeOverlayProps, BadgePlacement, BadgeProps, BadgeRenderProps, BadgeShape, BadgeTone, BadgeVariant } from './badge/Badge.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/notifications/badge', 'salmon-badge');
