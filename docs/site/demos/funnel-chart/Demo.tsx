'use client';

import { FunnelChart } from '@salmonui/charts/pie-chart';

const stages = [
  { stage: 'Visits', n: 12000 },
  { stage: 'Sign-ups', n: 5400 },
  { stage: 'Trials', n: 2300 },
  { stage: 'Orders', n: 900 },
];

export default function FunnelChartDemo() {
  return (
    <div className="demo-stack">
      <FunnelChart title="Conversion" data={stages} valueField="n" labelField="stage" height={280} neckWidth="22%" neckHeight="18%" gap={3} labels={{ position: 'outside' }} legend={false} />
      <FunnelChart title="Conversion (trapezoidal)" variant="trapezoidal" data={stages} valueField="n" labelField="stage" height={280} />
      <FunnelChart title="Pyramid (area)" shape="pyramid" mode="area" data={stages} valueField="n" labelField="stage" height={280} labels={{ position: 'outside' }} legend={false} />
    </div>
  );
}
