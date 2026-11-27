'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Progress, type ProgressTone } from '@salmonui/notifications/progress';
import { Slider } from '@salmonui/inputs/slider';

const TONES: ProgressTone[] = ['primary', 'neutral', 'info', 'success', 'warning', 'danger'];

// Range colors: the tone is a function of the value.
const byValue = (value: number | null): ProgressTone => (value == null ? 'primary' : value < 40 ? 'danger' : value < 80 ? 'warning' : 'success');

// Linear progress bars driven by one value: a labelled upload with a buffer,
// indeterminate, striped and segmented bars, every tone, a custom range and
// a German percent label, and a pointer handler on the root.
export default function ProgressLinearDemo() {
  const [value, setValue] = useState(35);
  const [indeterminate, setIndeterminate] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [hovers, setHovers] = useState(0);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gap: 16, maxInlineSize: 480 }}>
      <div className="demo-toolbar">
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <Slider label="Value" min={0} max={100} value={value} onValueChange={setValue} style={{ inlineSize: 160 }} />
          <output style={{ minInlineSize: '3ch', lineHeight: '24px' }}>{value}</output>
        </span>
        <Checkbox checked={indeterminate} onCheckedChange={(checked) => setIndeterminate(checked)}>
          Indeterminate
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="progress-linear-upload">Upload (buffer, value label)</span>
        <Progress
          aria-labelledby="progress-linear-upload"
          value={indeterminate ? null : value}
          buffer={Math.min(100, value + 20)}
          label
          valueLabel={({ percent }) => (percent == null ? 'Waiting for the server' : `${Math.round(percent)} percent uploaded`)}
          tone={byValue}
          onPointerEnter={() => setHovers(hovers + 1)}
        />
        <output>Pointer entered the bar {hovers} times</output>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="progress-linear-striped">Striped, 12px thick</span>
        <Progress aria-labelledby="progress-linear-striped" value={indeterminate ? null : value} striped thickness={12} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="progress-linear-segmented">Ten segments</span>
        <Progress aria-labelledby="progress-linear-segmented" value={indeterminate ? null : value} segments={10} size="lg" />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="progress-linear-steps">Steps 3 to 12 (min 3, max 12)</span>
        <Progress aria-labelledby="progress-linear-steps" min={3} max={12} value={indeterminate ? null : 3 + (value / 100) * 9} label={({ value: v }) => (v == null ? '' : `Step ${Math.round(v)} of 12`)} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="progress-linear-german">German percent label</span>
        <Progress aria-labelledby="progress-linear-german" locale="de-DE" value={indeterminate ? null : value} label size="sm" />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <span>Every tone</span>
        {TONES.map((tone) => (
          <Progress key={tone} aria-label={`${tone} tone`} tone={tone} value={indeterminate ? null : value} size="sm" />
        ))}
      </div>
    </div>
  );
}
