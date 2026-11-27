'use client';

import { useState } from 'react';
import { Gauge } from '@salmonui/charts/gauge';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

/** A thermostat: marker pointers, a draggable comfort range, formatted labels, animation and root events. */
export default function GaugeThermostatDemo() {
  const [indoor, setIndoor] = useState(20.5);
  const [comfort, setComfort] = useState({ from: 19, to: 23 });
  const [animated, setAnimated] = useState(true);
  const [over, setOver] = useState(false);
  const inComfort = indoor >= comfort.from && indoor <= comfort.to;
  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Thermostat">
        <Button variant="outline" type="button" onClick={() => setIndoor((t) => Math.max(10, t - 1.5))}>
          Cooler
        </Button>
        <Button variant="outline" type="button" onClick={() => setIndoor((t) => Math.min(30, t + 1.5))}>
          Warmer
        </Button>
        <Checkbox checked={animated} onCheckedChange={(checked) => setAnimated(checked)}>
          Animate pointers
        </Checkbox>
      </div>
      <div style={{ inlineSize: 300 }}>
        <Gauge
          title="Living room"
          subtitle="Drag either end of the comfort band"
          animated={animated}
          tooltip
          axes={[
            {
              min: 10,
              max: 30,
              ticks: { interval: 5, minor: 1 },
              formatLabel: (v) => `${v}°`,
              ranges: [
                { id: 'cold', from: 10, to: comfort.from, color: '#2563eb', label: 'Too cold' },
                { id: 'comfort', from: comfort.from, to: comfort.to, color: '#15803d', label: 'Comfort', draggable: true, step: 0.5, width: 14 },
                { id: 'warm', from: comfort.to, to: 30, color: '#c2410c', label: 'Too warm' },
              ],
            },
          ]}
          pointers={[
            { id: 'indoor', type: 'marker', shape: 'invertedTriangle', position: 'outside', value: indoor, width: 16, color: 'var(--salmon-text-primary)', label: 'Indoor', valueText: (v) => `${v} °C indoors` },
            { id: 'night', type: 'marker', shape: 'diamond', position: 'inside', value: 16, width: 12, color: '#6b7280', label: 'Night setpoint' },
            {
              id: 'outdoor',
              type: 'marker',
              shape: 'circle',
              position: 'outside',
              value: 12,
              width: 8,
              color: '#a16207',
              label: 'Outdoor',
              valueText: (v) => `${v} °C outdoors`,
              // Custom content (an icon or an image) drawn at the pointer position.
              render: ({ x, y }) => (
                <g stroke="#a16207" strokeWidth={1.5} aria-hidden="true">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
                    const r = (a * Math.PI) / 180;
                    return <line key={a} x1={x + Math.cos(r) * 6} y1={y + Math.sin(r) * 6} x2={x + Math.cos(r) * 9} y2={y + Math.sin(r) * 9} />;
                  })}
                </g>
              ),
            },
            { id: 'eco', type: 'marker', shape: 'text', text: 'ECO', position: 'inside', value: 17, color: '#15803d', label: 'Eco setpoint' },
          ]}
          onRangeChange={(change) => {
            if (change.rangeId === 'comfort') setComfort({ from: change.from, to: change.to });
          }}
          onPointerEnter={() => setOver(true)}
          onPointerLeave={() => setOver(false)}
        />
      </div>
      <p className="demo-status" aria-live="polite">
        Indoor <code>{indoor} °C</code> is {inComfort ? 'inside' : 'outside'} the comfort band <code>{comfort.from}–{comfort.to} °C</code>
        {over ? ' · pointer over the gauge' : ''}
      </p>
    </div>
  );
}
