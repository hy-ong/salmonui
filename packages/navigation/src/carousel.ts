'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/carousel`: Carousel and CarouselSlide.
// Render-safe: browser APIs only in effects and event handlers. Imports internal modules only.
export { Carousel, CarouselSlide, CAROUSEL_DEFAULT_LOCALE_TEXT } from './carousel/Carousel.js';
export type {
  CarouselApi,
  CarouselAutoPlay,
  CarouselBeforeIndexChangeEvent,
  CarouselButtonContext,
  CarouselChangeSource,
  CarouselControls,
  CarouselEffect,
  CarouselIndexChangeEvent,
  CarouselIndicatorContext,
  CarouselIndicators,
  CarouselLocaleText,
  CarouselPlayButtonContext,
  CarouselPlayingChangeEvent,
  CarouselProps,
  CarouselSlideProps,
} from './carousel/Carousel.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/carousel', 'salmon-carousel');
