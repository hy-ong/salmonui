'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/stepper`: Stepper and Step.
// Render-safe: browser APIs only in event handlers.
export { Stepper, Step, STEPPER_DEFAULT_LOCALE_TEXT } from './stepper/Stepper.js';
export type { StepperProps, StepProps, StepTriggerProps, StepStatus, StepperSource, StepperLocaleText, StepperChangeEvent, StepperBeforeChangeEvent, StepClickEvent, StepRenderContext } from './stepper/Stepper.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/stepper', 'salmon-stepper');
