'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/overlays/popover`: Popover and its parts.
// Render-safe: the trigger renders on the server; content mounts only while
// open, after hydration.
export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription, PopoverClose } from './popover/Popover.js';
export type {
  PopoverProps,
  PopoverTriggerProps,
  PopoverTriggerRenderProps,
  PopoverContentProps,
  PopoverTitleProps,
  PopoverDescriptionProps,
  PopoverCloseProps,
  PopoverCloseRenderProps,
  PopoverOpenChangeEvent,
  PopoverOpenChangeReason,
  PopoverPlacement,
  PopoverOffset,
} from './popover/Popover.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/overlays/popover', 'salmon-popover');
