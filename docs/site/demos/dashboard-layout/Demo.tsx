'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DashboardLayout, type DashboardLayoutItem } from '@salmonui/layout/dashboard-layout';

const INITIAL: DashboardLayoutItem[] = [
  { id: 'revenue', x: 0, y: 0, w: 4, h: 2, minW: 2 },
  { id: 'visitors', x: 4, y: 0, w: 2, h: 2 },
  { id: 'status', x: 0, y: 2, w: 2, h: 1, static: true },
  { id: 'orders', x: 2, y: 2, w: 4, h: 2 },
];

const PANELS: Record<string, { header: string; body: string }> = {
  revenue: { header: 'Revenue', body: '$48,200 this month' },
  visitors: { header: 'Visitors', body: '12,940' },
  status: { header: 'Status (pinned)', body: 'All systems normal' },
  orders: { header: 'Orders', body: '318 open orders' },
};

export default function DashboardLayoutDemo() {
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(INITIAL);
  const [added, setAdded] = useState(0);
  // The layout is the panel model: adding, removing or resetting panels is a state change.
  const addPanel = () => {
    const id = `note-${added + 1}`;
    setAdded(added + 1);
    setLayout([...layout, { id, x: 0, y: Math.max(0, ...layout.map((i) => i.y + i.h)), w: 2, h: 1 }]);
  };
  const removable = layout.filter((i) => !i.static);
  return (
    <div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={addPanel}>
          Add panel
        </Button>
        <Button variant="outline" disabled={removable.length === 0} onClick={() => setLayout(layout.filter((i) => i.id !== removable[removable.length - 1]?.id))}>
          Remove last panel
        </Button>
        <Button variant="outline" onClick={() => setLayout(INITIAL)}>
          Reset layout
        </Button>
      </div>
      <DashboardLayout columns={6} rowHeight={72} gap={8} layout={layout} onLayoutChange={setLayout} dragHandle=".salmon-dashboard-panel-header" resizable showGridLines responsive={{ stackBelow: 560 }}>
        {layout.map((item) => (
          <DashboardLayout.Panel key={item.id} id={item.id} header={PANELS[item.id]?.header ?? `Note ${item.id.slice(5)}`}>
            {PANELS[item.id]?.body ?? 'A panel added at run time.'}
          </DashboardLayout.Panel>
        ))}
      </DashboardLayout>
      <p>
        <output>{layout.map((i) => `${i.id} ${i.x},${i.y} ${i.w}x${i.h}`).join(' · ')}</output>
      </p>
    </div>
  );
}
