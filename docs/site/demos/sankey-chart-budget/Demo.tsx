'use client';

import { useRef, useState } from 'react';
import { SankeyChart, type SankeyChartApi, type SankeyNodeInfo } from '@salmonui/charts/sankey-chart';
import { Button } from '@salmonui/buttons/button';

const nodes = [
  { id: 'salary', label: 'Salary' },
  { id: 'freelance', label: 'Freelance' },
  { id: 'budget', label: 'Budget' },
  { id: 'housing', label: 'Housing' },
  { id: 'food', label: 'Food' },
  { id: 'transport', label: 'Transport' },
  { id: 'fun', label: 'Leisure' },
  { id: 'savings', label: 'Savings' },
];
const links = [
  { source: 'salary', target: 'budget', value: 4200 },
  { source: 'freelance', target: 'budget', value: 800 },
  { source: 'budget', target: 'housing', value: 1700 },
  { source: 'budget', target: 'food', value: 750 },
  { source: 'budget', target: 'transport', value: 300 },
  { source: 'budget', target: 'fun', value: 450 },
  { source: 'budget', target: 'savings', value: 1800 },
];

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const income = new Set(['salary', 'freelance']);
const nodeColor = (n: SankeyNodeInfo) => (income.has(n.id) ? '#15803d' : n.id === 'savings' ? '#2563eb' : n.id === 'budget' ? '#737373' : '#c2410c');

/** A monthly budget with custom tooltips, node and link styles, value labels, resize events and export. */
export default function SankeyChartBudgetDemo() {
  const ref = useRef<SankeyChartApi>(null);
  const [size, setSize] = useState('not measured yet');
  const [svgLength, setSvgLength] = useState<number | null>(null);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Export">
        <Button variant="outline" type="button" onClick={() => void ref.current?.export({ format: 'svg', fileName: 'budget.svg' })}>
          Download SVG
        </Button>
        <Button variant="outline" type="button" onClick={() => void ref.current?.export({ format: 'png', fileName: 'budget.png' })}>
          Download PNG
        </Button>
        <Button variant="outline" type="button" onClick={() => setSvgLength(ref.current?.toSVGString().length ?? 0)}>
          Measure SVG markup
        </Button>
      </div>
      <SankeyChart
        ref={ref}
        title="Monthly budget"
        subtitle="Income to spending, USD"
        nodes={nodes}
        links={links}
        height={360}
        format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
        formatLabel={(n) => `${n.label} ${money.format(n.value)}`}
        getNodeStyle={(n) => ({ color: nodeColor(n) })}
        getLinkStyle={(l) => ({ color: nodeColor(l.target.id === 'budget' ? l.source : l.target), opacity: l.value < 500 ? 0.3 : 0.55 })}
        tooltip={{
          renderNode: (n) => (
            <span>
              <strong>{n.label}</strong>: {money.format(n.value)}
            </span>
          ),
          renderLink: (l) => (
            <span>
              {l.source.label} → {l.target.label}: {money.format(l.value)} ({Math.round((l.value / l.source.value) * 100)}% of {l.source.label})
            </span>
          ),
        }}
        onResize={(s) => setSize(`${Math.round(s.width)} × ${Math.round(s.height)} px`)}
      />
      <p className="demo-status" aria-live="polite">
        Size: <code>{size}</code>
        {svgLength === null ? null : (
          <>
            {' '}
            · SVG markup: <code>{svgLength} characters</code>
          </>
        )}
      </p>
    </div>
  );
}
