import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/layout/list`: List and ListItem, the display list. Server-safe: no 'use client' and no hooks in the graph.
export { List, ListItem } from './list/List.js';
export type { ListProps, ListItemProps } from './list/List.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/layout/list', 'salmon-list');
