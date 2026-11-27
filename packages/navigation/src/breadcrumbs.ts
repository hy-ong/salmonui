'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/breadcrumbs`: Breadcrumbs and BreadcrumbItem.
// Render-safe: layout is
// read only in effects; the overflow measurer and the ellipsis menu (the
// Menu family) are lazy chunks.
export { Breadcrumbs, BreadcrumbItem, BREADCRUMBS_DEFAULT_LOCALE_TEXT } from './breadcrumbs/Breadcrumbs.js';
export type { BreadcrumbsProps, BreadcrumbItemProps, BreadcrumbItemRenderProps, BreadcrumbsItemClickEvent, BreadcrumbsLocaleText, BreadcrumbsOverflow } from './breadcrumbs/Breadcrumbs.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/breadcrumbs', 'salmon-breadcrumbs');
