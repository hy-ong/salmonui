'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { Select } from '@salmonui/dropdowns/select';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { TextField } from '@salmonui/inputs/text-field';
import { ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider, type SalmonDensity } from '@salmonui/core/theme';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(6, 7);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 130 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 110 },
];

const STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
];

const DENSITIES: readonly SalmonDensity[] = ['default', 'compact'];

interface Metrics {
  readonly button: number;
  readonly field: number;
  readonly row: number;
  readonly header: number;
}

/** One column of controls under its own density scope. */
function Column({ density }: { density: SalmonDensity }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const theme = { density };

  // Measures the rendered heights after commit (never during render).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const height = (selector: string) => Math.round(root.querySelector(selector)?.getBoundingClientRect().height ?? 0);
    const frame = requestAnimationFrame(() =>
      setMetrics({
        button: height('.salmon-button[data-size="md"]'),
        field: height('.salmon-text-field .salmon-input-group'),
        row: height('.salmon-data-grid-row'),
        header: height('.salmon-data-grid-header-row'),
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section ref={ref} aria-labelledby={`density-${density}`} data-density={density} style={{ display: 'grid', gap: 12, alignContent: 'start', minInlineSize: 0 }}>
      <h3 id={`density-${density}`} style={{ margin: 0, fontSize: 'var(--salmon-font-size-md)' }}>
        <code>density: &apos;{density}&apos;</code>
      </h3>
      <ThemeStyle theme={theme} />
      <ThemeProvider theme={theme}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Button size="sm">Small</Button>
            <Button size="md" tone="primary">
              Medium
            </Button>
            <Button size="lg" variant="outline">
              Large
            </Button>
          </div>
          <TextField label="Keyword" placeholder="Order, customer or email" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Select aria-label={`Status (${density})`} data={STATUSES} placeholder="All statuses" style={{ inlineSize: 150 }} />
            <DatePicker aria-label={`Updated (${density})`} defaultValue="2026-11-24" />
          </div>
          <Tabs defaultValue="orders">
            <TabList aria-label={`Sections (${density})`}>
              <Tab value="orders">Orders</Tab>
              <Tab value="returns">Returns</Tab>
              <Tab value="history">History</Tab>
            </TabList>
            <TabPanel value="orders">Recent orders.</TabPanel>
            <TabPanel value="returns">Open returns.</TabPanel>
            <TabPanel value="history">Order history.</TabPanel>
          </Tabs>
          <DataGrid<Order> aria-label={`Orders (${density} density)`} data={orders} columns={columns} height={260} locale="en-US" currency="USD" timeZone="UTC" />
        </div>
      </ThemeProvider>
      <p className="demo-status" data-metrics={metrics ? `${metrics.button},${metrics.field},${metrics.row},${metrics.header}` : undefined}>
        {metrics
          ? `Button ${metrics.button}px, field ${metrics.field}px, grid row ${metrics.row}px, grid header ${metrics.header}px`
          : 'Measuring…'}
      </p>
    </section>
  );
}

export default function ThemeDensityDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24 }}>
      {DENSITIES.map((density) => (
        <Column key={density} density={density} />
      ))}
    </div>
  );
}
