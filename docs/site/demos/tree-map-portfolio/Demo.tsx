'use client';

import { useState } from 'react';
import { TreeMap, type TreeMapColorScale, type TreeMapItem } from '@salmonui/charts/tree-map';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const holdings = [
  { sector: 'Technology', name: 'Northwind Systems', value: 42, change: 3.1, rating: 'Buy' },
  { sector: 'Technology', name: 'Contoso Cloud', value: 30, change: -1.4, rating: 'Hold' },
  { sector: 'Technology', name: 'Fabrikam Chips', value: 18, change: 5.2, rating: 'Buy' },
  { sector: 'Health', name: 'Adatum Bio', value: 22, change: -2.8, rating: 'Sell' },
  { sector: 'Health', name: 'Litware Clinics', value: 14, change: 0.6, rating: 'Hold' },
  { sector: 'Energy', name: 'Tailspin Solar', value: 16, change: 1.9, rating: 'Buy' },
  { sector: 'Energy', name: 'Proseware Grid', value: 11, change: -0.7, rating: 'Hold' },
  { sector: 'Cash', name: 'Money market', value: 9, change: 0, rating: 'Hold' },
];

type ScaleKind = 'group' | TreeMapColorScale['kind'];
const scales: Record<TreeMapColorScale['kind'], TreeMapColorScale> = {
  // Range starts: the highest stop the change reaches colors the tile.
  range: { kind: 'range', field: 'change', stops: [{ value: -10, color: '#dc2626' }, { value: -1, color: '#ef4444' }, { value: 1, color: '#16a34a' }, { value: 3, color: '#15803d' }] },
  value: { kind: 'value', field: 'rating', stops: [{ value: 'Buy', color: '#15803d' }, { value: 'Hold', color: '#a16207' }, { value: 'Sell', color: '#dc2626' }] },
  opacity: { kind: 'opacity', field: 'value', stops: [{ value: 9, color: '#1d4ed8' }, { value: 42, color: '#1d4ed8' }] },
};
const money = (v: number) => `$${v}k`;
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
const fieldOf = (item: TreeMapItem, key: 'change' | 'rating') => (item.leaf ? (item.datum as (typeof holdings)[number])[key] : undefined);

/** A portfolio by sector: switch the color scale, hover, click and right-click tiles. */
export default function TreeMapPortfolioDemo() {
  const [kind, setKind] = useState<ScaleKind>('range');
  const [highlight, setHighlight] = useState(true);
  const [hovered, setHovered] = useState('none');
  const [clicked, setClicked] = useState('none');
  const [menu, setMenu] = useState(0);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Tree map options">
        <label>
          Color by
          <Select aria-label="Color by" data={[{ value: 'group', label: 'Sector (palette)' }, { value: 'range', label: 'Daily change (range)' }, { value: 'value', label: 'Analyst rating (value)' }, { value: 'opacity', label: 'Position size (opacity)' }]} value={kind} onValueChange={(value) => value != null && setKind(value as ScaleKind)} />
        </label>
        <Checkbox checked={highlight} onCheckedChange={(checked) => setHighlight(checked)}>
          Highlight on hover
        </Checkbox>
      </div>
      <TreeMap
        title="Portfolio"
        subtitle="Tile area is the position value"
        data={holdings}
        weightField="value"
        levels={[{ groupBy: 'sector' }]}
        leaves={{ labelField: 'name', showValue: true, format: money }}
        drill={false}
        palette={['#4f46e5', '#0891b2', '#b45309', '#6b7280']}
        colorScale={kind === 'group' ? undefined : scales[kind]}
        getItemStyle={(item) => (item.leaf && item.label === 'Money market' ? { color: '#6b7280' } : undefined)}
        highlight={highlight}
        tooltip={{
          render: (item) => {
            const change = fieldOf(item, 'change');
            return (
              <span>
                <strong>{item.label}</strong>: {money(item.value)}
                {typeof change === 'number' ? `, ${pct(change)} today, ${String(fieldOf(item, 'rating'))}` : ''}
              </span>
            );
          },
        }}
        onItemHover={(item) => setHovered(item ? item.path.join(' / ') : 'none')}
        onItemClick={(item) => setClicked(`${item.path.join(' / ')} (${money(item.value)})`)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu((n) => n + 1);
        }}
        height={360}
      />
      <p className="demo-status" aria-live="polite">
        Hover: <code>{hovered}</code> · Click: <code>{clicked}</code> · Right-clicks: <code>{menu}</code>
      </p>
    </div>
  );
}
