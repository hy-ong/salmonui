'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/pager`: the standalone Pager.
// Render-safe: browser APIs only in event handlers; no `@salmonui/data-grid/engine`.
export { Pager } from './pager/Pager.js';
export type {
  PagerProps,
  PagerSource,
  PagerPageChangeEvent,
  PagerBeforePageChangeEvent,
  PagerPageSizeChangeEvent,
  PagerBeforePageSizeChangeEvent,
  PagerRenderContext,
  PagerTemplateContext,
  PagerPageSizeContext,
  PagerPageSizeOption,
  PagerIcons,
} from './pager/Pager.js';
export { PAGER_DEFAULT_LOCALE_TEXT } from './pager/locale.js';
export type { PagerLocaleText, PagerLocaleMessage } from './pager/locale.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/pager', 'salmon-pager');
