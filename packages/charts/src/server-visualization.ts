// `@salmonui/charts/server`: server-safe like
// `@salmonui/core/server` (no hooks, effects, browser globals or CSS in its
// import graph), a separate entry so the theme-only `/server` entry keeps its
// budget. `visualizationSvg` turns the server-rendered HTML of a
// visualization into standalone SVG with the theme resolved.
export { visualizationSvg } from './internal/viz/svg-server.js';
export type { VisualizationSvgOptions } from './internal/viz/svg-server.js';
