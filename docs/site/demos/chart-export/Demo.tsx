'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Chart } from '@salmonui/charts/chart';
import type { ChartApi, ChartExportOptions } from '@salmonui/charts/chart';
import { exportVisualizations } from '@salmonui/charts/chart/export';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const revenue = months.map((month, i) => ({ month, online: 120 + i * 14, stores: 160 - i * 6 }));
const share = months.map((month, i) => ({ month, margin: 18 + ((i * 5) % 9) }));

// The writers live in @salmonui/export and load on first use only.
const writers = {
  pdf: () => import('@salmonui/export/graphics'),
  xlsx: () => import('@salmonui/export/xlsx'),
};

export default function ChartExportDemo() {
  const revenueChart = useRef<ChartApi>(null);
  const marginChart = useRef<ChartApi>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');

  const run = async (label: string, task: () => Promise<unknown>) => {
    setStatus(`${label}…`);
    try {
      await task();
      setStatus(`${label}: done`);
    } catch (error) {
      setStatus(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const download = (format: NonNullable<ChartExportOptions['format']>) => run(format.toUpperCase(), () => revenueChart.current!.export({ format, fileName: 'revenue', orientation: 'landscape', pageSize: 'a4' }));

  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Export the revenue chart">
        <Button variant="outline" type="button" onClick={() => download('png')}>PNG</Button>
        <Button variant="outline" type="button" onClick={() => download('jpeg')}>JPEG</Button>
        <Button variant="outline" type="button" onClick={() => download('svg')}>SVG</Button>
        <Button variant="outline" type="button" onClick={() => download('csv')}>CSV</Button>
        <Button variant="outline" type="button" onClick={() => download('xlsx')}>XLSX</Button>
        <Button variant="outline" type="button" onClick={() => download('pdf')}>PDF</Button>
        <Button variant="outline" type="button" onClick={() => run('Print', () => revenueChart.current!.print())}>Print</Button>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Images and combined export">
        <Button variant="outline" type="button" onClick={() => run('toDataURL', async () => setPreview(await revenueChart.current!.toDataURL('png')))}>Preview with toDataURL</Button>
        <Button variant="outline" type="button" onClick={() => run('toBlob', async () => setStatus(`toBlob('svg'): ${(await revenueChart.current!.toBlob('svg')).size} bytes`))}>Measure with toBlob</Button>
        <Button variant="outline" type="button" onClick={() => setStatus(`toSVGString(): ${revenueChart.current!.toSVGString().length} characters`)}>toSVGString</Button>
        <Button variant="outline" type="button" onClick={() => run('Both charts as PNG', () => exportVisualizations([revenueChart.current, marginChart.current], { format: 'png', direction: 'vertical', fileName: 'dashboard.png' }))}>
          Both charts as PNG
        </Button>
        <Button variant="outline"
          type="button"
          onClick={() => run('Both charts as PDF', () => exportVisualizations([revenueChart.current, marginChart.current], { format: 'pdf', direction: 'horizontal', writers: { pdf: writers.pdf }, fileName: 'dashboard.pdf' }))}
        >
          Both charts as PDF
        </Button>
      </div>
      <Chart
        ref={revenueChart}
        title="Revenue by channel"
        data={revenue}
        height={260}
        exportWriters={writers}
        series={[
          { type: 'column', name: 'Online', xField: 'month', yField: 'online' },
          { type: 'column', name: 'Stores', xField: 'month', yField: 'stores' },
        ]}
      />
      <Chart ref={marginChart} title="Margin" data={share} height={200} legend={false} yAxis={{ format: '{value}%' }} series={[{ type: 'line', name: 'Margin', xField: 'month', yField: 'margin', markers: true }]} />
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
      {preview ? <img src={preview} alt="PNG preview of the revenue chart" style={{ maxInlineSize: 320, border: '1px solid var(--salmon-border-subtle)' }} /> : null}
    </div>
  );
}
