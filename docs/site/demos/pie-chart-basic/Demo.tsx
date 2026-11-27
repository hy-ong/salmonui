'use client';

import { useState } from 'react';
import { PieChart, type AccumulationPointRef } from '@salmonui/charts/pie-chart';

const sales = [
  { region: 'North', sales: 42 },
  { region: 'South', sales: 28 },
  { region: 'East', sales: 18 },
  { region: 'West', sales: 12 },
];

export default function PieChartBasicDemo() {
  const [selected, setSelected] = useState<readonly AccumulationPointRef[]>([]);
  return (
    <div className="demo-stack">
      <PieChart
        title="Sales by region"
        data={sales}
        valueField="sales"
        labelField="region"
        height={320}
        innerRadius="55%"
        labels={{ position: 'outside', connector: 'curve' }}
        explode
        selection
        selectedPoints={selected}
        onSelectedPointsChange={setSelected}
        centerLabel={({ point, total }) => (point ? `${point.label}: ${point.value}` : `Total ${total}`)}
      />
      <p className="demo-status" aria-live="polite">
        Selected: <code>{selected.map((s) => sales[s.index]?.region).join(', ') || 'none'}</code>
      </p>
    </div>
  );
}
