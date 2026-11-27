'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import type { ChartApi } from '@salmonui/charts/chart';
import { Button } from '@salmonui/buttons/button';

const WINDOW = 60;
const sample = (t: number) => ({ t, cpu: Math.round(45 + 25 * Math.sin(t / 7) + 10 * Math.sin(t * 1.3)), memory: Math.round(60 + 8 * Math.sin(t / 11)) });
const initial = Array.from({ length: WINDOW }, (_, i) => sample(i));

export default function ChartLiveDemo() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState(initial);
  const streamed = useRef<ChartApi>(null);
  const tick = useRef(WINDOW);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      const point = sample(tick.current++);
      // Reactive data: a new array (the oldest point dropped) lays the first chart out again.
      setRows((r) => [...r.slice(r.length >= WINDOW ? 1 : 0), point]);
      // Streaming: the second chart takes the point through its store, without a React render.
      streamed.current?.appendPoints('cpu', [point], { maxPoints: WINDOW });
    }, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => setRunning((r) => !r)} aria-pressed={running}>
          {running ? 'Pause' : 'Start'} stream
        </Button>
        <Button variant="outline" type="button" onClick={() => setRows([])}>
          Clear data
        </Button>
        <Button variant="outline" type="button" onClick={() => setRows(initial)}>
          Restore data
        </Button>
      </div>
      <Chart
        title="Server load (reactive data)"
        data={rows}
        height={240}
        yAxis={{ min: 0, max: 100, format: '{value}%' }}
        renderEmpty={() => <span>No samples yet: press Restore data</span>}
        series={[
          { id: 'cpu', name: 'CPU', xField: 't', yField: 'cpu', description: 'CPU use of the web server in percent, sampled four times a second.' },
          { id: 'memory', name: 'Memory', xField: 't', yField: 'memory', description: 'Memory use in percent.' },
        ]}
      />
      <Chart
        ref={streamed}
        title="CPU (streamed with appendPoints)"
        data={initial}
        height={200}
        yAxis={{ min: 0, max: 100 }}
        series={[{ id: 'cpu', name: 'CPU', xField: 't', yField: 'cpu', description: 'The same CPU samples, streamed into the chart store.' }]}
      />
    </div>
  );
}
