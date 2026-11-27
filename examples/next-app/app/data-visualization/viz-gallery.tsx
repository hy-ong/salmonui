'use client';

// One of every visualization family: the server HTML carries the
// final SVG at the nominal size and the client hydrates it without a
// warning; the polar chart is preloaded through `features` so it renders on
// the server too.
import { Barcode, QRCode } from '@salmonui/charts/barcode';
import { Chart } from '@salmonui/charts/chart';
import { BulletChart } from '@salmonui/charts/chart/bullet';
import { polar } from '@salmonui/charts/chart/features';
import { Gauge } from '@salmonui/charts/gauge';
import { GeoMap } from '@salmonui/charts/geo-map';
import { HeatMap } from '@salmonui/charts/heat-map';
import { FunnelChart, PieChart } from '@salmonui/charts/pie-chart';
import { RangeSelector } from '@salmonui/charts/range-selector';
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import { Sparkline } from '@salmonui/charts/sparkline';
import { StockChart } from '@salmonui/charts/stock-chart';
import { ThemeProvider } from '@salmonui/core/theme';
import { TreeMap } from '@salmonui/charts/tree-map';
import { theme } from '../theme';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, i) => ({ month, units: [12, 15, 9, 20, 18, 25][i] as number, region: 'North' }));
const days = Array.from({ length: 60 }, (_, i) => ({ d: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), c: 100 + Math.round(10 * Math.sin(i / 5)) }));
const square = (name: string, x: number) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]] } });

export function VizGallery() {
  return (
    <ThemeProvider theme={theme}>
      <div id="next-viz" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <Chart title="Units" data={months} series={[{ type: 'column', xField: 'month', yField: 'units', name: 'Units' }]} />
        <Chart title="Polar units" coordinate="polar" features={[polar]} data={months} series={[{ type: 'area', xField: 'month', yField: 'units', name: 'Units' }]} />
        <BulletChart title="Target" data={[{ k: 'Q1', v: 40, t: 45 }]} valueField="v" targetField="t" categoryField="k" />
        <StockChart title="Price" data={days} xField="d" closeField="c" toolbar={false} />
        <RangeSelector data={days} xField="d" yField="c" aria-label="Dates" />
        <Sparkline data={months} yField="units" />
        <PieChart title="Share" data={months} valueField="units" labelField="month" />
        <FunnelChart title="Funnel" data={months} valueField="units" labelField="month" />
        <Gauge title="Load" pointers={[{ value: 64 }]} />
        <HeatMap title="Heat" data={months} xField="month" yField="region" valueField="units" />
        <TreeMap title="Tree" data={months} weightField="units" levels={[{ groupBy: 'region' }]} leaves={{ labelField: 'month' }} />
        <SankeyChart title="Flow" nodes={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]} links={[{ source: 'a', target: 'b', value: 3 }, { source: 'b', target: 'c', value: 2 }]} />
        <GeoMap title="Map" layers={[{ shapes: { type: 'FeatureCollection', features: [square('A', 0), square('B', 10)] } }]} />
        <Barcode value="SALMON-123" type="code128" />
        <QRCode value="https://salmon.example" />
      </div>
    </ThemeProvider>
  );
}
