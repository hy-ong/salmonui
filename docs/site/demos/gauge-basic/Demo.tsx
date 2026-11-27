'use client';

import { useState } from 'react';
import { Gauge } from '@salmonui/charts/gauge';

const ranges = [
  { id: 'normal', from: 0, to: 60, color: '#2e7d32', label: 'Normal' },
  { id: 'high', from: 60, to: 85, color: '#b26a00', label: 'High' },
  { id: 'critical', from: 85, to: 100, color: '#c62828', label: 'Critical', width: [10, 18] as const },
];

// A read-only speedometer and a controlled, draggable volume dial.
export default function GaugeBasicDemo() {
  const [volume, setVolume] = useState(40);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ inlineSize: 260 }}>
        <Gauge
          title="Speed"
          axes={[{ ranges, ticks: { minor: 5 }, annotations: [{ angle: 180, radius: 0.45, content: <strong>72 km/h</strong> }] }]}
          pointers={[{ value: 72, label: 'Speed', valueText: (v) => `${v} km/h` }]}
          legend
          tooltip
        />
      </div>
      <div style={{ inlineSize: 260 }}>
        <Gauge
          title="Volume"
          axes={[{ startAngle: 270, endAngle: 90, labels: { position: 'outside' } }]}
          pointers={[
            { type: 'bar', value: volume, width: 14 },
            { id: 'volume', value: volume, draggable: true, label: 'Volume', step: 5, length: 0.7 },
          ]}
          onPointerValueChange={(change) => setVolume(change.value)}
        />
        <output>Volume: {volume}</output>
      </div>
    </div>
  );
}
