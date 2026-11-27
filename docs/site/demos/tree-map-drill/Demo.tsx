'use client';

import { useState } from 'react';
import { TreeMap, type TreeMapPath } from '@salmonui/charts/tree-map';

const budget = [
  { dept: 'Engineering', team: 'Platform', cost: 40 },
  { dept: 'Engineering', team: 'Apps', cost: 30 },
  { dept: 'Engineering', team: 'Data', cost: 20 },
  { dept: 'Sales', team: 'EMEA', cost: 25 },
  { dept: 'Sales', team: 'Americas', cost: 35 },
  { dept: 'Sales', team: 'APAC', cost: 15 },
  { dept: 'Support', team: 'Tier 1', cost: 12 },
  { dept: 'Support', team: 'Tier 2', cost: 8 },
];

export default function TreeMapDrillDemo() {
  const [path, setPath] = useState<TreeMapPath>([]);
  return (
    <div className="demo-stack">
      <TreeMap
        title="Budget by team"
        data={budget}
        weightField="cost"
        levels={[{ groupBy: 'dept', header: { format: (item) => `${item.label} (${item.value})` } }]}
        leaves={{ labelField: 'team', showValue: true, labelPosition: 'center', labelOverflow: 'wrapWord' }}
        path={path}
        onPathChange={setPath}
        breadcrumbs
        selection
        legend={{ mode: 'interactive' }}
        height={380}
      />
      <p className="demo-status" aria-live="polite">
        Path: <code>{path.join(' / ') || 'All'}</code>
      </p>
    </div>
  );
}
