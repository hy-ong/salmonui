'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Sparkline, type SparklinePointEvent } from '@salmonui/charts/sparkline';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const regions = [
  { name: 'North', temps: [-4, -2, 3, 9, 15, 19, 22, 21, 16, 9, 3, -2] },
  { name: 'Central', temps: [2, 4, 8, 13, 18, 23, 26, 25, 20, 14, 7, 3] },
  { name: 'South', temps: [12, 13, 16, 19, 23, 27, 30, 30, 27, 22, 17, 13] },
];

type Padding = 'none' | 'normal' | 'additional';

// Region names in one column, sparklines in the next, so the three sparklines line up.
const rows = { display: 'grid', gridTemplateColumns: 'max-content max-content', alignItems: 'center', gap: '8px 16px' } as const;

/** Monthly temperatures on one shared y domain with a 0 °C baseline, labels and point events. */
export default function SparklineAxisEventsDemo() {
  const [shared, setShared] = useState(true);
  const [padding, setPadding] = useState<Padding>('normal');
  const [hovered, setHovered] = useState('none');
  const [clicked, setClicked] = useState('none');
  const describe = (region: string, e: SparklinePointEvent) => `${region} ${months[e.point.index] ?? ''}: ${e.point.y} °C (${e.source})`;
  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Sparkline axis options">
        <Checkbox checked={shared} onCheckedChange={(checked) => setShared(checked)}>Shared y domain (−10 to 35 °C)</Checkbox>
        <label>
          Padding
          <Select aria-label="Padding" data={[{ value: 'none', label: 'None' }, { value: 'normal', label: 'Normal' }, { value: 'additional', label: 'Additional' }]} value={padding} onValueChange={(value) => value != null && setPadding(value as Padding)} />
        </label>
      </div>
      <div style={rows}>
        {regions.map((r) => [
          <span key={`${r.name}-label`}>{r.name}</span>,
          <Sparkline
            key={r.name}
            label={`${r.name} monthly temperature`}
            data={r.temps}
            width={260}
            height={56}
            domain={shared ? { y: [-10, 35] } : undefined}
            baseline={0}
            padding={padding}
            markers="all"
            labels={['high', 'low']}
            format={(v) => `${v}°`}
            getPointStyle={(p) => (p.y < 0 ? { color: '#2563eb' } : p.y >= 25 ? { color: '#dc2626' } : undefined)}
            tooltip={{ format: (p) => `${months[p.index] ?? ''}: ${p.y} °C` }}
            onPointHover={(e) => setHovered(e ? describe(r.name, e) : 'none')}
            onPointClick={(e) => setClicked(describe(r.name, e))}
          />,
        ])}
      </div>
      <p className="demo-status" aria-live="polite">
        Hover: <code>{hovered}</code> · Click: <code>{clicked}</code>
      </p>
    </div>
  );
}
