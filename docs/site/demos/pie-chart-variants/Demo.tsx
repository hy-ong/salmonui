'use client';

import { PieChart } from '@salmonui/charts/pie-chart';

const share = [
  { os: 'Android', v: 44 },
  { os: 'iOS', v: 31 },
  { os: 'Windows', v: 12 },
  { os: 'macOS', v: 7 },
  { os: 'Linux', v: 3 },
  { os: 'Other', v: 3 },
];

export default function PieChartVariantsDemo() {
  return (
    <div className="demo-stack">
      <PieChart title="Semi pie" data={share} valueField="v" labelField="os" height={240} startAngle={-90} endAngle={90} padAngle={2} center={{ y: '80%' }} radius="95%" innerRadius="45%" labels={false} />
      <PieChart
        title="2025 and 2026"
        height={240}
        innerRadius={30}
        labels={false}
        patterns
        series={[
          { name: '2025', data: share, valueField: 'v', labelField: 'os' },
          { name: '2026', data: share.map((d, i) => ({ ...d, v: d.v + (i % 2 ? -2 : 3) })), valueField: 'v', labelField: 'os' },
        ]}
      />
      <PieChart title="Grouped" data={share} valueField="v" labelField="os" height={240} groupSmall={{ threshold: 8, label: 'Others' }} emptyPoints="average" />
    </div>
  );
}
