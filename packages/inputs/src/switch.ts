'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/switch`:
// a native checkbox with role="switch". CSS: `@salmonui/inputs/switch/styles.css`.
export { Switch } from './switch/Switch.js';
export type { CheckedChangeDetails, LabelPlacement, SwitchProps } from './switch/Switch.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/switch', 'salmon-toggle-switch');
