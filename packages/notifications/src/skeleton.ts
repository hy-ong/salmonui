import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/notifications/skeleton`: server-safe, so
// it has no "use client" directive and renders in React Server Components
// (server:boundary:check).
export { Skeleton } from './skeleton/Skeleton.js';
export type { SkeletonAnimation, SkeletonProps, SkeletonShape } from './skeleton/Skeleton.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/notifications/skeleton', 'salmon-skeleton');
