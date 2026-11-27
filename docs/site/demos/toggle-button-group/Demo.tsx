'use client';

import { useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';

// A radio group and a multiple-selection group inside a form: the hidden inputs submit with it.
export default function ToggleButtonGroupDemo() {
  const [submitted, setSubmitted] = useState('');
  const [view, setView] = useState<string | null>('week');
  return (
    <form
      style={{ display: 'grid', gap: 12, justifyItems: 'start' }}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(new URLSearchParams([...new FormData(event.currentTarget).entries()].map(([k, v]) => [k, String(v)])).toString());
      }}
    >
      <ToggleButtonGroup aria-label="Alignment" name="align" defaultValue="left" disallowEmpty>
        <ToggleButton value="left">Left</ToggleButton>
        <ToggleButton value="center">Center</ToggleButton>
        <ToggleButton value="right">Right</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup aria-label="Text style" selectionMode="multiple" name="style" variant="outline" defaultValue={['bold']}>
        <ToggleButton value="bold">Bold</ToggleButton>
        <ToggleButton value="italic">Italic</ToggleButton>
        <ToggleButton value="underline">Underline</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup aria-label="Calendar view" value={view} onValueChange={setView} size="sm">
        <ToggleButton value="day">Day</ToggleButton>
        <ToggleButton value="week">Week</ToggleButton>
        <ToggleButton value="month">Month</ToggleButton>
      </ToggleButtonGroup>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" tone="primary">
          Submit
        </Button>
        <Button type="reset">Reset</Button>
      </div>
      <output>
        View: {view ?? 'none'} · Submitted: {submitted || 'nothing yet'}
      </output>
    </form>
  );
}
