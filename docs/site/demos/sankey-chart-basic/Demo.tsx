'use client';

import { useState } from 'react';
import { SankeyChart } from '@salmonui/charts/sankey-chart';

const nodes = [
  { id: 'coal', label: 'Coal' },
  { id: 'gas', label: 'Gas' },
  { id: 'solar', label: 'Solar' },
  { id: 'wind', label: 'Wind' },
  { id: 'grid', label: 'Grid' },
  { id: 'homes', label: 'Homes' },
  { id: 'industry', label: 'Industry' },
  { id: 'transport', label: 'Transport' },
];
const links = [
  { source: 'coal', target: 'grid', value: 30 },
  { source: 'gas', target: 'grid', value: 25 },
  { source: 'solar', target: 'grid', value: 15 },
  { source: 'wind', target: 'grid', value: 20 },
  { source: 'gas', target: 'industry', value: 10 },
  { source: 'grid', target: 'homes', value: 40 },
  { source: 'grid', target: 'industry', value: 35 },
  { source: 'grid', target: 'transport', value: 15 },
];

export default function SankeyChartBasicDemo() {
  const [last, setLast] = useState('none');
  return (
    <div className="demo-stack">
      <SankeyChart title="Energy flow (TWh)" nodes={nodes} links={links} height={380} linkColor="gradient" legend onNodeClick={(n) => setLast(n.label)} onLinkClick={(l) => setLast(`${l.source.label} → ${l.target.label}`)} />
      <p className="demo-status" aria-live="polite">
        Clicked: <code>{last}</code>
      </p>
    </div>
  );
}
