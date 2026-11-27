'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/slider`: single and range sliders on
// visually hidden native range inputs. CSS: `@salmonui/inputs/slider/styles.css`.
export { Slider } from './slider/Slider.js';
export type { SliderChangeDetails, SliderLimits, SliderLocaleText, SliderProps, SliderScalar, SliderTickContext, SliderTicks, SliderValue, SliderValueLabel, SliderValueOf } from './slider/Slider.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/slider', 'salmon-slider');
