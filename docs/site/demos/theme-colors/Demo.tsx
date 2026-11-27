'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { ColorField } from '@salmonui/inputs/color-picker';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { ThemeStyle } from '@salmonui/core/server';
import { defaultSalmonTheme, ThemeProvider, type SalmonColorScheme, type SalmonHexColor } from '@salmonui/core/theme';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(120, 21);

const columns: DataGridColumn<Order>[] = [
  { type: 'selection' },
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'priority', header: 'Priority', width: 100, cellClassName: (ctx) => (ctx.value === 'High' ? 'demo-cell--negative' : undefined) },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 100 },
];

const SCHEMES = [
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
  { value: 'auto', label: 'auto' },
];

type SeedName = keyof typeof defaultSalmonTheme.colors;
const seedNames: readonly SeedName[] = ['primary', 'success', 'warning', 'danger', 'info'];

/** Pairs the theme guarantees: foreground, background, minimum ratio. */
const checks: readonly (readonly [string, string, number])[] = [
  ['--salmon-text-primary', '--salmon-surface-raised', 7],
  ['--salmon-text-secondary', '--salmon-surface-raised', 4.5],
  ['--salmon-text-primary', '--salmon-surface-selected', 7],
  ['--salmon-border-selected', '--salmon-surface-raised', 3],
  ['--salmon-state-focus-ring', '--salmon-surface-raised', 3],
  ['--salmon-color-primary-on', '--salmon-color-primary', 4.5],
  ['--salmon-color-danger-text', '--salmon-surface-base', 4.5],
];

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

interface Reading {
  readonly pair: string;
  readonly ratio: number;
  readonly min: number;
}

export default function ThemeColorsDemo() {
  const [seeds, setSeeds] = useState<Record<SeedName, SalmonHexColor>>({ ...defaultSalmonTheme.colors });
  const [scheme, setScheme] = useState<SalmonColorScheme>('light');
  const [readings, setReadings] = useState<readonly Reading[]>([]);
  const scope = useRef<HTMLDivElement | null>(null);
  const theme = { colors: seeds, colorScheme: scheme };

  // Reads the derived variables after commit (never during render) and checks the contrast guarantees.
  useEffect(() => {
    const root = scope.current?.querySelector('.salmon-theme-scope');
    if (!root) return;
    const style = getComputedStyle(root);
    const read = (name: string) => style.getPropertyValue(name).trim();
    setReadings(checks.map(([fg, bg, min]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(read(fg), read(bg)), min })));
  }, [seeds, scheme]);

  return (
    <>
      <div className="demo-toolbar">
        {seedNames.map((name) => (
          <label key={name}>
            {name}
            <ColorField
              aria-label={name}
              valueFormat="hex"
              value={seeds[name]}
              onValueChange={(value) => value != null && setSeeds({ ...seeds, [name]: value as SalmonHexColor })}
              style={{ inlineSize: 128 }}
            />
          </label>
        ))}
        <label>
          Scheme
          <Select aria-label="Scheme" data={SCHEMES} value={scheme} onValueChange={(value) => value != null && setScheme(value as SalmonColorScheme)} />
        </label>
        <Button variant="outline" onClick={() => setSeeds({ ...defaultSalmonTheme.colors })}>
          Reset seeds
        </Button>
      </div>
      {/* The five seeds and the scheme are the whole theme input; ThemeStyle emits the scope's variables. */}
      <ThemeStyle theme={theme} />
      <div ref={scope}>
        <ThemeProvider theme={theme}>
          <DataGrid<Order>
            aria-label="Orders in the chosen theme colors"
            data={orders}
            columns={columns}
            height={300}
            locale="en-US"
            currency="USD"
            timeZone="UTC"
            selection={{ multiple: true, rowIds: ['ORD-10001', 'ORD-10002'] }}
          />
          <table className="demo-contrast" aria-label="Contrast of the derived colors">
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col">Ratio</th>
                <th scope="col">Minimum</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.pair}>
                  <td>
                    <code>{r.pair}</code>
                  </td>
                  <td>{r.ratio.toFixed(2)}:1</td>
                  <td>{r.min}:1</td>
                  <td data-result={r.ratio >= r.min ? 'pass' : 'fail'}>{r.ratio >= r.min ? 'Pass' : 'Fail'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ThemeProvider>
      </div>
    </>
  );
}
