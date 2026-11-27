'use client';

import { useState } from 'react';
import { Meter, Progress } from '@salmonui/notifications/progress';
import { Slider } from '@salmonui/inputs/slider';

// Circular and semicircle progress: component sizes, a pixel diameter with a
// custom thickness, centered labels and nodes, a buffer, segments, and a Meter.
export default function ProgressCircularDemo() {
  const [value, setValue] = useState(62);
  const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 } as const;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <Slider label="Value" min={0} max={100} value={value} onValueChange={setValue} style={{ inlineSize: 160 }} />
          <output style={{ minInlineSize: '3ch', lineHeight: '24px' }}>{value}</output>
        </span>
      </div>
      <div style={row}>
        <Progress aria-label="Small" shape="circular" size="sm" value={value} />
        <Progress aria-label="Medium" shape="circular" value={value} label />
        <Progress aria-label="Large with buffer" shape="circular" size="lg" value={value} buffer={Math.min(100, value + 15)} label />
        <Progress aria-label="Syncing" shape="circular" value={null} />
        <Progress aria-label="Segmented" shape="circular" size="lg" segments={8} value={value} tone="info" />
      </div>
      <div style={row}>
        <Progress
          aria-label="Storage"
          shape="circular"
          size={120}
          thickness={14}
          value={value}
          tone="success"
          style={{ margin: 8 }}
          label={
            <span style={{ display: 'grid', textAlign: 'center', lineHeight: 1.1 }}>
              <strong>{value} GB</strong>
              <small>of 100</small>
            </span>
          }
        />
        <Progress aria-label="Battery" shape="semicircle" size={140} thickness={12} value={value} tone={value < 25 ? 'danger' : 'primary'} label={({ valueText }) => valueText} />
        <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
          <Meter aria-label="Disk usage" shape="semicircle" size={120} value={value} tone={(v) => ((v ?? 0) > 80 ? 'danger' : 'success')} label />
          <span>Disk usage</span>
        </div>
      </div>
    </div>
  );
}
