'use client';

import { useState, type CSSProperties } from 'react';
import { Button } from '@salmonui/buttons/button';
import { MenuButton, type MenuItemData } from '@salmonui/buttons/menu';

interface Result {
  readonly buttonsMs: number;
  readonly menu100Ms: number;
  readonly menu1000Ms: number;
  readonly menu100Length: number;
  readonly menu1000Length: number;
}

const items = (count: number): MenuItemData[] => Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, label: `Item ${index + 1}` }));

// A compact label / value readout: labels in the secondary text color, values below.
const DL: CSSProperties = { display: 'grid', gap: 2, margin: 0 };
const DT: CSSProperties = { color: 'var(--salmon-text-secondary)' };
const DD: CSSProperties = { margin: '0 0 8px' };

function timed(render: () => string, runs = 5): { ms: number; html: string } {
  let html = render(); // warm-up
  const start = performance.now();
  for (let run = 0; run < runs; run++) html = render();
  return { ms: (performance.now() - start) / runs, html };
}

// Runs React's renderToString in the browser (loaded on demand) over the same
// trees the SSR budgets measure: 100 Buttons, and a closed MenuButton with
// 100 and 1,000 items whose markup does not depend on the item count.
export default function ButtonSsrCostDemo() {
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    const { renderToString } = await import('react-dom/server');
    const hundred = Array.from({ length: 100 }, (_, index) => index);
    const buttons = timed(() =>
      renderToString(
        <div>
          {hundred.map((index) => (
            <Button key={index} tone={index % 2 ? 'primary' : 'neutral'}>
              Button {index + 1}
            </Button>
          ))}
        </div>,
      ),
    );
    const list100 = items(100);
    const list1000 = items(1000);
    const menu100 = timed(() => renderToString(<MenuButton items={list100}>Actions</MenuButton>));
    const menu1000 = timed(() => renderToString(<MenuButton items={list1000}>Actions</MenuButton>));
    setResult({ buttonsMs: buttons.ms, menu100Ms: menu100.ms, menu1000Ms: menu1000.ms, menu100Length: menu100.html.length, menu1000Length: menu1000.html.length });
    setRunning(false);
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <Button tone="primary" loading={running} loadingLabel="Measuring" onClick={run}>
          Measure server rendering
        </Button>
      </div>
      {result ? (
        <dl style={DL}>
          <dt style={DT}>100 Buttons, renderToString</dt>
          <dd style={DD}>{result.buttonsMs.toFixed(2)} ms (budget 5 ms in Node)</dd>
          <dt style={DT}>Closed MenuButton, 100 items</dt>
          <dd style={DD}>
            {result.menu100Ms.toFixed(2)} ms, {result.menu100Length} characters
          </dd>
          <dt style={DT}>Closed MenuButton, 1,000 items</dt>
          <dd style={DD}>
            {result.menu1000Ms.toFixed(2)} ms, {result.menu1000Length} characters (budget 2 ms in Node)
          </dd>
          <dt style={DT}>Same markup for 100 and 1,000 items</dt>
          <dd style={DD}>{String(result.menu100Length === result.menu1000Length)}</dd>
        </dl>
      ) : (
        <p style={{ margin: 0 }}>Press the button to run the measurement in this browser.</p>
      )}
    </div>
  );
}
