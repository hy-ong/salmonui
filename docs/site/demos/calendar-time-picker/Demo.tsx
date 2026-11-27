'use client';

import { useState } from 'react';
import { TimePicker } from '@salmonui/calendars/time-picker';

export default function CalendarTimePickerDemo() {
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <TimePicker label="Start" defaultValue="09:30" min="08:00" max="18:00" isTimeDisabled={(t) => t.hour === 12} clearable onValueChange={(_, d) => setValue(d.iso)} />
      <TimePicker label="Slot" step={60} hourCycle="h23" renderOption={(ctx) => <span>{ctx.text} {ctx.time.hour < 12 ? '(morning)' : '(afternoon)'}</span>} onValueChange={(_, d) => setValue(d.iso)} />
      <TimePicker label="Any minute" step={1} placeholderValue="13:00" onValueChange={(_, d) => setValue(d.iso)} />
      <output style={{ flexBasis: '100%' }}>details.iso: {value || 'none yet (change a field)'}</output>
    </div>
  );
}
