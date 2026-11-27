'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/accordion`: Accordion and AccordionItem. Render-safe: browser APIs only in effects and handlers.
export { Accordion, AccordionItem } from './accordion/Accordion.js';
export type { AccordionProps, AccordionItemProps, AccordionChangeEvent, AccordionBeforeChangeEvent, AccordionSource } from './accordion/Accordion.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/accordion', 'salmon-accordion');
