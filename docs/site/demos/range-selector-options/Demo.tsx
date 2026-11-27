'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { RangeSelector } from '@salmonui/charts/range-selector';

const DAY = 86_400_000;
const START = Date.UTC(2024, 0, 1);
const rainfall = Array.from({ length: 730 }, (_, i) => ({ date: new Date(START + i * DAY), mm: Math.max(0, Math.round(4 + 4 * Math.sin(i / 58) + 3 * Math.sin(i * 0.9))) }));
const sizes = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000].map((kb) => ({ kb, files: Math.round(900 / Math.sqrt(kb)) }));

type Snap = 'off' | 'points' | 'interval';
type Tooltip = 'off' | 'drag' | 'always';
type Overlap = 'none' | 'hide' | 'rotate45' | 'stagger';

export default function RangeSelectorOptionsDemo() {
  const [snap, setSnap] = useState<Snap>('interval');
  const [tooltip, setTooltip] = useState<Tooltip>('always');
  const [inside, setInside] = useState(false);
  const [overlap, setOverlap] = useState<Overlap>('hide');
  const [grid, setGrid] = useState(true);
  const [ticks, setTicks] = useState(true);
  const [submitted, setSubmitted] = useState('');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Snap
          <Select aria-label="Snap" data={[{ value: 'off', label: 'false' }, { value: 'points', label: 'true (data points)' }, { value: 'interval', label: 'interval' }]} value={snap} onValueChange={(value) => value != null && setSnap(value as Snap)} />
        </label>
        <label>
          Tooltip
          <Select aria-label="Tooltip" data={[{ value: 'off', label: 'false' }, { value: 'drag', label: 'true (drag and focus)' }, { value: 'always', label: 'always' }]} value={tooltip} onValueChange={(value) => value != null && setTooltip(value as Tooltip)} />
        </label>
        <label>
          Label overlap
          <Select aria-label="Label overlap" data={[{ value: 'none', label: 'none' }, { value: 'hide', label: 'hide' }, { value: 'rotate45', label: 'rotate45' }, { value: 'stagger', label: 'stagger' }]} value={overlap} onValueChange={(value) => value != null && setOverlap(value as Overlap)} />
        </label>
        <Checkbox checked={inside} onCheckedChange={(checked) => setInside(checked)}>Labels inside</Checkbox>
        <Checkbox checked={grid} onCheckedChange={(checked) => setGrid(checked)}>Grid lines</Checkbox>
        <Checkbox checked={ticks} onCheckedChange={(checked) => setTicks(checked)}>Ticks</Checkbox>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setSubmitted(form.getAll('season').join(' to '));
        }}
      >
        <RangeSelector
          aria-label="Season"
          name="season"
          data={rainfall}
          xField="date"
          yField="mm"
          height={110}
          timeZone="UTC"
          locale="en-US"
          interval={{ unit: 'month', step: 1 }}
          format="MMM"
          groupLabels={{ unit: 'year', align: 'start' }}
          labelPosition={inside ? 'inside' : 'outside'}
          labelOverlap={overlap}
          gridLines={grid}
          ticks={ticks}
          snap={snap === 'off' ? false : snap === 'interval' ? 'interval' : true}
          tooltip={tooltip === 'off' ? false : tooltip === 'always' ? 'always' : { format: 'yMMMd' }}
          defaultValue={[Date.UTC(2024, 3, 1), Date.UTC(2024, 8, 1)]}
          // Always-on tooltips float above the thumbs: keep room for them.
          style={tooltip === 'always' ? { marginBlockStart: 32 } : undefined}
        />
        <div className="demo-toolbar">
          <Button variant="outline" type="submit">Submit</Button>
          <Button variant="outline" type="reset">Reset</Button>
          <span className="demo-status" aria-live="polite">
            {submitted ? `Submitted: ${submitted}` : 'Submit to see the hidden inputs'}
          </span>
        </div>
      </form>
      <RangeSelector
        aria-label="File size"
        scale="log"
        base={10}
        min={1}
        max={10000}
        formatLabel={(kb) => (kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`)}
        tooltip="always"
        defaultValue={[10, 1000]}
        height={70}
        style={{ marginBlockStart: 32 }}
      />
      <RangeSelector aria-label="Rating" scale="linear" min={0} max={10} interval={1} snap="interval" tooltip defaultValue={[3, 8]} height={60} series={[{ type: 'stepLine', data: sizes.map((d, i) => ({ x: i + 1, y: d.files })), xField: 'x', yField: 'y' }]} />
    </div>
  );
}
