import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/layout/card`: Card and its parts.
// Server-safe: no 'use client' and no hooks in the whole graph, so the parts
// render in React Server Components.
export { Card, CardHeader, CardTitle, CardDescription, CardMedia, CardBody, CardActions, CardSeparator } from './card/Card.js';
export type { CardProps, CardRenderProps, CardHeaderProps, CardTitleProps, CardMediaProps, CardActionsProps } from './card/Card.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/layout/card', 'salmon-card');
