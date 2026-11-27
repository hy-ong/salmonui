'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Slider } from '@salmonui/inputs/slider';

const hours = (value: number | string) => {
  const h = Number(value);
  return `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 === 0 ? '00' : '30'}`;
};

// min / max / step from the toolbar, formatted tick labels, a custom tick
// renderer, a value label formatter and range limits with a fixed thumb.
export default function SliderLimitsDemo() {
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);
  const [step, setStep] = useState(10);
  const [fixed, setFixed] = useState(false);
  const [range, setRange] = useState<readonly [number, number]>([9, 17]);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          min
          <NumberField aria-label="min" value={min} onValueChange={(value) => setMin(value ?? 0)} style={{ inlineSize: 110 }} />
        </label>
        <label>
          max
          <NumberField aria-label="max" value={max} onValueChange={(value) => setMax(value ?? 0)} style={{ inlineSize: 110 }} />
        </label>
        <label>
          step
          <NumberField aria-label="step" value={step} min={1} onValueChange={(value) => setStep(Math.max(1, value ?? 1))} style={{ inlineSize: 110 }} />
        </label>
      </div>
      <div style={{ display: 'grid', gap: 32, maxInlineSize: 420 }}>
        <Slider
          label="Discount"
          min={min}
          max={max}
          step={step}
          defaultValue={20}
          fill
          ticks={{ placement: 'after', majorStep: step * 2, formatOptions: { style: 'unit', unit: 'percent' } }}
          formatOptions={{ style: 'unit', unit: 'percent' }}
          valueLabel={{ show: 'always', format: (value) => `${value} % off` }}
          description="Ticks formatted with ticks.formatOptions; the bubble text comes from valueLabel.format"
        />
        <Slider
          label="Mood"
          min={1}
          max={5}
          defaultValue={3}
          ticks={{ placement: 'after', majorStep: 1 }}
          renderTick={(tick) => <span aria-hidden="true">{['😞', '🙁', '😐', '🙂', '😄'][Number(tick.value) - 1]}</span>}
          valueLabel={{ show: 'hover', format: (value) => ['Awful', 'Bad', 'Okay', 'Good', 'Great'][Number(value) - 1] ?? '' }}
          description="renderTick draws each tick; the value label names the mood"
        />
        <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
          <Checkbox checked={fixed} onCheckedChange={(checked) => setFixed(checked)}>
            limits.startFixed
          </Checkbox>
        </div>
        <Slider
          label="Opening hours"
          min={0}
          max={24}
          step={0.5}
          value={range}
          onValueChange={setRange}
          limits={{ minStart: 6, maxStart: 12, minEnd: 14, maxEnd: 22, startFixed: fixed }}
          ticks={{ placement: 'after', majorStep: 6, minorStep: 1, showMinor: true }}
          valueLabel={{ show: 'focus', format: hours }}
          description="Opening between 06:00 and 12:00, closing between 14:00 and 22:00"
        />
        <output>
          Open {hours(range[0])} to {hours(range[1])}
        </output>
      </div>
    </>
  );
}
