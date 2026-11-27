// Internal chart engine of @salmonui/charts, imported only through the private package import `#viz`.
// Framework-free math and layout: no React, no DOM globals, no
// dependencies, deterministic output (coordinates rounded to 0.01 px). Public
// types live in the family subpaths, so the module can move to a package of
// its own (open question Q1) without a public import change.

export * from './ticks.js';
export * from './time-ticks.js';
export * from './scale.js';
export * from './text.js';
export * from './polyline.js';
export * from './geometry.js';
export * from './stack.js';
export * from './decimate.js';
export * from './hit-test.js';
export * from './polygon.js';
export * from './labels.js';
export * from './layout.js';
export * from './color.js';
export * from './palette.js';
export * from './format.js';
export * from './summary.js';
export * from './accumulation.js';
export * from './sankey.js';
export * from './treemap.js';
export * from './heatmap.js';
export * from './field.js';
export * from './projection.js';
export * from './cluster.js';
export * from './stats.js';
export * from './indicators.js';
export * from './trend.js';
