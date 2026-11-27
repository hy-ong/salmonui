'use client';

import { useState } from 'react';
import { Chart, ChartAxis, ChartSeries } from '@salmonui/charts/chart';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Slider } from '@salmonui/inputs/slider';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const base = months.map((month, i) => ({ month, a: 30 + i * 6, b: 50 - i * 3 }));
const shifted = base.map((d, i) => ({ ...d, a: d.a + (i % 2 ? 12 : -8), b: d.b + (i % 2 ? -10 : 9) }));

export default function ChartSizeRtlDemo() {
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(260);
  const [size, setSize] = useState('not measured yet');
  const [animated, setAnimated] = useState(true);
  const [alternate, setAlternate] = useState(false);
  const [rtl, setRtl] = useState(false);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Slider label="Container width (%)" min={40} max={100} step={10} value={width} onValueChange={setWidth} style={{ inlineSize: 160 }} />
        <Slider label="Container height (px)" min={180} max={360} step={20} value={height} onValueChange={setHeight} style={{ inlineSize: 160 }} />
        <Checkbox checked={animated} onCheckedChange={(checked) => setAnimated(checked)}>
          Animated
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => setAlternate((a) => !a)}>
          Change data
        </Button>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ inlineSize: `${width}%` }}>
        {/* No height prop: the chart fills the CSS height of its root and relays out on resize. */}
        <Chart title="Bookings" subtitle="Sized by CSS, series as JSX children" data={alternate ? shifted : base} animated={animated} style={{ height }} onResize={(s) => setSize(`${Math.round(s.width)} × ${Math.round(s.height)}`)} legend={{ position: 'top', align: 'start' }}>
          <ChartAxis id="y" direction="y" title="Rooms" />
          <ChartSeries type="column" name="Hotel A" xField="month" yField="a" />
          <ChartSeries type="line" name="Hotel B" xField="month" yField="b" markers />
        </Chart>
      </div>
      <p className="demo-status" aria-live="polite">
        onResize: <code>{size}</code>
      </p>
    </div>
  );
}
