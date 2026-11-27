'use client';

// `@salmonui/charts/chart/bullet`:
// `BulletChart`, a chart-family subpath over the public `@salmonui/charts/chart`
// entry so `/chart` stays within its budget. Styled by
// `@salmonui/charts/chart/styles.css`. The entry file is `chart-bullet.ts`, not
// `chart/bullet.ts` (a case collision with `BulletChart.tsx` on a
// case-insensitive file system).
export { BulletChart } from './chart/BulletChart.js';
export type { BulletBand, BulletChartProps, BulletLegendOptions } from './chart/BulletChart.js';
// Several visualizations as one image or PDF page, through the public /chart entry.
