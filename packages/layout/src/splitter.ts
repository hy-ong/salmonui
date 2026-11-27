'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/layout/splitter`: Splitter and SplitterPane. Render-safe: the server render has the final layout; pointer
// and keyboard resizing start after hydration.
export { Splitter, SplitterPane } from './splitter/Splitter.js';
export type { SplitterProps, SplitterPaneProps, SplitterSize, SplitterCollapseEvent, SplitterLocaleText } from './splitter/Splitter.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/layout/splitter', 'salmon-splitter');
