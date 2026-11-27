'use client';

import { useState } from 'react';
import { HeatMap, type HeatMapCellRef } from '@salmonui/charts/heat-map';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hours = ['00', '04', '08', '12', '16', '20'];
const load = hours.map((_, y) => days.map((_, x) => ((x * 5 + y * 11) % 17) + (x < 5 && y > 1 && y < 5 ? 6 : 0)));

export default function HeatMapBasicDemo() {
  const [selected, setSelected] = useState<readonly HeatMapCellRef[]>([]);
  return (
    <div className="demo-stack">
      <HeatMap
        title="Load by weekday and hour"
        data={load}
        height={360}
        xAxis={{ labels: days, labelGroups: [{ from: 0, to: 4, text: 'Weekdays' }, { from: 5, to: 6, text: 'Weekend' }] }}
        yAxis={{ labels: hours, title: 'Hour' }}
        cells={{ labels: true }}
        colorScale={{ kind: 'steps', stops: [{ value: 0, color: '#4c87e4', label: 'Low' }, { value: 8, color: '#4278d8', label: 'Medium' }, { value: 16, color: '#2e59c2', label: 'High' }] }}
        selection={{ multiple: true }}
        selectedCells={selected}
        onSelectedCellsChange={setSelected}
      />
      <p className="demo-status" aria-live="polite">
        Selected: <code>{selected.map((c) => `${days[c.x]} ${hours[c.y]}`).join(', ') || 'none'}</code>
      </p>
    </div>
  );
}
