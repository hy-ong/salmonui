'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/range-selector`:
// RangeSelector and PeriodSelector. CSS: `@salmonui/charts/range-selector/styles.css`
// (PeriodSelector also needs `@salmonui/buttons/button/styles.css`).

export { RangeSelector } from './range-selector/RangeSelector.js';
export type { RangeChangeEvent, RangeSelectorApi, RangeSelectorProps, RangeValue } from './range-selector/RangeSelector.js';
export type { RangeSeries } from './range-selector/model.js';
export { PeriodSelector } from './range-selector/PeriodSelector.js';
export type { PeriodSelectorProps } from './range-selector/PeriodSelector.js';
export { periodRange } from './range-selector/period.js';
export type { Period, PeriodUnit } from './range-selector/period.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/range-selector', 'salmon-range-selector');
