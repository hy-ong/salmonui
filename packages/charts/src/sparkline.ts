'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/sparkline`:
// Sparkline. Never reaches the axis, legend, tooltip-layer or canvas code of
// the other visualization families.
// CSS: `@salmonui/charts/sparkline/styles.css`.
export { Sparkline } from './sparkline/Sparkline.js';
export type {
  SparklineBand,
  SparklineCanvasRenderer,
  SparklineHighlight,
  SparklinePoint,
  SparklinePointEvent,
  SparklinePointKind,
  SparklinePointStyle,
  SparklineProps,
  SparklineTooltipOptions,
  SparklineType,
} from './sparkline/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/sparkline', 'salmon-sparkline');
