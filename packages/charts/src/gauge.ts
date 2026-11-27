'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/gauge`: circular
// and linear gauges sharing one data model (`shape="circular" | "linear"`).
export { Gauge } from './gauge/Gauge.js';
export { GaugeAxis, GaugePointer } from './gauge/layout.js';
export type {
  GaugeApi, GaugeChangeEvent, GaugeChangeSource, GaugeExportOptions, GaugeLegendOptions, GaugePointerValueChange, GaugeProps, GaugeRangeChange, GaugeText, GaugeTooltipContext, GaugeTooltipTarget,
} from './gauge/Gauge.js';
export type {
  GaugeAnnotation, GaugeContainer, GaugeDirection, GaugeLabels, GaugeMarkerShape, GaugePointerType, GaugeRange, GaugeShape, GaugeTickPosition, GaugeTicks,
} from './gauge/layout.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/gauge', 'salmon-gauge');
