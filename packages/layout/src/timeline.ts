import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/layout/timeline`: Timeline and TimelineItem. Server-safe: no 'use client' and no hooks in the graph.
export { Timeline, TimelineItem } from './timeline/Timeline.js';
export type { TimelineProps, TimelineItemProps, TimelineItemData, TimelineTone } from './timeline/Timeline.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/layout/timeline', 'salmon-timeline');
