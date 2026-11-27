'use client';

import { useState } from 'react';
import { Button, ButtonGroup, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </svg>
);

const LABELS = ['Open', 'Assigned to me', 'Urgent', 'Has attachments'];

// Choice chips (single), filter chips (multiple, with a check) and action chips.
export default function ChipsDemo() {
  const [filters, setFilters] = useState<readonly string[]>(['Open']);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ToggleButtonGroup aria-label="Size" variant="chip" defaultValue="m">
        <ToggleButton value="s">Small</ToggleButton>
        <ToggleButton value="m">Medium</ToggleButton>
        <ToggleButton value="l">Large</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup aria-label="Filters" variant="chip" tone="primary" selectionMode="multiple" value={filters} onValueChange={setFilters}>
        {LABELS.map((label) => (
          <ToggleButton key={label} value={label}>
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <ButtonGroup aria-label="Suggested replies" variant="chip" attached={false}>
        <Button>Sounds good</Button>
        <Button>Thanks!</Button>
        <Button iconStart={<CalendarIcon />}>Schedule a call</Button>
      </ButtonGroup>
      <p style={{ margin: 0 }}>Active filters: {filters.join(', ') || 'none'}</p>
    </div>
  );
}
