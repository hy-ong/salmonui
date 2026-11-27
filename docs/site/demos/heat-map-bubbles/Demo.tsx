'use client';

import { useState } from 'react';
import { HeatMap, type HeatMapAxis, type HeatMapCell } from '@salmonui/charts/heat-map';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const teams = ['Customer onboarding', 'Payments platform', 'Search and discovery', 'Mobile experience', 'Data infrastructure'];
const quarters = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'];
// Engagement score (0-100) and the number of survey responses per team and quarter.
const survey = teams.flatMap((team, t) =>
  quarters.map((quarter, q) => ({
    team,
    quarter,
    score: 52 + ((t * 13 + q * 7) % 41),
    responses: 8 + ((t * 5 + q * 3) % 24),
  })),
);

type Overlap = NonNullable<HeatMapAxis['labelOverlap']>;
type Bubble = 'size' | 'color' | 'sizeAndColor' | 'sector';

/** Survey scores as bubbles: value sets the color, responses the size. */
export default function HeatMapBubblesDemo() {
  const [bubble, setBubble] = useState<Bubble>('sizeAndColor');
  const [overlap, setOverlap] = useState<Overlap>('trim');
  const [xTop, setXTop] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [last, setLast] = useState('none');
  const describe = (c: HeatMapCell) => `${c.yKey}, ${c.xKey}: ${c.value} (${c.size ?? 0} responses)`;
  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Heat map options">
        <label>
          Bubble
          <Select aria-label="Bubble" data={[{ value: 'size', label: 'Size' }, { value: 'color', label: 'Color' }, { value: 'sizeAndColor', label: 'Size and color' }, { value: 'sector', label: 'Sector' }]} value={bubble} onValueChange={(value) => value != null && setBubble(value as Bubble)} />
        </label>
        <label>
          Row labels
          <Select aria-label="Row labels" data={[{ value: 'trim', label: 'Trim' }, { value: 'wrap', label: 'Wrap' }, { value: 'none', label: 'None' }]} value={overlap} onValueChange={(value) => value != null && setOverlap(value as Overlap)} />
        </label>
        <Checkbox checked={xTop} onCheckedChange={(checked) => setXTop(checked)}>
          Quarters on top
        </Checkbox>
        <Checkbox checked={reversed} onCheckedChange={(checked) => setReversed(checked)}>
          Reverse teams
        </Checkbox>
      </div>
      <HeatMap
        title="Engagement survey"
        subtitle="Bubble size: number of responses"
        data={survey}
        xField="quarter"
        yField="team"
        valueField="score"
        sizeField="responses"
        height={380}
        xAxis={{ labels: quarters, position: xTop ? 'top' : 'bottom', labelOverlap: 'rotate45' }}
        yAxis={{ labels: teams, labelOverlap: overlap, maxLabelWidth: 120, reversed }}
        cells={{ shape: 'bubble', bubble, labels: true }}
        colorScale={{ stops: [{ value: 50, color: '#a16207' }, { value: 70, color: '#059669' }, { value: 92, color: '#0a7354' }] }}
        legend={{ position: 'end', title: 'Score' }}
        formatCell={(c) => (c.value >= 85 ? `${c.value}★` : String(c.value))}
        getCellStyle={(c) => ((c.size ?? 0) < 12 ? { color: '#6b7280' } : undefined)}
        tooltip={{
          render: (c) => (
            <span>
              <strong>{c.yKey}</strong>, {c.xKey}: score {c.value}, {c.size ?? 0} responses
              {(c.size ?? 0) < 12 ? ' (too few to trust)' : ''}
            </span>
          ),
        }}
        onCellClick={(c) => setLast(`click ${describe(c)}`)}
        onCellDoubleClick={(c) => setLast(`double click ${describe(c)}`)}
      />
      <p className="demo-status" aria-live="polite">
        Last event: <code>{last}</code>
      </p>
    </div>
  );
}
