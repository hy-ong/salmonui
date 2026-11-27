'use client';

import { Gauge } from '@salmonui/charts/gauge';

// A horizontal storage gauge and a vertical thermometer.
export default function GaugeLinearDemo() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ inlineSize: 380 }}>
        <Gauge
          shape="linear"
          container="rounded"
          title="Storage"
          axes={[{ ranges: [{ from: 80, to: 100, color: '#c62828', label: 'Almost full', position: 'outside', width: [2, 8] }], annotations: [{ value: 62, y: -26, content: '62 %' }] }]}
          pointers={[{ value: 62, label: 'Used' }, { type: 'marker', value: 80, shape: 'triangle', placement: 'far', label: 'Warning level' }]}
        />
      </div>
      <div style={{ inlineSize: 120 }}>
        <Gauge shape="linear" orientation="vertical" container="thermometer" title="Room" axes={[{ min: -10, max: 40 }]} pointers={[{ value: 22, label: 'Temperature', valueText: (v) => `${v} °C` }]} />
      </div>
    </div>
  );
}
