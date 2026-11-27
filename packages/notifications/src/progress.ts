import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/notifications/progress`: `Progress` and
// `Meter` share the CSS and SVG code. Server-safe, so it has no "use client"
// directive and renders in React Server Components (server:boundary:check).
export { Meter, Progress } from './progress/Progress.js';
export type { MeterProps, ProgressAccessibleName, ProgressProps, ProgressShape, ProgressSize, ProgressTone, ProgressValueContext } from './progress/Progress.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/notifications/progress', 'salmon-progress');
