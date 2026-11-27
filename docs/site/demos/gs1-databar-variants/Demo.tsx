'use client';

import { Gs1DataBar } from '@salmonui/charts/barcode/gs1-databar';

const cell = { display: 'grid', gap: 4, justifyItems: 'start' } as const;

// GS1 DataBar variants: linear, stacked, limited and expanded stacked.
export default function Gs1DataBarVariantsDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
      <div style={cell}>
        <span>Omnidirectional</span>
        <Gs1DataBar value="0950110153000" />
      </div>
      <div style={cell}>
        <span>Stacked</span>
        <Gs1DataBar variant="stacked" value="0001234567890" />
      </div>
      <div style={cell}>
        <span>Limited</span>
        <Gs1DataBar variant="limited" value="1501234567890" />
      </div>
      <div style={cell}>
        <span>Expanded Stacked, 4 segments per row</span>
        <Gs1DataBar variant="expandedStacked" segmentsPerRow={4} value="(01)98898765432106(3202)012345(15)991231" moduleSize={1.5} />
      </div>
    </div>
  );
}
