'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/overlays/tooltip`: Tooltip and Tooltip.Provider. Render-safe: the trigger renders on the server; the content
// mounts only while open, after hydration.
export { Tooltip, TooltipProvider } from './tooltip/Tooltip.js';
export type { TooltipProps, TooltipProviderProps, TooltipTriggerProps, TooltipContentProps, TooltipPart, TooltipPlacement, TooltipOffset, TooltipOpenChangeEvent, TooltipOpenChangeReason } from './tooltip/Tooltip.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/overlays/tooltip', 'salmon-tooltip');
