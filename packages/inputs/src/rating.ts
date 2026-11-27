'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/rating`: native radios drawn as stars.
// CSS: `@salmonui/inputs/rating/styles.css`.
export { Rating } from './rating/Rating.js';
export type { RatingChangeDetails, RatingItemState, RatingLocaleText, RatingProps } from './rating/Rating.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/rating', 'salmon-rating');
