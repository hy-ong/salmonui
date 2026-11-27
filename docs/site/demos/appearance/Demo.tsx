'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridLines, type DataGridTextWrap } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider, type SalmonColorScheme, type SalmonHexColor } from '@salmonui/core/theme';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(200, 3);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'priority', header: 'Delivery priority', width: 100 },
  { field: 'note', header: 'Note', width: 180 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 100 },
];

const lines: readonly DataGridLines[] = ['default', 'both', 'horizontal', 'vertical', 'none'];
const seeds: readonly SalmonHexColor[] = ['#c2410c', '#0f766e', '#4338ca', '#be185d'];
const wraps: readonly Exclude<DataGridTextWrap, true>[] = [false, 'header', 'content', 'both'];
// no size modes; row and header heights are plain layout props.
const sizes = { small: { rowHeight: 28, headerHeight: 32 }, default: { rowHeight: 36, headerHeight: 40 }, large: { rowHeight: 48, headerHeight: 52 } } as const;
type Size = keyof typeof sizes;
const lineItems = lines.map((value) => ({ value, label: value }));
const sizeItems = Object.keys(sizes).map((value) => ({ value, label: value }));
const wrapItems = wraps.map((value) => ({ value: String(value), label: value === false ? 'off' : value }));
const schemeItems = (['auto', 'light', 'dark'] as const).map((value) => ({ value, label: value }));
const seedItems = seeds.map((value) => ({ value, label: value }));

export default function AppearanceDemo() {
  const [gridLines, setGridLines] = useState<DataGridLines>('default');
  const [striped, setStriped] = useState(true);
  const [hover, setHover] = useState(true);
  const [compact, setCompact] = useState(false);
  const [size, setSize] = useState<Size>('default');
  const [wrap, setWrap] = useState<Exclude<DataGridTextWrap, true>>(false);
  const measured = wrap === 'content' || wrap === 'both';
  const [scheme, setScheme] = useState<SalmonColorScheme>('auto');
  const [primary, setPrimary] = useState<SalmonHexColor>('#c2410c');
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Grid lines
          <Select aria-label="Grid lines" data={lineItems} value={gridLines} onValueChange={(value) => value != null && setGridLines(value as DataGridLines)} />
        </label>
        <Checkbox checked={striped} onCheckedChange={(checked) => setStriped(checked)}>
          Alternate rows
        </Checkbox>
        <Checkbox checked={hover} onCheckedChange={(checked) => setHover(checked)}>
          Hover highlight
        </Checkbox>
        <Checkbox checked={compact} onCheckedChange={(checked) => setCompact(checked)}>
          Conditional row height
        </Checkbox>
        <label>
          Row size
          <Select aria-label="Row size" data={sizeItems} value={size} onValueChange={(value) => value != null && setSize(value as Size)} />
        </label>
        <label>
          Text wrap
          <Select aria-label="Text wrap" data={wrapItems} value={String(wrap)} onValueChange={(value) => setWrap(wraps.find((w) => String(w) === value) ?? false)} />
        </label>
        <label>
          Scheme
          <Select aria-label="Scheme" data={schemeItems} value={scheme} onValueChange={(value) => value != null && setScheme(value as SalmonColorScheme)} />
        </label>
        <label>
          Primary seed
          <Select aria-label="Primary seed" data={seedItems} value={primary} onValueChange={(value) => value != null && setPrimary(value as SalmonHexColor)} />
        </label>
      </div>
      {/* Colors-only theme: seeds plus colorScheme. ThemeStyle emits the scope's --salmon-* variables (hoisted, deduplicated). */}
      <ThemeStyle theme={{ colors: { primary } }} />
      <ThemeProvider theme={{ colors: { primary }, colorScheme: scheme }}>
        <DataGrid<Order>
          // Switching between fixed, per-row and measured heights remounts the grid.
          key={measured ? 'measured' : compact ? 'compact' : 'fixed'}
          aria-label="Orders with configurable grid lines, striping and theme"
          data={orders}
          columns={columns}
          height={340}
          locale="en-US"
          currency="USD"
          timeZone="UTC"
          gridLines={gridLines}
          striped={striped}
          highlightOnHover={hover}
          className="demo-appearance"
          headerHeight={sizes[size].headerHeight}
          textWrap={wrap}
          {...(measured
            ? { estimatedRowHeight: sizes[size].rowHeight }
            : compact
              ? { getRowHeight: (row: Order) => (row.priority === 'High' ? 48 : 30) }
              : { rowHeight: sizes[size].rowHeight })}
        />
      </ThemeProvider>
    </>
  );
}
