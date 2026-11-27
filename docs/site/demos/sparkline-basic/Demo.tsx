'use client';

import { Sparkline } from '@salmonui/charts/sparkline';

const visits = [32, 41, 38, 52, 49, 61, 58, 66, 72, 69, 80, 77];
const margin = [4, -2, 6, 3, -5, 8, -1, 2, 7, -3, 5, 9];
// Labels in one column, sparklines in the next, so every sparkline starts at the same edge.
const rows = { display: 'grid', gridTemplateColumns: 'max-content max-content', alignItems: 'center', gap: '12px 16px' } as const;

/** Four sparkline types beside their labels; the first one has a tooltip. */
export default function SparklineBasicDemo() {
  return (
    <div style={rows}>
      <span>Visits</span>
      <Sparkline data={visits} highlights={{ high: true, low: true, last: true }} bands={[{ from: 40, to: 60 }]} tooltip width={120} height={28} />
      <span>Area</span>
      <Sparkline type="area" data={visits} width={120} height={28} />
      <span>Margin</span>
      <Sparkline type="column" data={margin} highlights={{ negative: true }} width={120} height={28} />
      <span>Results</span>
      <Sparkline type="winLoss" data={[1, 1, -1, 1, 0, -1, 1, 1]} width={120} height={28} />
    </div>
  );
}
