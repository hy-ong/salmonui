// `@salmonui/charts/chart/features`: feature values for the
// `features` prop of `Chart`. `polar` is the opt-in polar and radar layout
// (a chart without it never loads the code); `interactions` makes
// zoom, pan, range and lasso selection and point drag ready on the first
// pointer event instead of loading their lazy chunk after hydration.

import { createInteractions } from './interact.js';
import { buildPolarModel } from './polar.js';

export const polar = { name: 'polar' as const, layout: buildPolarModel };
export const interactions = { name: 'interactions' as const, create: createInteractions };
