// The theme density for components whose metrics are JavaScript numbers (the
// Data Grid row and header heights). A separate module so
// a consumer carries one context, not the theme derivation. `ThemeProvider`
// provides it only when its theme sets `density`; unset inherits.

import { createContext } from 'react';

/** `true` under a `density: 'compact'` scope. */
export const CompactDensityContext = createContext(false);
